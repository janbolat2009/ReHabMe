# Known limitations

## Clinical
- No clinical dataset exists; the prediction model cannot be trained or validated yet. Only a demo model on synthetic data is available, and it is clearly labelled.
- Exercise library, screening questionnaire, starting levels and adaptation thresholds are product proposals awaiting rehabilitation-specialist approval (`approval.status = pending_clinical_review`).
- Medical knowledge-base documents are drafts; in production the assistant answers only from approved (platform) documents until clinicians sign off.
- Improvement in app exercises is not evidence of neurological recovery; the UI says so.
- Speech exercises are listen-and-repeat with self-rating; there is no speech recognition or articulation scoring.
- No camera/MediaPipe exercises: not added without evidence of reliability and clear clinical value.

## Technical
- SQLite suits a single-instance pilot. For horizontal scaling move to PostgreSQL: the SQL is portable except `INSERT OR IGNORE` (→ `ON CONFLICT DO NOTHING`), partial unique index syntax (supported) and `node:sqlite` → `pg`.
- Notifications are in-app only (no push/SMS/e-mail reminders yet).
- The ML service holds models in memory with one worker; scale by replicas behind the API.
- E2E tests run against the local auth provider; Firebase-mode E2E needs a dedicated test project.
- `node:sqlite` prints an "experimental" warning on Node 22.
- 46 lint warnings (`vue/require-default-prop`) remain; they are stylistic.
- Large MOV duplicates of motor videos (≈ 238 MB) remain in `public/assets/motorica`; only MP4s are served. Move media to object storage/CDN.

## Product
- No billing (the old payment form was fake). A PCI-DSS provider is required before any paid tier.
- Peer chat removed for privacy and moderation reasons; a moderated community would need its own safety design.
- UI language is Russian only; Kazakh and English localisation are not yet implemented.

## Legal / regulatory
- Privacy policy, terms and disclaimer are drafts requiring legal review.
- Regulatory classification (SaMD or wellness) has not been determined.
