# Architecture

```
 Browser (Vue 3 SPA) ──HTTPS/Bearer──▶  API (Express, Node 22)  ──HTTP (private net)──▶  ML service (FastAPI)
   │  Firebase Auth SDK (prod)             │  SQLite (node:sqlite, WAL)                       │  registry.json + model.joblib (sha256-verified)
   │  local auth (dev/staging only)        │  knowledge/*.md (curated KB, BM25 in-process)
   └─ no health data in browser storage    └─ optional LLM (only with DPA flag + patient consent)
```

## Principles
1. **Two AI systems, never mixed.** The ML model produces quantitative estimates with uncertainty. The LLM only explains, navigates and supports; it never predicts recovery or decides treatment.
2. **Deterministic where safety matters.** Emergency detection, plan changes and abstention are rules, not model output.
3. **Clinician in the loop.** Automatic changes stay inside clinician-set bounds; anything outside is queued for review; every automatic change can be reverted by the clinician.
4. **Honest states.** Unavailable / abstained / demo states are explicit in API and UI.
5. **Least data.** Pseudonymous IDs, encrypted free text, retention limits, nothing identifiable sent to external AI by default.

## Backend modules
| Module | Responsibility |
|---|---|
| `server/config.js` | Validated env config; refuses unsafe production configs |
| `server/auth/tokens.js` | Firebase ID-token verification (Google JWKS, RS256) or local HS256 (non-prod) |
| `server/middleware/core.js` | Request IDs, structured logs (no bodies), JIT user provisioning, RBAC, patient-access check, zod validation, append-only audit, error handler |
| `server/db/` | `node:sqlite` wrapper (re-entrant transactions via SAVEPOINT), SQL migrations, dev seed |
| `server/services/library.js` | Versioned, controlled exercise library with approval metadata |
| `server/services/engine.js` | Screening scoring, initial plan, deterministic daily plan, adaptive difficulty, periodic checks |
| `server/services/analytics.js` | Engagement / performance / clinical — kept separate (no composite score) |
| `server/services/assistant/` | `safety.js` (rules, PII redaction, output guard), `retrieval.js` (BM25 + provenance), `assistant.js` (orchestration) |
| `server/services/mlClient.js` | Timeout-bounded ML client; `allowedMode()` decides demo/research/validated visibility |
| `server/routes/` | `auth` (local), `patient`, `ai` (predictions + assistant), `clinician` |

## Data model (`server/db/migrations/001_initial.sql`)
users · local_credentials · patient_profiles · accessibility_settings · consents (append-only, versioned) · screening_assessments · clinical_assessments · rehab_plans (versioned, never overwritten) · exercise_sessions · exercise_results · recommendations (rationale + engine version) · model_versions · predictions (input snapshot, mode, clinician review) · ai_conversations / ai_messages (encrypted) · notifications · care_relationships · share_codes (hashed) · medications / medication_logs · audit_logs (UPDATE blocked by trigger). Foreign keys with cascades; indexes on `(patient_id, time)`.

## Personalisation flow
`screening → buildInitialPlanDomains` (levels 1–3, max 3; physical exercises held without clearance or with strong shoulder pain; fast-paced tasks held with seizure history) `→ createPlan v1 → buildDailyPlan(date)` (deterministic per patient/day; least-recently-practised first, one exercise per domain, within the time budget) `→ session → results → evaluateAfterSession`: discomfort ≥ 7 → no progression + clinician contact; fatigue ≥ 8 → rest; mean accuracy of last 3 at level ≥ 0.85 (with fatigue ≤ 6, discomfort ≤ 3) → +1; < 0.5 → −1; outside clinician bounds → `pending_clinician`.

## Frontend
Design tokens (`src/styles/tokens.css`) drive light / dark / high-contrast / large-target / wide-spacing / reduced-motion modes via `<html data-*>` attributes. Routes are lazy-loaded (initial JS ≈ 54 KB gzip). Focused flows (onboarding, sessions) have no navigation chrome. Charts are dependency-free accessible SVG with keyboard inspection and screen-reader tables. Fonts are self-hosted (no third-party font CDN).

## Why SQLite
The previous stack had no server database; `node:sqlite` needs no native build, supports WAL and is adequate for a single-instance pilot. SQL is kept portable; the PostgreSQL migration path is in KNOWN_LIMITATIONS.md.
