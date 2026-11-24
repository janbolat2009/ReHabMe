# ReHabMe

Digital rehabilitation platform for stroke survivors: a personalised daily programme of cognitive, memory, attention, motor and speech exercises, progress monitoring, a safety-first AI assistant, a recovery-prediction research pipeline, and a clinician dashboard.

> **Status: research / pre-clinical.** The software is technically deployable; it is **not** clinically validated and is **not** a certified medical device. Medical features are behind release gates — see [`CLINICAL_VALIDATION_PLAN.md`](CLINICAL_VALIDATION_PLAN.md) and [`release-gates.json`](release-gates.json).

## What is in the box

| Area | Where | Notes |
|---|---|---|
| Web app (Vue 3 + Vite) | `src/` | Landing, patient app, 9 interactive exercises + guided media, clinician dashboard, Accessibility Center |
| API (Node 22 + Express) | `server/` | SQLite via built-in `node:sqlite`, migrations, RBAC, consent, audit log, field encryption |
| Personalisation engine | `server/services/engine.js` | Deterministic rules + performance analytics; clinician-bounded |
| AI assistant | `server/services/assistant/` | Safety layer → BM25 retrieval over a curated KB → optional LLM with guards |
| ML pipeline + service | `ml/` | Python: validation, EDA, survival + regression models, conformal intervals, Shapley, OOD abstention, registry, FastAPI |
| Tests | `server/tests/`, `ml/tests/`, `e2e/` | 71 API/safety tests, 8 ML tests, 18 E2E + axe accessibility tests |

## Quick start (local)

Requirements: Node ≥ 22.13, Python 3.12 (only for the ML service).

```bash
npm install
cp .env.example .env               # development defaults; never commit .env
npm run db:seed:dev                # demo patient + clinician with fictional data
npm run dev:api                    # API on :3001
npm run dev                        # web on :5173 (proxies /api)
```

Demo accounts are printed by the seed script (`demo.patient@rehabme.test`, `demo.clinician@rehabme.test`).

Optional ML service (demo model trained on a **synthetic test fixture**, always shown with a "Демо" banner):

```bash
cd ml && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # bin/ on macOS/Linux
.venv/Scripts/python -m rehabme_ml.synthetic --out data/synthetic/fixture.csv
.venv/Scripts/python -m rehabme_ml.train --data data/synthetic/fixture.csv --data-source synthetic_test_fixture --version 0.1.0-demo
.venv/Scripts/python -m uvicorn service:app --host 127.0.0.1 --port 8001
# then ML_ALLOW_DEMO_MODELS=true in .env (never in production — the API refuses to start with it)
```

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Unit, API integration and AI-safety tests (Vitest) |
| `npm run test:e2e` | Patient journey + WCAG 2.2 AA (Playwright + axe) |
| `npm run lint` / `npm run build` | ESLint / production build |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run admin:set-role -- <email> clinician` | Grant a verified clinician role (operator only) |
| `npm run check:release-gates -- --target technical` (or `clinical`) | Release-gate status |
| `cd ml && python -m pytest tests` | ML pipeline tests |

## Documentation

[Architecture](ARCHITECTURE.md) · [API](API_DOCUMENTATION.md) · [ML model](ML_MODEL_DOCUMENTATION.md) · [Dataset](DATASET_DOCUMENTATION.md) · [Model card](MODEL_CARD.md) · [AI safety](AI_SAFETY.md) · [Security](SECURITY.md) · [Deployment](DEPLOYMENT.md) · [Testing](TESTING.md) · [Changelog](CHANGELOG.md) · [Known limitations](KNOWN_LIMITATIONS.md) · [Clinical validation plan](CLINICAL_VALIDATION_PLAN.md)

## Emergency notice

ReHabMe is not for emergencies. Sudden weakness, facial droop, speech or vision problems → call **103 / 112** immediately.
