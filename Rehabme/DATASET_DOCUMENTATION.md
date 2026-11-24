# Dataset documentation

## Current state
- **No clinical dataset is present.** Nothing was found that matches the described "~10,000 patients" dataset.
- `ml/data/synthetic/fixture.csv` is a **synthetic test fixture** (3,000 fabricated patients, ~8 % with two episodes, 3 fictional sites, realistic missingness). It exists only to test the software. A sidecar `*.provenance.json` marks it; the training CLI refuses to relabel it as clinical; the registry forces any model trained on it to `status=demo`.

## Data contract (required for real data — `ml/rehabme_ml/schema.py`)
One row per rehabilitation episode.

| Column | Type | Range | Required | Timing |
|---|---|---|---|---|
| patient_id | pseudonymous string | — | yes | admin |
| site_id | category | — | no (needed for site-level validation) | admin |
| admission_date | date | — | yes (temporal split) | admin |
| age | int | 18–105 | yes | baseline |
| sex | F/M | — | yes | baseline |
| stroke_type | ischemic/hemorrhagic | — | yes | baseline |
| nihss_baseline | float | 0–42 | no | baseline |
| barthel_baseline | float | 0–100 | yes | baseline |
| fma_ue_baseline | float | 0–66 | no (yes for regression) | baseline |
| moca_baseline | float | 0–30 | no | baseline |
| days_onset_to_baseline | int | 0–3650 | yes | baseline |
| hypertension, diabetes, atrial_fibrillation, prior_stroke | 0/1 | — | no | baseline |
| bi95_event | 0/1 | — | survival task | outcome |
| time_to_bi95_days | float | 0–3650 | survival task | outcome |
| fma_ue_90d | float | 0–66 | regression task | outcome |

## Requirements before any real data enters the pipeline
1. Data-sharing agreement and ethics committee approval naming the purpose (model development and validation).
2. Pseudonymisation at source: no names, national IDs (IIN), phone numbers, exact dates of birth.
3. Data dictionary from each site: scale versions, who scored them, when, inter-rater reliability.
4. Documented inclusion/exclusion criteria and follow-up protocol (defines censoring).
5. Storage in an access-controlled, encrypted location outside the repository (`ml/data/` is gitignored).

## Known risks to check in EDA
Selection bias (inpatient rehab centres see a different population than home users), site effects in scoring, informative censoring (drop-outs), ceiling effects on Barthel/FMA, temporal drift in care pathways, under-representation of 80+ and hemorrhagic stroke.
