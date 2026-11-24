"""Cleaning, feature engineering, patient-level/temporal splitting, leakage guards and OOD detection."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .schema import OUTCOME_COLUMNS, coerce

FEATURES = [
    "age", "sex_female", "stroke_hemorrhagic", "nihss_baseline", "barthel_baseline", "fma_ue_baseline",
    "moca_baseline", "days_onset_to_baseline", "hypertension", "diabetes", "atrial_fibrillation", "prior_stroke",
]


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    log = {"rows_in": int(len(df))}
    df = coerce(df).drop_duplicates()
    log["after_exact_dedup"] = int(len(df))
    df = df.sort_values(["patient_id", "admission_date"]).drop_duplicates(subset=["patient_id", "admission_date"], keep="first")
    log["after_key_dedup"] = int(len(df))
    df["sex_female"] = (df["sex"] == "F").astype(float)
    df["stroke_hemorrhagic"] = (df["stroke_type"] == "hemorrhagic").astype(float)
    log["rows_out"] = int(len(df))
    return df.reset_index(drop=True), log


def task_frame(df: pd.DataFrame, task: str) -> pd.DataFrame:
    """Rows usable for a task (target present, milestone not already reached)."""
    if task == "survival":
        d = df[df["bi95_event"].notna() & df["time_to_bi95_days"].notna() & (df["barthel_baseline"] < 95)]
        return d[d["time_to_bi95_days"] > 0]
    if task == "regression":
        return df[df["fma_ue_90d"].notna() & df["fma_ue_baseline"].notna()]
    raise ValueError(task)


def assert_no_leakage(features: list[str]) -> None:
    leaked = set(features) & OUTCOME_COLUMNS
    if leaked:
        raise ValueError(f"outcome columns used as features: {leaked}")


def leakage_screen(df: pd.DataFrame, target: str, features: list[str], threshold: float = 0.95) -> list[str]:
    """Flag features almost perfectly correlated with the target (likely recorded after the outcome)."""
    warnings = []
    for f in features:
        s = df[[f, target]].dropna()
        if len(s) > 30 and s[f].std() > 0 and abs(s[f].corr(s[target])) >= threshold:
            warnings.append(f"{f} has |r|>={threshold} with {target} — check it is measured before baseline")
    return warnings


@dataclass
class Split:
    train: pd.DataFrame
    test: pd.DataFrame
    strategy: str
    info: dict


def split(df: pd.DataFrame, strategy: str = "temporal", test_frac: float = 0.2, seed: int = 0) -> Split:
    """Patient-level split. 'temporal': patients whose FIRST episode is in the latest test_frac of time go to test.
    'group': random patient-level split. Either way no patient appears in both sets."""
    first = df.groupby("patient_id")["admission_date"].min()
    if strategy == "temporal" and first.notna().all():
        cutoff = first.quantile(1 - test_frac)
        test_ids = set(first[first > cutoff].index)
        info = {"cutoff_date": str(pd.Timestamp(cutoff).date())}
    else:
        rng = np.random.default_rng(seed)
        ids = first.index.to_numpy()
        test_ids = set(rng.choice(ids, size=int(len(ids) * test_frac), replace=False))
        info = {}
        strategy = "group"
    test = df[df["patient_id"].isin(test_ids)]
    train = df[~df["patient_id"].isin(test_ids)]
    overlap = set(train["patient_id"]) & set(test["patient_id"])
    assert not overlap, "patient leakage between train and test"
    info.update(train_rows=int(len(train)), test_rows=int(len(test)), train_patients=int(train["patient_id"].nunique()), test_patients=int(test["patient_id"].nunique()))
    return Split(train.reset_index(drop=True), test.reset_index(drop=True), strategy, info)


def preprocessor(features: list[str]) -> Pipeline:
    """Median imputation with missing-indicators, then scaling. Fitted on training data only."""
    return Pipeline([
        ("ct", ColumnTransformer([("num", Pipeline([("impute", SimpleImputer(strategy="median", add_indicator=True)), ("scale", StandardScaler())]), features)])),
    ])


def transformed_names(pre: Pipeline, features: list[str]) -> list[str]:
    imp: SimpleImputer = pre.named_steps["ct"].named_transformers_["num"].named_steps["impute"]
    names = list(features)
    if imp.indicator_ is not None:
        names += [f"missing_{features[i]}" for i in imp.indicator_.features_]
    return names


class OODDetector:
    """Abstain when a patient is unlike the training population: too many missing inputs, values outside the
    training range, or a large Mahalanobis distance (beyond the training 99th percentile)."""

    def __init__(self, features: list[str], max_missing_frac: float = 0.34, required: tuple[str, ...] = ()):
        self.features, self.max_missing_frac, self.required = features, max_missing_frac, required

    def fit(self, X: pd.DataFrame) -> "OODDetector":
        self.lo = X[self.features].quantile(0.005).to_dict()
        self.hi = X[self.features].quantile(0.995).to_dict()
        Z = X[self.features].astype(float)
        self.med = Z.median()
        Zi = Z.fillna(self.med)
        self.mu, self.sd = Zi.mean(), Zi.std().replace(0, 1)
        S = ((Zi - self.mu) / self.sd).to_numpy()
        self.inv_cov = np.linalg.pinv(np.cov(S, rowvar=False))
        d = np.sqrt(np.einsum("ij,jk,ik->i", S, self.inv_cov, S))
        self.threshold = float(np.quantile(d, 0.99))
        return self

    def check(self, row: dict) -> dict:
        reasons = []
        missing_req = [f for f in self.required if row.get(f) is None or (isinstance(row.get(f), float) and np.isnan(row.get(f)))]
        if missing_req:
            reasons.append({"code": "missing_required", "features": missing_req})
        vals = {f: row.get(f) for f in self.features}
        missing = [f for f, v in vals.items() if v is None or (isinstance(v, float) and np.isnan(v))]
        if len(missing) / len(self.features) > self.max_missing_frac:
            reasons.append({"code": "too_many_missing", "features": missing})
        out_of_range = [f for f, v in vals.items() if f not in missing and not (self.lo[f] <= float(v) <= self.hi[f])]
        if out_of_range:
            reasons.append({"code": "outside_training_range", "features": out_of_range})
        z = np.array([((float(vals[f]) if f not in missing else self.med[f]) - self.mu[f]) / self.sd[f] for f in self.features])
        dist = float(np.sqrt(z @ self.inv_cov @ z))
        if dist > self.threshold:
            reasons.append({"code": "atypical_profile", "distance": round(dist, 2), "threshold": round(self.threshold, 2)})
        return {"in_distribution": not reasons, "reasons": reasons, "distance": round(dist, 2)}
