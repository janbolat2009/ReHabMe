"""Input-drift monitoring: Population Stability Index (PSI) of recent model inputs vs. the training data.

  python -m rehabme_ml.drift --reference <training.csv> --recent <recent_inputs.csv>

PSI < 0.1 stable · 0.1–0.25 moderate shift (review) · > 0.25 significant shift (re-validate before continued use).
`recent_inputs.csv` is an export of prediction input snapshots (no identifiers) from the API database.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from .pipeline import FEATURES, clean


def psi(ref: pd.Series, cur: pd.Series, bins: int = 10) -> float | None:
    ref, cur = ref.dropna().astype(float), cur.dropna().astype(float)
    if len(ref) < 50 or len(cur) < 30:
        return None
    edges = np.unique(np.quantile(ref, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:
        return None
    r = np.histogram(ref, edges)[0] / len(ref)
    c = np.histogram(cur.clip(edges[0], edges[-1]), edges)[0] / len(cur)
    r, c = np.clip(r, 1e-4, None), np.clip(c, 1e-4, None)
    return float(np.sum((c - r) * np.log(c / r)))


def report(reference: pd.DataFrame, recent: pd.DataFrame) -> dict:
    out = {}
    for f in FEATURES:
        if f in reference and f in recent:
            v = psi(reference[f], recent[f])
            out[f] = {"psi": None if v is None else round(v, 4), "status": "insufficient_data" if v is None else "stable" if v < 0.1 else "review" if v < 0.25 else "shifted"}
    return {"features": out, "any_shifted": any(x["status"] == "shifted" for x in out.values())}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True)
    ap.add_argument("--recent", required=True)
    a = ap.parse_args()
    ref, _ = clean(pd.read_csv(a.reference))
    rep = report(ref, pd.read_csv(a.recent))
    print(json.dumps(rep, indent=2))
    raise SystemExit(2 if rep["any_shifted"] else 0)
