"""Model wrappers (picklable, self-describing) and candidate families with Optuna tuning under
patient-grouped cross-validation."""
from __future__ import annotations

import warnings

import numpy as np
import optuna
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter, WeibullAFTFitter
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.model_selection import GroupKFold

from .evaluation import c_index
from .pipeline import preprocessor, transformed_names

optuna.logging.set_verbosity(optuna.logging.WARNING)
warnings.filterwarnings("ignore", category=RuntimeWarning)

# Ordered from most to least interpretable — used by the one-standard-error selection rule.
REGRESSION_COMPLEXITY = ["carry_forward", "median", "ridge", "elastic_net", "random_forest", "hist_gradient_boosting"]
SURVIVAL_COMPLEXITY = ["kaplan_meier", "cox_ph", "weibull_aft"]


# ------------------------------------------------------------------ regression
class CarryForward:
    """Naive clinical baseline: predicted 90-day score = baseline score (no change)."""
    def fit(self, X, y):
        return self
    def predict(self, X):
        return np.asarray(X["fma_ue_baseline"], float)


class RegressionModel:
    task = "regression"

    def __init__(self, name, features, estimator, bounds=(0.0, 66.0)):
        self.name, self.features, self.estimator, self.bounds = name, features, estimator, bounds
        self.pre = None if name == "carry_forward" else preprocessor(features)
        self.q = None  # conformal half-width

    def fit(self, df, y):
        if self.pre is None:
            self.estimator.fit(df, y)
        else:
            self.estimator.fit(self.pre.fit_transform(df[self.features]), y)
        return self

    def predict(self, df) -> np.ndarray:
        raw = self.estimator.predict(df) if self.pre is None else self.estimator.predict(self.pre.transform(df[self.features]))
        return np.clip(raw, *self.bounds)

    def interval(self, df):
        yhat = self.predict(df)
        return np.clip(yhat - self.q, *self.bounds), np.clip(yhat + self.q, *self.bounds)

    # scalar output used for explanations
    def explain_output(self, df) -> np.ndarray:
        return self.predict(df)


def regression_space(name, trial):
    if name == "ridge":
        return Ridge(alpha=trial.suggest_float("alpha", 1e-3, 1e3, log=True))
    if name == "elastic_net":
        return ElasticNet(alpha=trial.suggest_float("alpha", 1e-4, 10, log=True), l1_ratio=trial.suggest_float("l1_ratio", 0.05, 0.95), max_iter=5000)
    if name == "random_forest":
        return RandomForestRegressor(n_estimators=trial.suggest_int("n_estimators", 100, 400, step=50), max_depth=trial.suggest_int("max_depth", 3, 12),
                                     min_samples_leaf=trial.suggest_int("min_samples_leaf", 5, 50), n_jobs=-1, random_state=0)
    if name == "hist_gradient_boosting":
        return HistGradientBoostingRegressor(learning_rate=trial.suggest_float("learning_rate", 0.02, 0.2, log=True), max_depth=trial.suggest_int("max_depth", 2, 8),
                                             max_leaf_nodes=trial.suggest_int("max_leaf_nodes", 8, 63), min_samples_leaf=trial.suggest_int("min_samples_leaf", 10, 80),
                                             l2_regularization=trial.suggest_float("l2", 0.0, 1.0), loss="absolute_error", random_state=0)
    raise ValueError(name)


def fixed_regression(name):
    return {"carry_forward": CarryForward(), "median": DummyRegressor(strategy="median")}[name]


def cv_regression(name, est, df, y, groups, features, folds) -> list[float]:
    maes = []
    for tr, va in GroupKFold(n_splits=folds).split(df, y, groups):
        m = RegressionModel(name, features, clone(est) if name != "carry_forward" else CarryForward()).fit(df.iloc[tr], y[tr])
        maes.append(float(np.mean(np.abs(m.predict(df.iloc[va]) - y[va]))))
    return maes


def tune_regression(name, df, y, groups, features, folds, trials, seed):
    if name in ("carry_forward", "median"):
        est = fixed_regression(name)
        return est, {}, cv_regression(name, est, df, y, groups, features, folds)
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(lambda t: float(np.mean(cv_regression(name, regression_space(name, t), df, y, groups, features, folds))), n_trials=trials)
    best = regression_space(name, optuna.trial.FixedTrial(study.best_params))
    return best, study.best_params, cv_regression(name, best, df, y, groups, features, folds)


# ------------------------------------------------------------------ survival
class SurvivalModel:
    """Event = reaching Barthel >= 95 (a GOOD outcome). S(t) = P(milestone not yet reached by day t)."""
    task = "survival"

    def __init__(self, name, features, params=None):
        self.name, self.features, self.params = name, features, params or {}
        self.pre = preprocessor(features)

    def _frame(self, df):
        X = self.pre.transform(df[self.features])
        return pd.DataFrame(X, columns=self.names, index=df.index)

    def fit(self, df, T, E):
        self.pre.fit(df[self.features])
        self.names = transformed_names(self.pre, self.features)
        if self.name == "kaplan_meier":
            self.fitter = KaplanMeierFitter().fit(T, E)
            return self
        X = self._frame(df)
        X["_T"], X["_E"] = np.asarray(T, float), np.asarray(E, int)
        if self.name == "cox_ph":
            self.fitter = CoxPHFitter(penalizer=self.params.get("penalizer", 0.05), l1_ratio=self.params.get("l1_ratio", 0.0))
        else:
            self.fitter = WeibullAFTFitter(penalizer=self.params.get("penalizer", 0.05))
        self.fitter.fit(X, duration_col="_T", event_col="_E")
        return self

    def survival(self, df, grid) -> np.ndarray:
        grid = np.asarray(grid, float)
        if self.name == "kaplan_meier":
            s = self.fitter.predict(grid).to_numpy()
            return np.tile(s, (len(df), 1))
        sf = self.fitter.predict_survival_function(self._frame(df), times=grid)
        return sf.to_numpy().T

    def score(self, df) -> np.ndarray:
        """Higher = longer predicted time to milestone (for the C-index)."""
        if self.name == "kaplan_meier":
            return np.zeros(len(df))
        if self.name == "cox_ph":
            return -self.fitter.predict_partial_hazard(self._frame(df)).to_numpy()
        return self.fitter.predict_expectation(self._frame(df)).to_numpy()

    def explain_output(self, df) -> np.ndarray:
        """Probability of reaching the milestone within 180 days (scalar used for explanations)."""
        return 1 - self.survival(df, [180.0])[:, 0]


def cv_survival(name, params, df, T, E, groups, features, folds) -> list[float]:
    cs = []
    for tr, va in GroupKFold(n_splits=folds).split(df, T, groups):
        m = SurvivalModel(name, features, params).fit(df.iloc[tr], T[tr], E[tr])
        cs.append(c_index(T[va], m.score(df.iloc[va]), E[va]))
    return cs


def tune_survival(name, df, T, E, groups, features, folds, trials, seed):
    if name == "kaplan_meier":
        return {}, cv_survival(name, {}, df, T, E, groups, features, folds)

    def objective(t):
        p = {"penalizer": t.suggest_float("penalizer", 1e-3, 1.0, log=True)}
        if name == "cox_ph":
            p["l1_ratio"] = t.suggest_float("l1_ratio", 0.0, 0.5)
        return float(np.mean(cv_survival(name, p, df, T, E, groups, features, folds)))

    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=trials)
    return study.best_params, cv_survival(name, study.best_params, df, T, E, groups, features, folds)


def one_se_select(results: dict[str, list[float]], order: list[str], higher_is_better: bool) -> str:
    """Pick the simplest model whose CV mean is within one standard error of the best."""
    stats = {k: (np.mean(v), np.std(v, ddof=1) / np.sqrt(len(v))) for k, v in results.items()}
    best = max(stats, key=lambda k: stats[k][0]) if higher_is_better else min(stats, key=lambda k: stats[k][0])
    bm, bse = stats[best]
    for k in order:
        if k not in stats:
            continue
        m = stats[k][0]
        if (higher_is_better and m >= bm - bse) or (not higher_is_better and m <= bm + bse):
            return k
    return best
