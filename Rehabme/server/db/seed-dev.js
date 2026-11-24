// `npm run db:seed:dev` — creates DEMO accounts with clearly fictional data for local development and the
// public demo. Refuses to run in production. Credentials are printed once and are for local use only.
import { config } from '../config.js'
import { openDatabase, migrate, now, uuid, json } from './sqlite.js'
import { hashPassword } from '../lib/crypto.js'
import { buildInitialPlanDomains, createPlan } from '../services/engine.js'
import { LIBRARY_VERSION } from '../services/library.js'
import { CONSENT_VERSIONS } from '../routes/patient.js'

if (config.APP_ENV === 'production') { console.error('Refusing to seed demo data in production.'); process.exit(1) }
if (config.AUTH_PROVIDER !== 'local') { console.error('Seeding requires AUTH_PROVIDER=local.'); process.exit(1) }

const db = openDatabase(config.DATABASE_PATH)
migrate(db)
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo-password-2026'

async function user(email, name, role) {
  const existing = db.get('SELECT * FROM local_credentials WHERE email = ?', email)
  if (existing) return existing.user_id
  const id = uuid(), t = now()
  db.run('INSERT INTO users (id, auth_provider, auth_uid, email, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, 'local', id, email, name, role, t, t)
  db.run('INSERT INTO local_credentials (user_id, email, password_hash) VALUES (?,?,?)', id, email, await hashPassword(DEMO_PASSWORD))
  return id
}

const patientId = await user('demo.patient@rehabme.test', 'Демо Пациент', 'patient')
const clinicianId = await user('demo.clinician@rehabme.test', 'Демо Реабилитолог', 'clinician')

if (!db.get("SELECT 1 FROM rehab_plans WHERE patient_id = ?", patientId)) {
  const t = now()
  for (const c of ['terms', 'privacy', 'health_data_processing']) db.run('INSERT INTO consents (id, user_id, consent_type, version, granted, created_at) VALUES (?,?,?,?,?,?)', uuid(), patientId, c, CONSENT_VERSIONS[c], 1, t)
  db.run('INSERT INTO patient_profiles (user_id, birth_year, sex, stroke_date, stroke_type, affected_side, dominant_hand, goals, sessions_per_week_goal, session_minutes_goal, onboarding_completed_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    patientId, 1961, 'female', new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10), 'ischemic', 'right', 'right', json(['Снова писать от руки', 'Готовить самостоятельно']), 5, 20, t, t)
  const scores = { domainScores: { memory: 50, attention: 38, cognition: 25, motor: 63, speech: 25, wellbeing: 25 }, flags: { physicalExerciseCleared: true, shoulderPain: 'none', seizureHistory: false } }
  db.run('INSERT INTO screening_assessments (id, user_id, instrument, answers, domain_scores, created_at) VALUES (?,?,?,?,?,?)', uuid(), patientId, 'rehabme-selfreport-v1', json({ demo: true }), json(scores), new Date(Date.now() - 21 * 864e5).toISOString())
  createPlan(db, { patientId, domains: buildInitialPlanDomains(scores), sessionsPerWeek: 5, maxSessionMinutes: 20, createdBy: 'seed', createdByRole: 'system', reason: 'demo_seed' })

  // 3 weeks of plausible DEMO practice history (fictional; exists only so charts are not empty in the demo).
  let seed = 42
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const exercises = [['memory-pairs', 'memory'], ['attention-search', 'attention'], ['cognition-sequence', 'cognition'], ['motor-targets', 'motor'], ['memory-words', 'memory']]
  for (let d = 21; d >= 1; d--) {
    if (rnd() < 0.3) continue
    const day = new Date(Date.now() - d * 864e5)
    const sid = uuid()
    db.run('INSERT INTO exercise_sessions (id, patient_id, started_at, ended_at, status, fatigue_before, fatigue_after, discomfort) VALUES (?,?,?,?,?,?,?,?)', sid, patientId, day.toISOString(), new Date(day.getTime() + 18 * 6e4).toISOString(), 'completed', 3, 4, 1)
    for (const [ex, domain] of exercises.slice(0, 3 + Math.floor(rnd() * 2))) {
      const acc = Math.min(1, 0.55 + (21 - d) * 0.012 + rnd() * 0.15)
      db.run('INSERT INTO exercise_results (id, session_id, patient_id, exercise_id, domain, level, completed, duration_ms, accuracy, mean_rt_ms, errors, timed, metrics, library_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        uuid(), sid, patientId, ex, domain, domain === 'motor' ? 1 : 2, 1, Math.round(150000 + rnd() * 120000), +acc.toFixed(3), Math.round(1500 - (21 - d) * 18 + rnd() * 200), Math.round((1 - acc) * 10), 1, json({ demo: true }), LIBRARY_VERSION, day.toISOString())
    }
  }
  db.run("INSERT INTO care_relationships (id, patient_id, clinician_id, status, granted_at) VALUES (?,?,?,'active',?)", uuid(), patientId, clinicianId, t)
  db.run("INSERT INTO clinical_assessments (id, patient_id, scale, score, assessed_at, source, entered_by, created_at) VALUES (?,?,?,?,?,?,?,?)", uuid(), patientId, 'barthel', 65, new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), 'clinician', clinicianId, t)
  db.run("INSERT INTO clinical_assessments (id, patient_id, scale, score, assessed_at, source, entered_by, created_at) VALUES (?,?,?,?,?,?,?,?)", uuid(), patientId, 'fma_ue', 38, new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), 'clinician', clinicianId, t)
  db.run("INSERT INTO clinical_assessments (id, patient_id, scale, score, assessed_at, source, entered_by, created_at) VALUES (?,?,?,?,?,?,?,?)", uuid(), patientId, 'moca', 24, new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 10), 'clinician', clinicianId, t)
  db.run("INSERT INTO clinical_assessments (id, patient_id, scale, score, assessed_at, source, entered_by, created_at) VALUES (?,?,?,?,?,?,?,?)", uuid(), patientId, 'nihss', 7, new Date(Date.now() - 118 * 864e5).toISOString().slice(0, 10), 'clinician', clinicianId, t)
}
console.log('Demo accounts ready (fictional data, local use only):')
console.log('  patient:   demo.patient@rehabme.test')
console.log('  clinician: demo.clinician@rehabme.test')
console.log(`  password:  ${process.env.SEED_PASSWORD ? '(from SEED_PASSWORD)' : DEMO_PASSWORD}`)
db.close()
