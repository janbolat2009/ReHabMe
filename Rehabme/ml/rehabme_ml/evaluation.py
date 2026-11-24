"""Metrics: regression (MAE, RMSE, MedAE, R², interval coverage), survival (Harrell's C, IPCW integrated
Brier score, time-dependent calibration), split-conformal intervals and subgroup error analysis."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.utils import concordance_index
from sklearn.metrics import mean_absolute_error, mean_squared_error, median_absolute_error, r2_score


def regression_metrics(y, yhat, lo=None, hi=None) -> dict:
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    out = {
        "n": int(len(y)),
        "mae": float(mean_absolute_error(y, yhat)),
        "rmse": float(math.sqrt(mean_squared_error(y, yhat))),
        "median_ae": float(median_absolute_error(y, yhat)),
        "r2": float(r2_score(y, yhat)) if len(y) > 1 else None,
    }
    if lo is not None:
        lo, hi = np.asarray(lo, float), np.asarray(hi, float)
        out["interval_coverage"] = float(np.mean((y >= lo) & (y <= hi)))
        out["interval_mean_width"] = float(np.mean(hi - lo))
    return out


def conformal_quantile(abs_residuals, alpha: float) -> float:
    """Split-conformal quantile: finite-sample marginal coverage >= 1 - alpha (exchangeability assumed)."""
    r = np.sort(np.asarray(abs_residuals, float))
    n = len(r)
    k = min(n - 1, int(math.ceil((n + 1) * (1 - alpha))) - 1)
    return float(r[k])


def c_index(T, score, E) -> float:
    """Harrell's C. `score` must be higher for LONGER predicted time to milestone."""
    return float(concordance_index(T, score, E))


def censoring_km(T, E) -> KaplanMeierFitter:
    return KaplanMeierFitter().fit(np.asarray(T, float), event_observed=1 - np.asarray(E, int))


def brier_ipcw(S_t, T, E, t, G: KaplanMeierFitter) -> float:
    """IPCW Brier score at time t. S_t = predicted P(milestone NOT yet reached by t)."""
    T, E, S_t = np.asarray(T, float), np.asarray(E, int), np.asarray(S_t, float)
    G_T = np.clip(G.predict(T).to_numpy(), 1e-3, 1)
    G_t = max(float(G.predict(t)), 1e-3)
    had_event = (T <= t) & (E == 1)
    still_at_risk = T > t
    contrib = np.where(had_event, (S_t ** 2) / G_T, 0) + np.where(still_at_risk, ((1 - S_t) ** 2) / G_t, 0)
    return float(np.mean(contrib))


def integrated_brier(S_grid: np.ndarray, T, E, grid, G: KaplanMeierFitter) -> float:
    scores = [brier_ipcw(S_grid[:, i], T, E, t, G) for i, t in enumerate(grid)]
    return float(np.trapezoid(scores, grid) / (grid[-1] - grid[0]))


def calibration_at(S_t, T, E, t: float, bins: int = 5) -> dict:
    """Time-dependent calibration: predicted vs Kaplan–Meier observed P(milestone by t) in risk quantile groups."""
    p = 1 - np.asarray(S_t, float)
    df = pd.DataFrame({"p": p, "T": T, "E": E})
    df["bin"] = pd.qcut(df["p"].rank(method="first"), bins, labels=False)
    rows = []
    for b, g in df.groupby("bin"):
        km = KaplanMeierFitter().fit(g["T"], g["E"])
        observed = 1 - float(km.predict(t))
        rows.append({"bin": int(b), "n": int(len(g)), "predicted": round(float(g["p"].mean()), 4), "observed": round(observed, 4)})
    err = float(np.mean([abs(r["predicted"] - r["observed"]) for r in rows]))
    return {"t_days": t, "bins": rows, "mean_abs_calibration_error": round(err, 4)}


def subgroup_table(df: pd.DataFrame, metric_fn, min_n: int = 30) -> list[dict]:
    """Error by subgroup to surface systematic bias. Groups smaller than min_n are reported as insufficient."""
    groups = {
        "sex": df["sex"].astype(str),
        "age_band": pd.cut(df["age"], [0, 64, 79, 200], labels=["<65", "65–79", "80+"]).astype(str),
        "stroke_type": df["stroke_type"].astype(str),
    }
    if "site_id" in df and df["site_id"].notna().any():
        groups["site"] = df["site_id"].astype(str)
    out = []
    for gname, gser in groups.items():
        for level in sorted(gser.dropna().unique()):
            idx = (gser == level).to_numpy()
            n = int(idx.sum())
            row = {"group": gname, "level": level, "n": n}
            row.update(metric_fn(idx) if n >= min_n else {"note": f"n<{min_n}: insufficient for reliable estimate"})
            out.append(row)
    return out
