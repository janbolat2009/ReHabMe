# Testing

## Results at time of writing (2026-11-24, Windows 11, Node 22.15, Python 3.12)
| Suite | Command | Result |
|---|---|---|
| AI safety + assistant | `npx vitest run server/tests/safety.test.js server/tests/assistant.test.js` | 43 / 43 passed |
| API integration | `npx vitest run server/tests/api.test.js` | 28 / 28 passed |
| ML pipeline | `cd ml && python -m pytest tests` | 8 / 8 passed |
| E2E journey + accessibility (desktop & mobile) | `npm run test:e2e` | 18 / 18 passed |
| Lint | `npm run lint` | 0 errors (46 `require-default-prop` warnings) |
| Production build | `npm run build` | OK; initial JS ≈ 54 KB gzip, all routes code-split |
| Runtime dependency audit | `npm run audit:deps` | 0 vulnerabilities |

## What is covered
- **Authentication**: missing/forged token, weak password, duplicate email, lockout, roles never taken from tokens.
- **Authorization / isolation**: cross-patient access (404), patient → clinician endpoints (403), clinician without consent (403 + audited), share code single-use, revocation takes effect immediately.
- **Consent**: health-data endpoints blocked until required consents.
- **Personalisation**: conservative initial plan, physical-exercise hold without clearance, level increase after 3 strong results, no increase after high discomfort + clinician-contact recommendation, clinician revert of automatic change, clinician plan update.
- **Analytics**: engagement/performance/clinical separation; no composite score.
- **Data rights**: export; erasure with confirmation; deleted account cannot re-authenticate with an old token.
- **Hardening**: security headers, 413 on oversized bodies, CORS allowlist, append-only audit log.
- **ML**: data validation, leakage guard, patient-level splits (temporal & group), conformal coverage, OOD abstention, end-to-end training → registry → prediction, refusal to mislabel synthetic data, refusal to validate synthetic models, tampered-artefact refusal.
- **Degradation**: ML service down → honest "unavailable"; synthetic models hidden unless demo mode.
- **E2E patient journey**: registration → consents (button disabled until required) → profile → goals → 9-question screening → safety questions → plan (physical exercises held) → exercise session → saved result → check-out → progress analytics → assistant emergency routing and sourced answer → prediction unavailable state → Accessibility Center (high contrast, large targets, no overflow).
- **Accessibility**: axe WCAG 2.0/2.1/2.2 A+AA on public pages (desktop + Pixel 7), skip link first in tab order, visible focus.

## Defects found and fixed by testing
1. Emergency detection missed Russian text — JS `\w` is ASCII-only (now Unicode regexes).
2. Off-topic questions matched a document on one generic word (coverage threshold added).
3. Nested transactions failed (re-entrant SAVEPOINT transactions).
4. Deleted account + valid token caused a 500 (now 401).
5. Onboarding skipped the "About you" step after consents were saved (frozen step list).
6. Skip link not first in tab order on initial load.
7. Horizontal overflow at 375 px (grid min-content sizing, visually-hidden tables).
8. Hero headline clipped by the masked reveal at desktop widths.

## Not covered / manual work required
Screen-reader walkthroughs (NVDA, VoiceOver, TalkBack), switch-access testing, usability sessions with stroke survivors, load testing, penetration test, Firebase-mode E2E (requires a test Firebase project), clinician-led assistant red-teaming.
