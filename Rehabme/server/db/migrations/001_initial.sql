-- ReHabMe schema v1. Timestamps are ISO-8601 UTC strings. IDs are UUIDv4 strings.
-- Sensitive free text (notes, AI message content) is stored AES-256-GCM encrypted (prefix "enc:v1:").

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('firebase','local')),
  auth_uid      TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','clinician','admin')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  UNIQUE (auth_provider, auth_uid)
);

-- Only used by the non-production "local" auth provider (dev/test/staging/demo).
CREATE TABLE local_credentials (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT
);

CREATE TABLE patient_profiles (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birth_year            INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  sex                   TEXT CHECK (sex IN ('female','male','other','undisclosed')),
  stroke_date           TEXT,
  stroke_type           TEXT CHECK (stroke_type IN ('ischemic','hemorrhagic','unknown')),
  affected_side         TEXT CHECK (affected_side IN ('left','right','both','none','unknown')),
  dominant_hand         TEXT CHECK (dominant_hand IN ('left','right','unknown')),
  goals                 TEXT NOT NULL DEFAULT '[]',
  sessions_per_week_goal INTEGER NOT NULL DEFAULT 5 CHECK (sessions_per_week_goal BETWEEN 1 AND 14),
  session_minutes_goal  INTEGER NOT NULL DEFAULT 20 CHECK (session_minutes_goal BETWEEN 5 AND 90),
  onboarding_completed_at TEXT,
  updated_at            TEXT NOT NULL
);

CREATE TABLE accessibility_settings (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings   TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE consents (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms','privacy','health_data_processing','ai_assistant_external','research_use','clinician_sharing')),
  version      TEXT NOT NULL,
  granted      INTEGER NOT NULL CHECK (granted IN (0,1)),
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_consents_user ON consents(user_id, consent_type, created_at);

-- Patient self-report screening at onboarding. NOT a validated clinical scale.
CREATE TABLE screening_assessments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument    TEXT NOT NULL,
  answers       TEXT NOT NULL,
  domain_scores TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_screening_user ON screening_assessments(user_id, created_at);

-- Standardised clinical scales, entered by a clinician (or flagged as patient-reported).
CREATE TABLE clinical_assessments (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scale       TEXT NOT NULL CHECK (scale IN ('barthel','fma_ue','fma_le','moca','mrs','nihss')),
  score       REAL NOT NULL,
  assessed_at TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('clinician','patient_reported')),
  entered_by  TEXT NOT NULL REFERENCES users(id),
  notes       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_clinical_patient ON clinical_assessments(patient_id, scale, assessed_at);

CREATE TABLE rehab_plans (
  id                  TEXT PRIMARY KEY,
  patient_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('active','superseded')),
  domains             TEXT NOT NULL,
  sessions_per_week   INTEGER NOT NULL,
  max_session_minutes INTEGER NOT NULL,
  excluded_exercises  TEXT NOT NULL DEFAULT '[]',
  created_by          TEXT NOT NULL,
  created_by_role     TEXT NOT NULL CHECK (created_by_role IN ('system','clinician','patient')),
  reason              TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX idx_plans_patient ON rehab_plans(patient_id, status, version);

CREATE TABLE exercise_sessions (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id        TEXT REFERENCES rehab_plans(id),
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  status         TEXT NOT NULL CHECK (status IN ('in_progress','completed','stopped')),
  fatigue_before INTEGER CHECK (fatigue_before BETWEEN 0 AND 10),
  fatigue_after  INTEGER CHECK (fatigue_after BETWEEN 0 AND 10),
  discomfort     INTEGER CHECK (discomfort BETWEEN 0 AND 10),
  stop_reason    TEXT,
  notes          TEXT
);
CREATE INDEX idx_sessions_patient ON exercise_sessions(patient_id, started_at);

CREATE TABLE exercise_results (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES exercise_sessions(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id     TEXT NOT NULL,
  domain          TEXT NOT NULL,
  level           INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
  completed       INTEGER NOT NULL CHECK (completed IN (0,1)),
  duration_ms     INTEGER NOT NULL CHECK (duration_ms >= 0),
  accuracy        REAL CHECK (accuracy BETWEEN 0 AND 1),
  mean_rt_ms      REAL CHECK (mean_rt_ms >= 0),
  errors          INTEGER CHECK (errors >= 0),
  timed           INTEGER NOT NULL DEFAULT 1,
  metrics         TEXT NOT NULL DEFAULT '{}',
  library_version TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_results_patient ON exercise_results(patient_id, created_at);
CREATE INDEX idx_results_exercise ON exercise_results(patient_id, exercise_id, created_at);

CREATE TABLE recommendations (
  id                TEXT PRIMARY KEY,
  patient_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN ('difficulty_change','rest','reassessment','clinician_contact','consistency')),
  domain            TEXT,
  payload           TEXT NOT NULL,
  rationale         TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('active','applied','pending_clinician','approved','rejected','dismissed','expired')),
  requires_clinician INTEGER NOT NULL DEFAULT 0,
  engine_version    TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  decided_by        TEXT REFERENCES users(id),
  decided_at        TEXT,
  decision_note     TEXT
);
CREATE INDEX idx_recs_patient ON recommendations(patient_id, status, created_at);

CREATE TABLE model_versions (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  version      TEXT NOT NULL,
  task         TEXT NOT NULL,
  status       TEXT NOT NULL,
  data_source  TEXT NOT NULL,
  metrics      TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  UNIQUE (name, version)
);

CREATE TABLE predictions (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_name     TEXT,
  model_version  TEXT,
  mode           TEXT NOT NULL CHECK (mode IN ('research','demo','validated','none')),
  status         TEXT NOT NULL CHECK (status IN ('ok','abstained','unavailable')),
  target         TEXT,
  input_snapshot TEXT NOT NULL,
  output         TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  review_status  TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','acknowledged','disputed')),
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TEXT,
  review_note    TEXT
);
CREATE INDEX idx_predictions_patient ON predictions(patient_id, created_at);

CREATE TABLE ai_conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  citations       TEXT NOT NULL DEFAULT '[]',
  safety          TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  dedupe_key TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at);

CREATE TABLE care_relationships (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('active','revoked')),
  granted_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE UNIQUE INDEX idx_care_active ON care_relationships(patient_id, clinician_id) WHERE status = 'active';
CREATE INDEX idx_care_clinician ON care_relationships(clinician_id, status);

CREATE TABLE share_codes (
  code_hash  TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE medications (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  time_of_day TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE medication_logs (
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  log_date      TEXT NOT NULL,
  taken_at      TEXT NOT NULL,
  PRIMARY KEY (medication_id, log_date)
);

-- Append-only. Never stores message content or clinical values, only who did what to which resource.
CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  request_id    TEXT,
  actor_id      TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  patient_id    TEXT,
  outcome       TEXT NOT NULL CHECK (outcome IN ('success','denied','error')),
  ip_hash       TEXT,
  details       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_patient ON audit_logs(patient_id, at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, at);
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END;
