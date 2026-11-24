// API integration tests against an in-memory database: authentication, authorization (patient isolation,
// clinician access via consent), consent enforcement, the full exercise→adaptation loop, export/erasure,
// and graceful degradation when the ML service is down.
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { openDatabase, migrate } from '../db/sqlite.js'
import { createApp } from '../app.js'
import { createTokenService } from '../auth/tokens.js'

const config = {
  APP_ENV: 'test', AUTH_PROVIDER: 'local', LOCAL_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), AUDIT_IP_SALT: 's', CORS_ORIGINS: 'http://localhost:5173',
  KB_REQUIRE_APPROVED: true, LLM_EXTERNAL_PROCESSING_APPROVED: false, AI_MESSAGE_RETENTION_DAYS: 90, ML_ALLOW_DEMO_MODELS: false,
  SERVE_STATIC: false, TRUST_PROXY: false, LLM_MODEL: 'x',
}
const log = { info() {}, warn() {}, error() {}, debug() {} }

let mlUp = false
const fakeMl = {
  async status() {
    return mlUp
      ? { available: true, models: [{ name: 'bi95-survival', version: '0.1.0', task: 'survival', status: 'demo', data_source: 'synthetic_test_fixture', target: 'time_to_bi95' }] }
      : { available: false, reason: 'service_unreachable' }
  },
  async predict() { throw new Error('should not be called') },
}

let app, db
const P1 = { email: 'p1@test.kz', password: 'patient-one-pass', displayName: 'Пациент Один' }
const P2 = { email: 'p2@test.kz', password: 'patient-two-pass', displayName: 'Пациент Два' }
const C1 = { email: 'doc@test.kz', password: 'clinician-pass-1', displayName: 'Доктор' }
const tok = {}
const auth = (who) => ({ authorization: `Bearer ${tok[who]}` })
const SCREENING = {
  items: { mem1: 2, mem2: 3, att1: 1, att2: 1, cog1: 0, mot1: 3, mot2: 2, sp1: 1, wb1: 1 },
  safety: { clearance: 'no', pain: 'no', seizures: 'no' },
}

beforeAll(async () => {
  db = openDatabase(':memory:')
  migrate(db)
  ;({ app } = createApp({ config, db, log, ml: fakeMl, tokens: createTokenService(config) }))
  for (const [k, u] of Object.entries({ p1: P1, p2: P2, c1: C1 })) {
    const r = await request(app).post('/api/v1/auth/local/register').send(u)
    expect(r.status).toBe(201)
    tok[k] = r.body.token
  }
  db.run("UPDATE users SET role = 'clinician' WHERE email = ?", C1.email)
})

describe('authentication', () => {
  it('rejects requests without or with a forged token', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401)
    expect((await request(app).get('/api/v1/me').set({ authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x' })).status).toBe(401)
  })
  it('rejects weak passwords and duplicate emails', async () => {
    expect((await request(app).post('/api/v1/auth/local/register').send({ ...P1, email: 'x@test.kz', password: 'short' })).status).toBe(400)
    expect((await request(app).post('/api/v1/auth/local/register').send(P1)).status).toBe(409)
  })
  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/local/login').send({ email: P2.email, password: 'wrong-password-x' })
    const r = await request(app).post('/api/v1/auth/local/login').send({ email: P2.email, password: P2.password })
    expect(r.status).toBe(429)
    db.run('UPDATE local_credentials SET locked_until = NULL, failed_attempts = 0')
  })
  it('never trusts a role claim — new users are patients', async () => {
    const me = await request(app).get('/api/v1/me').set(auth('p1'))
    expect(me.body.role).toBe('patient')
  })
})

describe('consents and onboarding', () => {
  it('blocks health-data processing until required consents are given', async () => {
    const r = await request(app).post('/api/v1/screening').set(auth('p1')).send(SCREENING)
    expect(r.status).toBe(403)
  })
  it('records consents and creates a conservative initial plan', async () => {
    for (const who of ['p1', 'p2']) {
      await request(app).post('/api/v1/me/consents').set(auth(who)).send({ consents: ['terms', 'privacy', 'health_data_processing'].map((type) => ({ type, granted: true })) })
    }
    const r = await request(app).post('/api/v1/screening').set(auth('p1')).send(SCREENING)
    expect(r.status).toBe(201)
    const domains = r.body.plan.domains
    expect(Object.values(domains).every((d) => d.level <= 3 && d.maxLevel === 3)).toBe(true)
    expect(domains.motor.physicalAllowed).toBe(false) // no physician clearance → physical exercises held
    await request(app).post('/api/v1/screening').set(auth('p2')).send(SCREENING)
  })
  it('validates input ranges', async () => {
    const r = await request(app).post('/api/v1/screening').set(auth('p1')).send({ ...SCREENING, items: { mem1: 9 } })
    expect(r.status).toBe(400)
  })
  it('excludes held physical exercises from the daily plan', async () => {
    const r = await request(app).get('/api/v1/today').set(auth('p1'))
    expect(r.status).toBe(200)
    expect(r.body.today.items.length).toBeGreaterThan(0)
    expect(r.body.today.items.some((i) => i.exerciseId === 'motor-video')).toBe(false)
  })
})

describe('exercise sessions and adaptive difficulty', () => {
  const runSession = async (who, results, complete) => {
    const s = await request(app).post('/api/v1/sessions').set(auth(who)).send({ fatigueBefore: 2 })
    expect(s.status).toBe(201)
    for (const r of results) {
      const x = await request(app).post(`/api/v1/sessions/${s.body.sessionId}/results`).set(auth(who)).send(r)
      expect(x.status).toBe(201)
    }
    return request(app).post(`/api/v1/sessions/${s.body.sessionId}/complete`).set(auth(who)).send(complete)
  }
  const result = (accuracy, level) => ({ exerciseId: 'memory-pairs', level, completed: true, durationMs: 120000, accuracy, meanRtMs: 900, errors: 1, metrics: {} })

  it('raises the level after 3 strong results and notifies the patient', async () => {
    const plan = (await request(app).get('/api/v1/plan').set(auth('p1'))).body.plan
    const lvl = plan.domains.memory.level
    let last
    for (let i = 0; i < 3; i++) last = await runSession('p1', [result(0.95, lvl)], { status: 'completed', fatigueAfter: 3, discomfort: 0 })
    expect(last.body.levelChanges).toEqual([{ domain: 'memory', from: lvl, to: lvl + 1 }])
    const notes = await request(app).get('/api/v1/notifications').set(auth('p1'))
    expect(notes.body.some((n) => n.kind === 'plan')).toBe(true)
  })

  it('does not raise difficulty after a high-discomfort session and recommends clinician contact', async () => {
    const r = await runSession('p2', [result(1, 2), result(1, 2), result(1, 2)], { status: 'completed', fatigueAfter: 3, discomfort: 8 })
    expect(r.body.levelChanges).toEqual([])
    const recs = await request(app).get('/api/v1/recommendations').set(auth('p2'))
    expect(recs.body.some((x) => x.type === 'clinician_contact')).toBe(true)
  })

  it('rejects results with out-of-range values or unknown exercises', async () => {
    const s = await request(app).post('/api/v1/sessions').set(auth('p1')).send({})
    expect((await request(app).post(`/api/v1/sessions/${s.body.sessionId}/results`).set(auth('p1')).send({ ...result(1.5, 1) })).status).toBe(400)
    expect((await request(app).post(`/api/v1/sessions/${s.body.sessionId}/results`).set(auth('p1')).send({ ...result(0.5, 1), exerciseId: 'nope' })).status).toBe(400)
  })

  it('separates engagement, performance and clinical analytics', async () => {
    const r = await request(app).get('/api/v1/analytics/summary?period=30').set(auth('p1'))
    expect(r.status).toBe(200)
    expect(r.body.engagement.current.sessions).toBeGreaterThanOrEqual(3)
    expect(r.body.performance.memory.attempts).toBeGreaterThanOrEqual(3)
    expect(r.body).not.toHaveProperty('recoveryScore')
  })
})

describe('patient data isolation', () => {
  it('a patient cannot touch another patient’s session', async () => {
    const s = await request(app).post('/api/v1/sessions').set(auth('p2')).send({})
    const r = await request(app).post(`/api/v1/sessions/${s.body.sessionId}/results`).set(auth('p1')).send({ exerciseId: 'memory-pairs', level: 1, completed: true, durationMs: 1, accuracy: 1, meanRtMs: 1, errors: 0 })
    expect(r.status).toBe(404)
  })
  it('patients cannot use clinician endpoints', async () => {
    expect((await request(app).get('/api/v1/clinician/patients').set(auth('p1'))).status).toBe(403)
  })
  it('a clinician without patient consent gets 403 and the attempt is audited', async () => {
    const p1id = (await request(app).get('/api/v1/me').set(auth('p1'))).body.id
    expect((await request(app).get(`/api/v1/clinician/patients/${p1id}`).set(auth('c1'))).status).toBe(403)
    const audit = db.get("SELECT outcome FROM audit_logs WHERE action = 'clinician.patient.read' ORDER BY id DESC LIMIT 1")
    expect(audit.outcome).toBe('denied')
  })
})

describe('clinician workflow', () => {
  let p1id, recId
  it('gains access only through a patient-issued one-time code', async () => {
    p1id = (await request(app).get('/api/v1/me').set(auth('p1'))).body.id
    const code = (await request(app).post('/api/v1/me/share-codes').set(auth('p1'))).body.code
    expect((await request(app).post('/api/v1/clinician/patients/claim').set(auth('c1')).send({ code })).status).toBe(201)
    expect((await request(app).post('/api/v1/clinician/patients/claim').set(auth('c1')).send({ code })).status).toBe(400) // single use
    const r = await request(app).get(`/api/v1/clinician/patients/${p1id}`).set(auth('c1'))
    expect(r.status).toBe(200)
    expect(r.body.analytics.engagement).toBeDefined()
  })
  it('records clinical assessments with scale-range validation', async () => {
    expect((await request(app).post(`/api/v1/clinician/patients/${p1id}/assessments`).set(auth('c1')).send({ scale: 'barthel', score: 150, assessedAt: '2026-10-01' })).status).toBe(400)
    expect((await request(app).post(`/api/v1/clinician/patients/${p1id}/assessments`).set(auth('c1')).send({ scale: 'barthel', score: 60, assessedAt: '2026-10-01' })).status).toBe(201)
    const own = await request(app).get('/api/v1/assessments').set(auth('p1'))
    expect(own.body.clinical[0].scale).toBe('barthel')
  })
  it('can reject (revert) an automatic difficulty change', async () => {
    const detail = await request(app).get(`/api/v1/clinician/patients/${p1id}`).set(auth('c1'))
    const applied = detail.body.recommendations.find((r) => r.type === 'difficulty_change' && r.status === 'applied')
    recId = applied.id
    expect((await request(app).post(`/api/v1/clinician/recommendations/${recId}/decision`).set(auth('c1')).send({ decision: 'rejected', note: 'Рано' })).status).toBe(200)
    const plan = (await request(app).get('/api/v1/plan').set(auth('p1'))).body.plan
    expect(plan.domains.memory.level).toBe(applied.payload.from)
    expect(plan.createdByRole).toBe('clinician')
  })
  it('enables physical exercises and widens limits through a plan update', async () => {
    const plan = (await request(app).get('/api/v1/plan').set(auth('p1'))).body.plan
    const domains = Object.fromEntries(Object.entries(plan.domains).map(([d, c]) => [d, { enabled: c.enabled, level: c.level, minLevel: 1, maxLevel: 4 }]))
    domains.motor.physicalAllowed = true
    const r = await request(app).put(`/api/v1/clinician/patients/${p1id}/plan`).set(auth('c1')).send({ domains, sessionsPerWeek: 4, maxSessionMinutes: 25, reason: 'После осмотра: разрешены упражнения для рук' })
    expect(r.status).toBe(200)
    expect(r.body.plan.domains.motor.physicalAllowed).toBe(true)
  })
  it('loses access immediately when the patient revokes it', async () => {
    const team = await request(app).get('/api/v1/me/care-team').set(auth('p1'))
    await request(app).delete(`/api/v1/me/care-team/${team.body[0].id}`).set(auth('p1'))
    expect((await request(app).get(`/api/v1/clinician/patients/${p1id}`).set(auth('c1'))).status).toBe(403)
  })
})

describe('prediction service degradation', () => {
  it('reports unavailability honestly when the ML service is down', async () => {
    const r = await request(app).post('/api/v1/predictions').set(auth('p1'))
    expect(r.status).toBe(201)
    expect(r.body.prediction.status).toBe('unavailable')
    expect(r.body.prediction.output.reason).toBe('service_unreachable')
  })
  it('hides synthetic-data models unless demo mode is explicitly enabled', async () => {
    mlUp = true
    const r = await request(app).post('/api/v1/predictions').set(auth('p1'))
    expect(r.body.prediction.status).toBe('unavailable')
    expect(r.body.prediction.output.reason).toBe('no_validated_model')
    mlUp = false
  })
})

describe('assistant endpoint', () => {
  it('stores messages encrypted at rest and routes emergencies', async () => {
    const r = await request(app).post('/api/v1/assistant/messages').set(auth('p1')).send({ message: 'Внезапно онемела рука' })
    expect(r.body.message.safetyRoute).toBe('emergency')
    const raw = db.get("SELECT content FROM ai_messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 1").content
    expect(raw.startsWith('enc:v1:')).toBe(true)
    const hist = await request(app).get('/api/v1/assistant/conversations/latest').set(auth('p1'))
    expect(hist.body.messages[0].content).toBe('Внезапно онемела рука')
  })
})

describe('data portability and erasure', () => {
  it('exports the patient’s own data', async () => {
    const r = await request(app).get('/api/v1/me/export').set(auth('p2'))
    expect(r.status).toBe(200)
    expect(r.body.format).toBe('rehabme-export-v1')
    expect(r.body.sessions.length).toBeGreaterThan(0)
  })
  it('requires explicit confirmation and then erases patient data', async () => {
    expect((await request(app).delete('/api/v1/me').set(auth('p2')).send({ confirm: 'yes' })).status).toBe(400)
    const p2id = (await request(app).get('/api/v1/me').set(auth('p2'))).body.id
    expect((await request(app).delete('/api/v1/me').set(auth('p2')).send({ confirm: 'УДАЛИТЬ' })).status).toBe(200)
    expect(db.get('SELECT COUNT(*) n FROM exercise_results WHERE patient_id = ?', p2id).n).toBe(0)
    expect(db.get('SELECT email FROM users WHERE id = ?', p2id).email).toBeNull()
    expect((await request(app).get('/api/v1/me').set(auth('p2'))).status).toBe(401)
  })
})

describe('hardening', () => {
  it('sets security headers and rejects oversized bodies', async () => {
    const r = await request(app).get('/healthz')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-powered-by']).toBeUndefined()
    const big = await request(app).post('/api/v1/auth/local/login').set('content-type', 'application/json').send(JSON.stringify({ email: 'a@b.kz', password: 'x'.repeat(200_000) }))
    expect(big.status).toBe(413)
  })
  it('does not reflect disallowed CORS origins', async () => {
    const r = await request(app).get('/healthz').set('origin', 'https://evil.example')
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
  })
  it('audit log is append-only', () => {
    expect(() => db.run("UPDATE audit_logs SET action = 'x'")).toThrow(/append-only/)
  })
})
