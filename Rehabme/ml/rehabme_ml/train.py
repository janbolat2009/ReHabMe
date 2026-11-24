"""Reproducible training pipeline.

  python -m rehabme_ml.train --data <csv|parquet> --data-source clinical|synthetic_test_fixture --task all

Steps: ingest → validate → clean → EDA → features → patient-level temporal split → baselines (incl. the
legacy app heuristic) → candidate comparison with Optuna + GroupKFold CV → one-SE model selection →
conformal calibration → held-out test evaluation → subgroup analysis → explainability → serialise →
register → model card.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.cluster import KMeans

from . import __version__, registry
from .eda import eda, to_markdown
from .evaluation import (c_index, calibration_at, censoring_km, conformal_quantile, integrated_brier,
                         regression_metrics, subgroup_table)
from .explain import permutation_importance
from .models import (REGRESSION_COMPLEXITY, SURVIVAL_COMPLEXITY, RegressionModel, SurvivalModel, fixed_regression,
                     one_se_select, tune_regression, tune_survival)
from .pipeline import FEATURES, OODDetector, assert_no_leakage, clean, split, task_frame
from .predict import sha256_file
from .schema import validate

ART = registry.ROOT
SURV_GRID = np.arange(30, 361, 15, dtype=float)


def legacy_heuristic_months(df: pd.DataFrame) -> np.ndarray:
    """The 'AI prediction' shipped in the original app (StatsPage.vue, calculatePersonalized), applied to
    fields that exist in the dataset. Unknown inputs (exercise frequency, mood) take the formula's neutral value."""
    m = np.full(len(df), 6.0)
    m += np.where(df["age"] > 70, 2, 0)
    m += np.where(df["days_onset_to_baseline"] / 30 > 3, 1, 0)
    nihss = df["nihss_baseline"].fillna(0)
    m += np.where(nihss > 20, 3, np.where(nihss > 10, 1, 0))
    return m


def background_summary(train: pd.DataFrame, k: int = 30, seed: int = 0) -> pd.DataFrame:
    """Privacy-preserving SHAP background: k-means centroids instead of real patient rows."""
    X = train[FEATURES].astype(float)
    Xi = X.fillna(X.median())
    km = KMeans(n_clusters=min(k, len(Xi)), n_init=4, random_state=seed).fit(Xi)
    return pd.DataFrame(km.cluster_centers_, columns=FEATURES)


def dataset_hash(df: pd.DataFrame) -> str:
    return hashlib.sha256(pd.util.hash_pandas_object(df, index=False).values.tobytes()).hexdigest()[:16]


def run_survival(sp, cfg, log):
    tr, te = task_frame(sp.train, "survival"), task_frame(sp.test, "survival")
    T, E, g = tr["time_to_bi95_days"].to_numpy(), tr["bi95_event"].to_numpy().astype(int), tr["patient_id"].to_numpy()
    cv = {}
    params = {}
    for name in SURVIVAL_COMPLEXITY:
        params[name], cv[name] = tune_survival(name, tr, T, E, g, FEATURES, cfg.folds, cfg.trials, cfg.seed)
        log(f"  survival/{name}: CV C-index {np.mean(cv[name]):.3f} ± {np.std(cv[name]):.3f}")
    chosen = one_se_select({k: v for k, v in cv.items() if k != "kaplan_meier"}, SURVIVAL_COMPLEXITY, higher_is_better=True)
    model = SurvivalModel(chosen, FEATURES, params[chosen]).fit(tr, T, E)

    Tt, Et = te["time_to_bi95_days"].to_numpy(), te["bi95_event"].to_numpy().astype(int)
    G = censoring_km(T, E)
    grid = SURV_GRID[SURV_GRID < np.quantile(Tt, 0.9)]
    km = SurvivalModel("kaplan_meier", FEATURES).fit(tr, T, E)
    test = {
        "n": int(len(te)), "events": int(Et.sum()),
        "c_index": c_index(Tt, model.score(te), Et),
        "integrated_brier": integrated_brier(model.survival(te, grid), Tt, Et, grid, G),
        "calibration_180d": calibration_at(model.survival(te, [180.0])[:, 0], Tt, Et, 180.0),
    }
    comparison = {
        "legacy_app_heuristic": {"c_index": c_index(Tt, legacy_heuristic_months(te), Et), "integrated_brier": None, "note": "point estimate only; no probabilities, so Brier score is undefined"},
        "kaplan_meier_baseline": {"c_index": 0.5, "integrated_brier": integrated_brier(km.survival(te, grid), Tt, Et, grid, G)},
        f"selected_{chosen}": {"c_index": test["c_index"], "integrated_brier": test["integrated_brier"]},
    }

    def sub_metric(idx):
        return {"c_index": round(c_index(Tt[idx], model.score(te[idx]), Et[idx]), 3)} if Et[idx].sum() >= 10 else {"note": "<10 events"}

    def c_metric(m, d):
        return c_index(d["time_to_bi95_days"].to_numpy(), m.score(d), d["bi95_event"].to_numpy().astype(int))

    return model, chosen, params[chosen], {
        "cv": {k: {"mean": float(np.mean(v)), "std": float(np.std(v))} for k, v in cv.items()},
        "test": test, "comparison": comparison, "subgroups": subgroup_table(te, sub_metric),
        "permutation_importance": permutation_importance(c_metric, model, te, FEATURES, repeats=3),
        "reference_curve": [{"day": int(d), "p": round(float(1 - v), 4)} for d, v in zip(np.arange(7, 366, 7), km.survival(te.iloc[:1], np.arange(7, 366, 7))[0])],
    }, tr


def run_regression(sp, cfg, log):
    tr, te = task_frame(sp.train, "regression"), task_frame(sp.test, "regression")
    # Patient-level split of training data into fit / conformal-calibration parts.
    ids = tr["patient_id"].unique()
    rng = np.random.default_rng(cfg.seed)
    cal_ids = set(rng.choice(ids, size=max(1, int(len(ids) * 0.2)), replace=False))
    fit, cal = tr[~tr["patient_id"].isin(cal_ids)], tr[tr["patient_id"].isin(cal_ids)]
    y, g = fit["fma_ue_90d"].to_numpy(), fit["patient_id"].to_numpy()
    cv, ests, params = {}, {}, {}
    for name in REGRESSION_COMPLEXITY:
        ests[name], params[name], cv[name] = tune_regression(name, fit, y, g, FEATURES, cfg.folds, cfg.trials, cfg.seed)
        log(f"  regression/{name}: CV MAE {np.mean(cv[name]):.2f} ± {np.std(cv[name]):.2f}")
    chosen = one_se_select({k: v for k, v in cv.items() if k not in ("median",)}, REGRESSION_COMPLEXITY, higher_is_better=False)
    model = RegressionModel(chosen, FEATURES, ests[chosen]).fit(fit, y)
    model.q = conformal_quantile(np.abs(cal["fma_ue_90d"].to_numpy() - model.predict(cal)), cfg.alpha)

    yt = te["fma_ue_90d"].to_numpy()
    lo, hi = model.interval(te)
    test = regression_metrics(yt, model.predict(te), lo, hi)
    comparison = {}
    for base in ("median", "carry_forward"):
        b = RegressionModel(base, FEATURES, fixed_regression(base)).fit(fit, y)
        comparison[base] = regression_metrics(yt, b.predict(te))
    comparison[f"selected_{chosen}"] = {k: test[k] for k in ("mae", "rmse", "median_ae", "r2")}

    def sub_metric(idx):
        return {"mae": round(float(np.mean(np.abs(model.predict(te[idx]) - yt[idx]))), 2), "coverage": round(float(np.mean((yt[idx] >= lo[idx]) & (yt[idx] <= hi[idx]))), 3)}

    def neg_mae(m, d):
        return -float(np.mean(np.abs(m.predict(d) - d["fma_ue_90d"].to_numpy())))

    return model, chosen, params[chosen], {
        "cv": {k: {"mean": float(np.mean(v)), "std": float(np.std(v))} for k, v in cv.items()},
        "test": test, "nominal_coverage": 1 - cfg.alpha, "comparison": comparison, "subgroups": subgroup_table(te, sub_metric),
        "permutation_importance": permutation_importance(neg_mae, model, te, FEATURES, repeats=3),
    }, fit


TASKS = {
    "survival": {"name": "bi95-survival", "fn": run_survival, "target": "time_to_bi95",
                 "target_label": "Время до достижения индекса Бартел ≥ 95 (независимость в повседневной активности)", "required": ("barthel_baseline",)},
    "regression": {"name": "fma-ue-90d", "fn": run_regression, "target": "fma_ue_90d",
                   "target_label": "Шкала Фугл-Мейера для руки (FMA-UE) через 90 дней", "required": ("fma_ue_baseline",)},
}


def model_card(entry: dict, rep: dict, eda_rep: dict, cfg) -> str:
    synthetic = entry["data_source"] == "synthetic_test_fixture"
    warn = ("> ⚠️ **SYNTHETIC TEST FIXTURE.** This model was trained on fabricated random data to test the software. "
            "Its metrics say nothing about clinical performance and must not be reported or used for care.\n\n") if synthetic else ""
    m = rep["metrics"]
    lines = [f"# Model card — {entry['name']} v{entry['version']}", "", warn + f"- **Status:** `{entry['status']}`  (data source: `{entry['data_source']}`)",
             f"- **Task / target:** {entry['task']} — {entry['target_label']}", f"- **Algorithm:** {entry['algorithm']} {json.dumps(entry['hyperparameters'])}",
             f"- **Trained:** {entry['trained_at']} · dataset hash `{entry['dataset_hash']}` · split `{rep['split']['strategy']}` {json.dumps(rep['split']['info'])}",
             f"- **Intended use:** decision support for rehabilitation specialists and patient education, shown as a range with uncertainty. Not for diagnosis or treatment decisions.",
             f"- **Not intended for:** acute stroke care, patients outside the training population (the service abstains), patients who already met the milestone.", "",
             "## Held-out test performance", "", "```json", json.dumps(m["test"], indent=2, ensure_ascii=False), "```", "",
             "## Comparison on the same test set", "", "```json", json.dumps(m["comparison"], indent=2, ensure_ascii=False), "```", "",
             "## Cross-validation (patient-grouped, training data only)", "", "```json", json.dumps(m["cv"], indent=2), "```", "",
             "## Subgroup analysis", "", "| group | level | n | metrics |", "|---|---|---|---|"]
    for s in m["subgroups"]:
        rest = {k: v for k, v in s.items() if k not in ("group", "level", "n")}
        lines.append(f"| {s['group']} | {s['level']} | {s['n']} | {json.dumps(rest, ensure_ascii=False)} |")
    lines += ["", "## Global feature importance (permutation)", ""] + [f"- {p['label']}: {p['importance_mean']:.4f} ± {p['importance_std']:.4f}" for p in m["permutation_importance"]]
    lines += ["", "## Limitations", "", "- Associations, not causal effects: explanations describe the model, not what would change outcomes.",
              "- Performance must be re-established on each new site/population before use (site-level validation).",
              "- Inputs rely on clinician-entered scale scores; scoring errors propagate.", f"- Data quality notes: {json.dumps(eda_rep.get('leakage_screen', []), ensure_ascii=False)}", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--data-source", required=True, choices=["clinical", "synthetic_test_fixture"])
    ap.add_argument("--task", default="all", choices=["all", "survival", "regression"])
    ap.add_argument("--version", default="0.1.0")
    ap.add_argument("--split", default="temporal", choices=["temporal", "group"])
    ap.add_argument("--trials", type=int, default=15)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--alpha", type=float, default=0.2, help="1 - nominal interval coverage")
    ap.add_argument("--seed", type=int, default=0)
    cfg = ap.parse_args(argv)
    np.random.seed(cfg.seed)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to a legacy code page

    data_path = Path(cfg.data)
    prov = Path(str(data_path) + ".provenance.json")
    if prov.exists() and json.loads(prov.read_text())["data_source"] == "synthetic_test_fixture" and cfg.data_source != "synthetic_test_fixture":
        raise SystemExit("provenance file says this is the synthetic test fixture — refusing to label it clinical")

    run_dir = ART / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir.mkdir(parents=True, exist_ok=True)
    log_lines = []

    def log(msg):
        print(msg)
        log_lines.append(msg)

    raw = pd.read_parquet(data_path) if data_path.suffix == ".parquet" else pd.read_csv(data_path)
    v = validate(raw)
    (run_dir / "validation.json").write_text(json.dumps(v.to_dict(), indent=2), encoding="utf-8")
    if not v.ok:
        raise SystemExit("data validation failed:\n - " + "\n - ".join(v.errors))
    df, clean_log = clean(raw)
    eda_rep = eda(raw, df)
    (run_dir / "eda.json").write_text(json.dumps(eda_rep, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    (run_dir / "EDA.md").write_text(to_markdown(eda_rep), encoding="utf-8")
    assert_no_leakage(FEATURES)
    sp = split(df, cfg.split, seed=cfg.seed)
    log(f"data: {clean_log} | split {sp.strategy} {sp.info}")

    tasks = ["survival", "regression"] if cfg.task == "all" else [cfg.task]
    for t in tasks:
        spec = TASKS[t]
        log(f"[{t}] training candidates…")
        model, algo, hp, metrics, train_df = spec["fn"](sp, cfg, log)
        ood = OODDetector(FEATURES, required=spec["required"]).fit(train_df)
        artifact = {"model": model, "ood": ood, "background": background_summary(train_df), "features": FEATURES,
                    "reference_curve": metrics.pop("reference_curve", None)}
        out_dir = ART / "models" / spec["name"] / cfg.version
        out_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(artifact, out_dir / "model.joblib")
        entry = {
            "name": spec["name"], "version": cfg.version, "task": t, "target": spec["target"], "target_label": spec["target_label"],
            "algorithm": algo, "hyperparameters": hp, "data_source": cfg.data_source, "dataset_hash": dataset_hash(df),
            "trained_at": datetime.now(timezone.utc).isoformat(), "path": str((out_dir / "model.joblib").relative_to(ART)).replace("\\", "/"),
            "sha256": sha256_file(out_dir / "model.joblib"), "metrics": metrics,
            "environment": {"python": platform.python_version(), "sklearn": sklearn.__version__, "pipeline": __version__, "seed": cfg.seed},
        }
        entry = registry.register(entry)
        report = {"split": {"strategy": sp.strategy, "info": sp.info}, "metrics": metrics}
        (out_dir / "MODEL_CARD.md").write_text(model_card(entry, report, eda_rep, cfg), encoding="utf-8")
        (run_dir / f"{t}_report.json").write_text(json.dumps({**report, "entry": entry}, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        log(f"[{t}] selected {algo} → registered {spec['name']}@{cfg.version} status={entry['status']} test={json.dumps({k: v for k, v in metrics['test'].items() if not isinstance(v, dict)})}")
    (run_dir / "train.log").write_text("\n".join(log_lines), encoding="utf-8")
    print(f"run artefacts: {run_dir}")


if __name__ == "__main__":
    main()
