"""SYNTHETIC TEST FIXTURE generator.

!!! This data is fabricated by a random process for SOFTWARE TESTING and UI DEMONSTRATION only. !!!
Effect sizes are arbitrary, not taken from literature, and carry no clinical meaning. Models trained on
it are force-labelled `data_source=synthetic_test_fixture` / `status=demo` by the registry and are
refused by the API in production. Never report metrics from this data as model performance.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

PROVENANCE = {
    "data_source": "synthetic_test_fixture",
    "warning": "Fabricated random data for software testing only. Not clinical data. Do not report its metrics.",
}


def generate(n_patients: int = 3000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for pid in range(n_patients):
        n_ep = 2 if rng.random() < 0.08 else 1  # some recurrent episodes → tests patient-level splitting
        base_age = int(np.clip(rng.normal(68, 11), 25, 98))
        sex = "F" if rng.random() < 0.45 else "M"
        site = rng.choice(["site_A", "site_B", "site_C"], p=[0.5, 0.3, 0.2])
        start = pd.Timestamp("2019-01-01") + pd.Timedelta(days=int(rng.integers(0, 6 * 365)))
        for ep in range(n_ep):
            age = base_age + ep
            hem = int(rng.random() < 0.15)
            nihss = float(np.clip(rng.gamma(2.0, 3.5), 0, 42))
            barthel = float(np.clip(95 - 3.2 * nihss + rng.normal(0, 12), 0, 100))
            fma = float(np.clip(60 - 2.1 * nihss + rng.normal(0, 9), 0, 66))
            moca = float(np.clip(27 - 0.25 * nihss - 0.06 * (age - 65) + rng.normal(0, 3), 0, 30))
            onset_days = int(np.clip(rng.gamma(2, 6), 1, 120))
            htn, dm, af, prior = (int(rng.random() < p) for p in (0.65, 0.28, 0.2, 0.15 + 0.5 * ep))
            # latent "speed" → Weibull time to Barthel >= 95 (arbitrary coefficients)
            lp = -0.035 * (age - 68) - 0.09 * nihss + 0.03 * (barthel - 60) - 0.4 * hem - 0.25 * dm + 0.004 * onset_days * -1
            scale = np.exp(5.0 - lp * 1.0)
            t_event = scale * rng.weibull(1.4)
            follow = rng.uniform(150, 540)
            event = int(t_event <= follow)
            t_obs = min(t_event, follow)
            gain = (66 - fma) * np.clip(0.35 - 0.012 * nihss - 0.004 * (age - 68) + rng.normal(0, 0.12), 0, 0.9)
            fma90 = float(np.clip(fma + gain + rng.normal(0, 3), 0, 66))
            rec = dict(
                patient_id=f"SYN{pid:05d}", site_id=site, admission_date=(start + pd.Timedelta(days=400 * ep)).date().isoformat(),
                age=age, sex=sex, stroke_type="hemorrhagic" if hem else "ischemic", nihss_baseline=round(nihss, 0),
                barthel_baseline=round(barthel / 5) * 5, fma_ue_baseline=round(fma, 0), moca_baseline=round(moca, 0),
                days_onset_to_baseline=onset_days, hypertension=htn, diabetes=dm, atrial_fibrillation=af, prior_stroke=prior,
                bi95_event=event, time_to_bi95_days=round(t_obs, 1), fma_ue_90d=round(fma90, 0),
            )
            # realistic missingness (MAR-ish)
            for col, p in (("moca_baseline", 0.18), ("fma_ue_baseline", 0.08), ("nihss_baseline", 0.06), ("diabetes", 0.05), ("fma_ue_90d", 0.12)):
                if rng.random() < p:
                    rec[col] = np.nan
            rows.append(rec)
    return pd.DataFrame(rows)


def write(path: str | Path, n_patients: int = 3000, seed: int = 7) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    generate(n_patients, seed).to_csv(path, index=False)
    Path(str(path) + ".provenance.json").write_text(json.dumps(PROVENANCE, indent=2), encoding="utf-8")
    return path


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Write the SYNTHETIC test fixture (not clinical data)")
    ap.add_argument("--out", default="ml/data/synthetic/fixture.csv")
    ap.add_argument("--patients", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    print("wrote", write(a.out, a.patients, a.seed), "— SYNTHETIC TEST FIXTURE, not clinical data")
