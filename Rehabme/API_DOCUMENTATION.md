# API (v1)

Base: `/api/v1`. Auth: `Authorization: Bearer <Firebase ID token | local token>`. JSON only, body ≤ 100 KB.
Errors: `{ "error": { "code", "message", "details?", "requestId" } }` with HTTP 400/401/403/404/409/413/429/500/503.
Rate limits: 1000 req/15 min per IP (all API), 30/15 min on local auth, 60/h assistant messages per user, 30/h predictions per user.

## Health
| | |
|---|---|
| `GET /healthz` | liveness |
| `GET /readyz` | DB check, ML availability (optional), KB size |
| `GET /api/v1/meta` | auth provider, environment |

## Auth (local provider only: dev/test/staging/demo)
`POST /auth/local/register {email, password(≥10), displayName}` → `{token}` · `POST /auth/local/login {email, password}` → `{token}` (5 failures → 15 min lock).

## Patient
| Method & path | Body / query | Notes |
|---|---|---|
| `GET /me` | | profile, consents (+versions), accessibility, `hasPlan`, role |
| `PUT /me/profile` | birthYear, sex, strokeDate, strokeType, affectedSide, dominantHand, goals[], sessionsPerWeekGoal, sessionMinutesGoal, displayName | |
| `PUT /me/accessibility` | fontScale 1–1.6, contrast, motion, largeTargets, oneHanded, disableTimeLimits, readAloud, dyslexiaSpacing, confirmActions | |
| `POST /me/consents` | `{consents:[{type, granted}]}` | append-only history; types: terms, privacy, health_data_processing, ai_assistant_external, research_use, clinician_sharing |
| `GET /screening/instrument` | | self-report questionnaire (not a clinical scale) |
| `POST /screening` | `{items:{id:0–4}, safety:{clearance, pain, seizures}}` | requires consents; creates/updates plan |
| `GET /exercises` | | library + version |
| `GET /plan` | | active plan + version history |
| `GET /today` | | daily plan, week, recommendations, next reassessment |
| `POST /sessions` | `{fatigueBefore}` | |
| `POST /sessions/:id/results` | exerciseId, level, completed, durationMs, accuracy 0–1, meanRtMs, errors, timed, metrics | returns previous attempts |
| `POST /sessions/:id/complete` | status completed/stopped, fatigueAfter, discomfort, stopReason | runs adaptive engine; returns levelChanges |
| `GET /analytics/summary?period=7\|30\|90` | | engagement (+previous period), performance by domain, clinical scales |
| `GET /analytics/history?limit&before` | | sessions with results |
| `GET /analytics/exercise/:id` | | last attempts |
| `GET /assessments` | | clinical + screenings |
| `GET /recommendations` · `POST /recommendations/:id/dismiss` | | |
| `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` | | |
| `GET/POST /medications` · `PUT/DELETE /medications/:id` · `POST /medications/:id/taken` | | personal reminders, not prescriptions |
| `POST /me/share-codes` | | one-time code (24 h) for a clinician |
| `GET /me/care-team` · `DELETE /me/care-team/:id` | | revoke access |
| `GET /me/export` | | full JSON export |
| `DELETE /me` | `{confirm:"УДАЛИТЬ"}` | erasure |

## Prediction & assistant
| | |
|---|---|
| `GET /model/status` | models and how they are displayed here (`demo`/`research`/`validated`/`hidden`) |
| `POST /predictions` · `GET /predictions/latest` | `status`: `ok` / `abstained` / `unavailable`; `mode`: `demo` / `research` / `validated` / `none` |
| `POST /assistant/messages {conversationId?, message}` | → `{message:{content, citations[], actions[], mode, safetyRoute}}` |
| `GET /assistant/conversations/latest` · `DELETE /assistant/conversations` · `GET /assistant/info` | |

## Clinician (role `clinician`; every call checks an active, patient-granted relationship and is audited)
`POST /clinician/patients/claim {code}` · `GET /clinician/patients` · `GET /clinician/patients/:id` · `POST /clinician/patients/:id/assessments {scale, score, assessedAt, notes?}` · `PUT /clinician/patients/:id/plan {domains, sessionsPerWeek, maxSessionMinutes, excludedExercises, reason}` · `POST /clinician/recommendations/:id/decision {decision: approved|rejected, note?}` · `POST /clinician/patients/:id/predictions {comorbidities}` · `POST /clinician/predictions/:id/review {status: acknowledged|disputed, note?}`

## ML service (internal)
`GET /health` · `GET /model` · `POST /predict {features}` · `POST /reload`
