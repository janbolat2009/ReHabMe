# Deployment

## Environments
| | development | staging / demo | production |
|---|---|---|---|
| Template | `.env.example` | `.env.staging.example` | `.env.production.example` |
| Auth | local | local | **Firebase only** (enforced) |
| Data | seeded fictional | fictional only — never real patients | real, encrypted volume |
| ML models shown | demo allowed | demo allowed (labelled) | **validated only** (enforced) |
| KB | drafts allowed | drafts allowed | **approved only** (enforced) |
| External LLM | off | off | off until DPA + DPIA |

`server/config.js` refuses to start production with local auth, demo models, unapproved KB, or missing `DATA_ENCRYPTION_KEY`.

## Build & run
```bash
docker build -t rehabme-api --build-arg VITE_AUTH_PROVIDER=firebase --build-arg VITE_FIREBASE_PROJECT_ID=... .
docker build -t rehabme-ml ./ml
docker compose up -d          # staging stack: api (+ built SPA) and internal-only ml
```
The API image is non-root, serves the SPA with immutable caching and runs migrations on start. Health: `GET /healthz` (liveness), `GET /readyz` (DB + ML + KB).

## Release process
1. CI green (lint, unit/API/safety, ML, E2E + axe, build, dependency audits).
2. `npm run check:release-gates -- --target technical` must pass before production infrastructure deploy.
3. Deploy to **staging first**; run smoke tests and the E2E suite against staging.
4. **Backup before any migration**: `sqlite3 $DATABASE_PATH ".backup '/backups/rehabme-$(date +%F-%H%M).sqlite'"` → then `npm run db:migrate`.
5. Promote the same image to production (immutable tags).
6. Real-patient use of medical features additionally requires `--target clinical` to pass.

## Rollback
- **App**: redeploy the previous image tag. Migrations are additive; never edit an applied migration.
- **Database**: restore the pre-migration backup (`.backup` file) to the volume and restart.
- **Model**: `python -m rehabme_ml.registry rollback <name> <version>` then `POST /reload` on the ML service (or restart). Artefact integrity is re-checked on load.

## Backups
Nightly `.backup` of the SQLite file (or Litestream continuous replication) to encrypted object storage; 30-day retention; quarterly restore drill (gate T5).

## Monitoring
- Structured JSON logs (pino) with request IDs; bodies, tokens and message content are never logged.
- Alerts: `/readyz` failures, 5xx rate, p95 latency, ML abstention rate spikes, PSI drift (`python -m rehabme_ml.drift`).
- Error tracking: plug Sentry or similar into `app.config.errorHandler` (web) and `errorHandler` (API) — scrub PII before sending.

## Legacy Firebase data
Export anything needed from Realtime Database/Firestore, then deploy `firebase/database.rules.json` and `firebase/firestore.rules` (deny-all). Firebase **Authentication** remains in use.
