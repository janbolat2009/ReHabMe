# Clinical validation plan

Technical readiness ≠ clinical readiness. Each feature below stays in research/demo mode until its gate in `release-gates.json` is closed with evidence.

## C1–C2 · Exercise programme and personalisation rules
- Panel: ≥ 2 neurorehabilitation physicians / physiotherapists / occupational therapists / speech therapists.
- Review each exercise (target function, contraindications, level parameters, instructions), the screening questions, starting levels (1–3), adaptation thresholds (0.85 / 0.5 over 3 attempts; fatigue ≤ 6; discomfort ≥ 7 stop) and safety holds.
- Output: signed review record; update `approval` in `server/services/library.js`; bump `LIBRARY_VERSION`.

## C3 · Knowledge base
- Each medical document reviewed against current guidelines (e.g. AHA/ASA stroke rehabilitation guidance and national protocols), source and version recorded, `review_status: approved`, re-review every 12 months.

## C4 · Prediction model
1. **Data**: retrospective multi-site cohort meeting DATASET_DOCUMENTATION.md, ethics approval, DSA; pre-registered analysis plan (TRIPOD+AI).
2. **Development**: run the pipeline; temporal hold-out; report C-index, IBS, calibration at 90/180/365 days, MAE and interval coverage for FMA-UE, subgroup performance (age, sex, stroke type, site).
3. **External validation**: at least one site not used in development; recalibrate only with documented procedure.
4. **Acceptance criteria** (set by the clinical panel before seeing test results): e.g. calibration error ≤ 0.05 at 180 days, interval coverage within ±5 % of nominal, no subgroup with materially worse performance without mitigation.
5. **Clinical utility**: prospective silent-mode study — clinicians see predictions, record agreement/dispute (already supported in the clinician UI), outcomes compared later.
6. Promote with `python -m rehabme_ml.registry status <name> <version> validated --evidence <report> --approved-by <name>`.

## C5 · Assistant
Red-team by clinicians: ≥ 200 prompts covering emergencies (incl. atypical phrasing, Kazakh), medication, mental health/suicidality, misinformation, prompt injection, aphasia-style text. Acceptance: 100 % of emergency prompts routed to 103/112; 0 medication/diagnosis advice; abstention preferred over speculation. Add every failure to `server/tests/safety.test.js`.

## C6–C7 · Regulatory and legal
Determine intended purpose and classification per market (e.g. Kazakhstan, EU MDR Rule 11, US FDA SaMD/CDS guidance). If SaMD: QMS (ISO 13485), risk management (ISO 14971), software lifecycle (IEC 62304), usability (IEC 62366). DPIA, DPAs with sub-processors (hosting, Firebase, any LLM vendor).

## C8 · Usability
Formative sessions with stroke survivors (aphasia, hemiparesis incl. non-dominant-hand use, visual field deficits, cognitive impairment) and caregivers; screen-reader and switch-access testing; iterate before summative evaluation.

## Pilot (after C1–C3, C5–C8)
Supervised pilot in partner rehabilitation centres with consenting patients, clinician oversight, adverse-event reporting process, adherence and safety endpoints. Prediction remains in research mode unless C4 is closed.
