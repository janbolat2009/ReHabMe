"""Exploratory data analysis report: structure, missingness, distributions, outliers, duplicates, patient-level
dependencies, targets/censoring, representativeness and leakage screening."""
from __future__ import annotations

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter

from .pipeline import FEATURES, leakage_screen


def eda(raw: pd.DataFrame, clean_df: pd.DataFrame) -> dict:
    d = clean_df
    num = [c for c in FEATURES + ["time_to_bi95_days", "fma_ue_90d"] if c in d]
    rep: dict = {
        "rows_raw": int(len(raw)), "rows_clean": int(len(d)),
        "patients": int(d["patient_id"].nunique()),
        "episodes_per_patient": d.groupby("patient_id").size().value_counts().sort_index().to_dict(),
        "date_range": [str(d["admission_date"].min().date()), str(d["admission_date"].max().date())],
        "duplicates_removed": int(len(raw) - len(d)),
        "missing_pct": {c: round(float(d[c].isna().mean() * 100), 1) for c in num},
        "numeric_summary": {},
        "outliers_iqr": {},
        "categories": {c: d[c].value_counts(dropna=False).astype(int).to_dict() for c in ("sex", "stroke_type", "site_id") if c in d},
    }
    for c in num:
        s = d[c].dropna()
        if s.empty:
            continue
        q1, q3 = s.quantile([0.25, 0.75])
        iqr = q3 - q1
        rep["numeric_summary"][c] = {k: round(float(v), 2) for k, v in {"mean": s.mean(), "sd": s.std(), "min": s.min(), "p25": q1, "median": s.median(), "p75": q3, "max": s.max()}.items()}
        rep["outliers_iqr"][c] = int(((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).sum())

    surv = d[d["bi95_event"].notna() & (d["barthel_baseline"] < 95)]
    if len(surv):
        km = KaplanMeierFitter().fit(surv["time_to_bi95_days"], surv["bi95_event"])
        rep["survival_target"] = {
            "n": int(len(surv)), "event_rate": round(float(surv["bi95_event"].mean()), 3),
            "censored_pct": round(float((1 - surv["bi95_event"]).mean() * 100), 1),
            "median_followup_days": round(float(surv["time_to_bi95_days"].median()), 1),
            "km_median_days": None if np.isinf(km.median_survival_time_) else round(float(km.median_survival_time_), 1),
            "already_at_milestone_excluded": int((d["barthel_baseline"] >= 95).sum()),
        }
    reg = d[d["fma_ue_90d"].notna()]
    if len(reg):
        ch = reg["fma_ue_90d"] - reg["fma_ue_baseline"]
        rep["regression_target"] = {"n": int(len(reg)), "mean_change": round(float(ch.mean()), 2), "sd_change": round(float(ch.std()), 2), "ceiling_at_66_pct": round(float((reg["fma_ue_90d"] >= 66).mean() * 100), 1)}

    rep["representativeness"] = {
        "age_band": pd.cut(d["age"], [0, 64, 79, 200], labels=["<65", "65–79", "80+"]).value_counts().astype(int).to_dict(),
        "female_pct": round(float((d["sex"] == "F").mean() * 100), 1),
        "hemorrhagic_pct": round(float((d["stroke_type"] == "hemorrhagic").mean() * 100), 1),
        "note": "Compare with the intended-use population before deployment; under-represented groups need targeted validation.",
    }
    rep["leakage_screen"] = leakage_screen(d, "time_to_bi95_days", FEATURES) + leakage_screen(d, "fma_ue_90d", [f for f in FEATURES if f != "fma_ue_baseline"])
    return rep


def to_markdown(rep: dict) -> str:
    lines = ["# EDA report", "", f"- Rows (raw → clean): {rep['rows_raw']} → {rep['rows_clean']}", f"- Patients: {rep['patients']}",
             f"- Episodes per patient: {rep['episodes_per_patient']}", f"- Admission dates: {rep['date_range'][0]} … {rep['date_range'][1]}", "", "## Missing values (%)", ""]
    lines += [f"- {k}: {v}" for k, v in rep["missing_pct"].items()]
    lines += ["", "## Numeric summary", "", "| feature | mean | sd | min | median | max | IQR-outliers |", "|---|---|---|---|---|---|---|"]
    for k, s in rep["numeric_summary"].items():
        lines.append(f"| {k} | {s['mean']} | {s['sd']} | {s['min']} | {s['median']} | {s['max']} | {rep['outliers_iqr'][k]} |")
    for key in ("survival_target", "regression_target", "representativeness"):
        if key in rep:
            lines += ["", f"## {key}", ""] + [f"- {k}: {v}" for k, v in rep[key].items()]
    lines += ["", "## Leakage screen", ""] + ([f"- {w}" for w in rep["leakage_screen"]] or ["- no suspicious features"])
    return "\n".join(lines) + "\n"
