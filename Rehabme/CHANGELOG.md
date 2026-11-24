# Changelog

## 2.0.0 — 2026-11-24
Complete rebuild. The v1 code is preserved at git tag `baseline-original`.

### Added
- Server API (Express) with SQLite schema + migrations, Firebase ID-token verification, RBAC, consent records, append-only audit log, AES-GCM field encryption, rate limiting, CSP/HSTS, export & erasure.
- Personalisation engine: self-report screening, conservative initial plans, safety holds, deterministic daily plans, adaptive difficulty within clinician bounds, versioned plans with rationale.
- 9 interactive exercises (pairs, sequence recall, word recognition, visual search, go/no-go, number sequences, category sort, target tapping, tracking) + guided video/audio/well-being check-in reusing existing media.
- Analytics separating engagement, exercise performance and clinical scales; session history; period comparison.
- Safety-first assistant: deterministic emergency/self-harm/medical-advice routing, curated KB with provenance, BM25 retrieval, abstention, optional guarded LLM.
- Recovery-prediction pipeline and FastAPI service: validation, EDA, patient-level temporal split, Optuna, conformal intervals, survival metrics, subgroup analysis, Shapley explanations, OOD abstention, registry with status rules, drift monitor.
- Clinician dashboard: consented access, plan editor, clinical scales, recommendation and prediction review, printable report.
- New design system and UI: landing page, onboarding, dashboard, Accessibility Center, light/dark/high-contrast, reduced motion, large targets, one-handed mode, read-aloud.
- Tests (Vitest, Supertest, pytest, Playwright + axe), CI, Dockerfiles, compose, release gates, documentation.

### Removed (unsafe or non-functional)
Fake AI document analysis (canned diagnosis), always-"correct" LLM answer grading, unauthenticated LLM proxy, fake card-payment form and paywall, public leaderboard and unmoderated group chat with real names, XP rewards based on reported emotions, hard-coded "95 % recovery" prediction and fabricated charts, non-functional verify-code and reset pages, Google Fonts CDN, unused dependencies (`v-mask`, `pdf-parse`, `cors`, `dotenv`, `chart.js`, `nodemon`).

### Cleanup
Superseded v1 source files (80 files: old pages, per-level program pages, layouts, stores, Firebase client module, PNG icons and images, the unauthenticated `server.js` proxy) were deleted with owner approval. They remain recoverable from git tag `baseline-original`.
