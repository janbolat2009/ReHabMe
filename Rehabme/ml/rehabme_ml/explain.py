"""Explainability: model-agnostic Monte-Carlo Shapley values (interventional) for single predictions and
permutation importance for global behaviour. Explanations describe the MODEL, not causal effects."""
from __future__ import annotations

import numpy as np
import pandas as pd

LABELS_RU = {
    "age": "Возраст", "sex_female": "Пол", "stroke_hemorrhagic": "Тип инсульта", "nihss_baseline": "Тяжесть по NIHSS",
    "barthel_baseline": "Индекс Бартел (исходный)", "fma_ue_baseline": "Fugl-Meyer, рука (исходный)", "moca_baseline": "MoCA (исходный)",
    "days_onset_to_baseline": "Дней от инсульта до начала реабилитации", "hypertension": "Артериальная гипертензия",
    "diabetes": "Сахарный диабет", "atrial_fibrillation": "Фибрилляция предсердий", "prior_stroke": "Инсульт в анамнезе",
}


def shapley(model, x: pd.DataFrame, background: pd.DataFrame, features: list[str], n_perm: int = 40, seed: int = 0) -> dict:
    """phi_j such that base + sum(phi) ≈ f(x). x: single-row DataFrame with raw features."""
    rng = np.random.default_rng(seed)
    d, bg = len(features), len(background)
    phi = np.zeros(d)
    base_vals = []
    xv = x[features].iloc[0]
    for _ in range(n_perm):
        perm = rng.permutation(d)
        frames = []
        for k in range(d + 1):
            z = background.copy()
            for j in perm[:k]:
                z[features[j]] = xv[features[j]]
            frames.append(z)
        preds = model.explain_output(pd.concat(frames, ignore_index=True)).reshape(d + 1, bg).mean(axis=1)
        base_vals.append(preds[0])
        for k in range(d):
            phi[perm[k]] += preds[k + 1] - preds[k]
    phi /= n_perm
    return {"base": float(np.mean(base_vals)), "prediction": float(model.explain_output(x)[0]), "values": dict(zip(features, phi.tolist()))}


def to_factors(sh: dict, x: pd.DataFrame, top: int = 5, unit: str = "") -> list[dict]:
    items = sorted(sh["values"].items(), key=lambda kv: -abs(kv[1]))[:top]
    out = []
    for f, v in items:
        raw = x[f].iloc[0]
        out.append({
            "feature": f, "label": LABELS_RU.get(f, f), "value": None if pd.isna(raw) else float(raw),
            "contribution": round(float(v), 4), "direction": "up" if v > 0 else "down", "unit": unit,
        })
    return out


def permutation_importance(metric, model, df: pd.DataFrame, features: list[str], repeats: int = 5, seed: int = 0) -> list[dict]:
    """metric(model, df) -> score where higher is better. Importance = mean drop when a feature is shuffled."""
    rng = np.random.default_rng(seed)
    base = metric(model, df)
    out = []
    for f in features:
        drops = []
        for _ in range(repeats):
            d = df.copy()
            d[f] = rng.permutation(d[f].to_numpy())
            drops.append(base - metric(model, d))
        out.append({"feature": f, "label": LABELS_RU.get(f, f), "importance_mean": float(np.mean(drops)), "importance_std": float(np.std(drops))})
    return sorted(out, key=lambda r: -r["importance_mean"])
