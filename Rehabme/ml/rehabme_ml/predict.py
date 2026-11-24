"""Inference: load registered artifacts, abstain when appropriate, return ranges + uncertainty + explanations."""
from __future__ import annotations

import hashlib
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import registry
from .explain import shapley, to_factors
from .pipeline import FEATURES

HORIZON_DAYS = 365
GRID = np.arange(7, HORIZON_DAYS + 1, 7, dtype=float)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_active() -> list[dict]:
    """joblib uses pickle, which can execute code. We only load artifacts written by our own training
    pipeline into ml/artifacts, and only if their SHA-256 matches the hash recorded in the registry at
    training time — a tampered or foreign file is refused."""
    loaded = []
    for entry in registry.active():
        path = registry.ROOT / entry["path"]
        if not Path(path).exists():
            continue
        if sha256_file(path) != entry.get("sha256"):
            raise RuntimeError(f"integrity check failed for {entry['name']}@{entry['version']} — refusing to load")
        loaded.append({"entry": entry, "artifact": joblib.load(path)})
    return loaded


def _row(features: dict) -> pd.DataFrame:
    return pd.DataFrame([{f: (np.nan if features.get(f) is None else float(features[f])) for f in FEATURES}])


def _first_crossing(p_curve, level):
    idx = np.argmax(p_curve >= level)
    return None if p_curve[idx] < level else float(GRID[idx])


def predict_one(item: dict, features: dict) -> dict:
    entry, art = item["entry"], item["artifact"]
    model, ood = art["model"], art["ood"]
    meta = {"name": entry["name"], "version": entry["version"], "status": entry["status"], "data_source": entry["data_source"]}
    base = {"model": meta, "task": model.task, "target": entry["target"], "target_label": entry["target_label"]}

    if model.task == "survival" and features.get("barthel_baseline") is not None and float(features["barthel_baseline"]) >= 95:
        return {**base, "status": "abstained", "reason": {"code": "milestone_already_met"}}
    check = ood.check(features)
    if not check["in_distribution"]:
        return {**base, "status": "abstained", "reason": {"code": "out_of_distribution", "details": check["reasons"]}}

    x = _row(features)
    sh = shapley(model, x, art["background"], FEATURES, n_perm=24)
    if model.task == "survival":
        p = 1 - model.survival(x, GRID)[0]
        t25, t50, t75 = (_first_crossing(p, q) for q in (0.25, 0.5, 0.75))
        ref = art["reference_curve"]
        return {
            **base, "status": "ok",
            "prediction": {
                "probability_by_day": {str(d): round(float(1 - model.survival(x, [d])[0, 0]), 3) for d in (90, 180, 365)},
                "median_days": t50, "range_days": {"from": t25, "to": t75, "basis": "between 25% and 75% cumulative probability"},
                "horizon_days": HORIZON_DAYS,
                "curve": [{"day": int(d), "p": round(float(v), 4)} for d, v in zip(GRID, p)],
                "reference_curve": ref,
            },
            "uncertainty": {"c_index_test": entry["metrics"]["test"].get("c_index"), "ibs_test": entry["metrics"]["test"].get("integrated_brier"),
                            "calibration_error_180d": entry["metrics"]["test"].get("calibration_180d", {}).get("mean_abs_calibration_error"), "ood_distance": check["distance"]},
            "explanation": {"output": "P(Barthel ≥ 95 within 180 days)", "base": round(sh["base"], 3), "factors": to_factors(sh, x, unit="prob")},
        }
    yhat = float(model.predict(x)[0])
    lo, hi = (float(v[0]) for v in model.interval(x))
    return {
        **base, "status": "ok",
        "prediction": {"point": round(yhat, 1), "interval": {"low": round(lo, 1), "high": round(hi, 1), "nominal_coverage": entry["metrics"]["nominal_coverage"]},
                       "baseline": features.get("fma_ue_baseline"), "scale_max": 66},
        "uncertainty": {"mae_test": entry["metrics"]["test"].get("mae"), "empirical_coverage_test": entry["metrics"]["test"].get("interval_coverage"), "ood_distance": check["distance"]},
        "explanation": {"output": "Predicted FMA-UE at 90 days", "base": round(sh["base"], 2), "factors": to_factors(sh, x, unit="points")},
    }
