# Security & data protection

## Audit findings in v1 (fixed)
| Finding | Severity | Resolution |
|---|---|---|
| `/api/chat` and `/api/analyze` had no authentication, no rate limit, `cors()` open to all origins, 50 MB bodies | High | Removed; all API routes require verified tokens, CORS allowlist, 100 KB body limit, rate limits |
| Client wrote health data directly to Firebase RTDB/Firestore; security rules not in repo; public leaderboard with names; unmoderated group chat with names | High | Health data moved to server-side DB with per-patient authorisation; deny-all Firebase rules provided (`firebase/`); leaderboard and group chat removed |
| Fake card-payment form collecting card number/CVV with no processor | High | Removed (no billing until a PCI-DSS provider is integrated) |
| `.env` with a live OpenAI key not git-ignored | High | Ignored; **rotate that key** (it existed unprotected on disk and may have been shared) |
| Router guard registered a new auth listener on every navigation | Low | Replaced by a single session store |

## Controls
- **AuthN**: Firebase ID tokens verified server-side (RS256, issuer/audience checks). Local HS256 provider is refused in production by config validation. Local passwords: scrypt (N=16384), lockout after 5 failures.
- **AuthZ / RBAC**: roles only from the database (`admin:set-role` CLI), never from tokens. Every patient-data query is scoped to `req.user.id`; clinicians need an active, patient-granted relationship (one-time 24 h share code, stored hashed, single use; revocable instantly). Denied attempts are audited.
- **Input validation**: zod v4 schemas on every body/query; parameterised SQL only; Vue templates (no `v-html`, lint-enforced) prevent XSS.
- **CSRF**: not applicable — Bearer tokens in headers, no cookies/ambient credentials.
- **Headers**: Helmet with strict CSP (`script-src 'self'`), HSTS in production, `frame-ancestors 'none'`, no-referrer, Permissions-Policy, `Cache-Control: no-store` on API responses.
- **Encryption**: TLS in transit (terminated at the load balancer); AES-256-GCM field encryption for free text (assistant messages, clinician notes); volume-level encryption required for the DB disk.
- **Audit log**: append-only table (UPDATE blocked by trigger) — actor, action, resource, patient, outcome, hashed IP; never content.
- **Privacy**: consents versioned with history; data export; erasure (cascading delete + PII-free tombstone); assistant retention 90 days; PII redaction before any external AI call; external AI disabled unless DPA flag + patient consent.
- **Secrets**: only via environment / secret manager; templates contain placeholders.
- **Supply chain**: `npm audit` (runtime deps: 0 known vulnerabilities after upgrading zod/openai and pinning `@grpc/grpc-js` ≥ 1.13.6) and `pip-audit` in CI.
- **ML artefacts**: SHA-256 verified before unpickling; artefacts mounted read-only.

## Compliance status
No compliance claim is made. Before launch, legal review must determine applicability of the Kazakhstan Law "On Personal Data and Their Protection", GDPR (if EU users), HIPAA (if US covered entities), and medical-device / SaMD rules in each market (gate C6, C7). A DPIA is required because health data is processed at scale.

## Reporting
Security issues: support@rehabme.com (subject "SECURITY"). Please do not open public issues for vulnerabilities.
