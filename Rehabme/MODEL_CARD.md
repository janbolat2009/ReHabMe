# Model card — ReHabMe recovery prediction

Per-version cards with full metrics are generated automatically at `ml/artifacts/models/<name>/<version>/MODEL_CARD.md`. This is the summary card for the currently registered models.

| | bi95-survival | fma-ue-90d |
|---|---|---|
| Version | 0.1.0-demo | 0.1.0-demo |
| Status | **demo** | **demo** |
| Data source | synthetic test fixture | synthetic test fixture |
| Algorithm (selected by 1-SE rule) | Cox PH (penalised) | Ridge regression |
| Output | P(Barthel ≥ 95) by day 90/180/365, median and 25–75 % time range, survival curve | Predicted FMA-UE at 90 d with 80 % conformal interval |

## Intended use (after clinical validation only)
Decision support for rehabilitation specialists and patient education, displayed as ranges with uncertainty and explanations, alongside clinician review (acknowledge / dispute).

## Not intended for
Diagnosis, treatment selection, acute stroke care, prognosis disclosure without a clinician, patients outside the training population (the service abstains), anyone under 18.

## Performance
Not established on real data. Synthetic-fixture metrics (software verification only) are in ML_MODEL_DOCUMENTATION.md and must never be quoted as clinical accuracy.

## Ethical considerations
Explanations are associations, not causes. Subgroup error tables are produced for every training run; groups with n < 30 are flagged as unreliable. Age, sex and stroke type are inputs; their effects must be reviewed for fairness with real data. Patients see the estimate only as a range with a demo/research banner until validated.

## Caveats
Depends on correct clinician-entered scale scores; assumes the training population resembles the deployment population (monitored with PSI drift checks); survival estimates beyond 12 months are not shown.
