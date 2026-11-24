# Recovery-prediction model

## Audit finding (v1)
The previous app advertised an "AI prediction of 95 % recovery". It was a hand-written formula in `StatsPage.vue` (`baseMonths = 6 + 2·[age>70] + 1·[>3 months] + …`) with a hard-coded "current progress" curve. No dataset, training code or model for stroke patients existed in the repository or on the development machine (the only `.pkl` files found belong to an unrelated weather model). The claim of a model trained on ~10,000 patients could not be verified and is not repeated in the product.

## Targets (two, never merged)
| Task | Target | Why |
|---|---|---|
| Survival | Days from rehabilitation baseline to **Barthel Index ≥ 95** (functional independence in ADL), right-censored at end of follow-up | Answers "how long until…" with censoring handled correctly; episodes already ≥ 95 at baseline are excluded |
| Regression | **Fugl-Meyer upper extremity (0–66) at 90 days** | Motor-specific outcome with a standard scale |

## Features
Age, sex, stroke type, NIHSS, Barthel, FMA-UE and MoCA at baseline, days from onset to baseline, hypertension, diabetes, atrial fibrillation, prior stroke. Outcome columns can never be features (`assert_no_leakage`). Therapy intensity is deliberately excluded: it is confounded by indication and would invite causal misreading.

## Pipeline (`python -m rehabme_ml.train`)
1. Ingestion (CSV/Parquet) with provenance check — a file marked as the synthetic fixture cannot be labelled clinical.
2. Validation against the data contract (`schema.py`): types, ranges, categories, duplicates, outcome consistency.
3. Cleaning: exact and key de-duplication, typed coercion, derived binaries.
4. EDA report (`EDA.md`, `eda.json`): missingness, distributions, IQR outliers, episodes per patient, censoring, representativeness, leakage screen.
5. **Patient-level temporal split** (latest 20 % of patients by first admission → test); asserted zero patient overlap. Group split fallback.
6. Baselines: Kaplan–Meier; median; "carry-forward" (FMA at 90 d = baseline); **the legacy app heuristic** (for an apples-to-apples comparison).
7. Candidates: Cox PH (elastic-net penalised), Weibull AFT; Ridge, Elastic Net, Random Forest, HistGradientBoosting.
8. Hyper-parameters: **Optuna** (TPE) with **GroupKFold** CV by patient.
9. Selection: **one-standard-error rule** in order of interpretability — the simplest model statistically indistinguishable from the best wins.
10. Calibration / uncertainty: **split-conformal** intervals for regression (patient-level calibration split, nominal 80 %); survival curves with 25–75 % time range; time-dependent calibration at 180 days.
11. Final evaluation on the untouched test set: C-index, IPCW integrated Brier score, calibration; MAE, RMSE, MedAE, R², interval coverage/width; **subgroup table** (sex, age band, stroke type, site).
12. Explainability: permutation importance (global); **Monte-Carlo Shapley values** per patient (local) against a k-means-centroid background (no real patient rows stored in artefacts).
13. Serialisation: `joblib` artefact + SHA-256 recorded in the registry; the service refuses artefacts whose hash does not match.
14. Registry & API: `registry.json` with status rules (`demo` forced for synthetic data; `validated` requires a signed evidence document; instant rollback via `python -m rehabme_ml.registry rollback`).

## Abstention (the model says "I don't know")
Out-of-distribution detector: missing required inputs, > 34 % of inputs missing, values outside the training 0.5–99.5 % range, or Mahalanobis distance above the training 99th percentile. Also abstains when the milestone is already met. On training-like data abstention is ~2.5 %.

## Results — what can and cannot be said
**No clinical performance can be reported: there is no clinical dataset.** The pipeline was executed end-to-end on the synthetic test fixture to verify the software. On that fixture (fabricated data, meaningless clinically):

| Comparison on the same held-out synthetic test set | C-index | IBS |
|---|---|---|
| Legacy app heuristic | 0.640 | n/a (point estimate only) |
| Kaplan–Meier baseline | 0.500 | 0.217 |
| Selected Cox PH | 0.761 | 0.145 |

Regression on the fixture: carry-forward MAE 5.53 → Ridge 3.30; conformal coverage 80.4 % vs. 80 % nominal (calibration machinery works). These numbers only demonstrate that the code computes what it should. Real performance must be established per CLINICAL_VALIDATION_PLAN.md.

## Serving
FastAPI service on a private network; the Node API decides visibility: production shows only `validated` models; `research` models are hidden in production; `demo` models require `ML_ALLOW_DEMO_MODELS=true` (refused in production) and are labelled "Демонстрационный режим" in the UI.

## Monitoring
`python -m rehabme_ml.drift` computes PSI per feature on recent prediction inputs vs. training data (exit code 2 on significant shift). Latency and abstention rates are logged by the service.

## Retraining with real data
```bash
python -m rehabme_ml.train --data /secure/rehab_episodes.parquet --data-source clinical --version 1.0.0 --trials 60 --folds 5
python -m rehabme_ml.registry list
```
New clinical models register as `research`. Promotion to `validated` requires the evidence package described in CLINICAL_VALIDATION_PLAN.md.
