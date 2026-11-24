// Patient-facing API. Every query is scoped to req.user.id — a patient can never address another patient's rows.
import { Router } from 'express'
import { z } from 'zod'
import { badRequest, notFound, conflict, forbidden } from '../lib/errors.js'
import { validate, requireRole } from '../middleware/core.js'
import { now, uuid, json, parse } from '../db/sqlite.js'
import { sha256, generateShareCode } from '../lib/crypto.js'
import { EXERCISES, EXERCISE_BY_ID, DOMAINS, LIBRARY_VERSION, publicExercise } from '../services/library.js'
import {
  SCREENING_INSTRUMENT, scoreScreening, buildInitialPlanDomains, createPlan, getActivePlan, buildDailyPlan,
  evaluateAfterSession, periodicChecks, nextReassessmentDate,
} from '../services/engine.js'
import { summary, history, exerciseTrend, weeklyProgress } from '../services/analytics.js'

export const CONSENT_VERSIONS = {
  terms: '2026-11', privacy: '2026-11', health_data_processing: '2026-11',
  ai_assistant_external: '2026-11', research_use: '2026-11', clinician_sharing: '2026-11',
}
export const REQUIRED_CONSENTS = ['terms', 'privacy', 'health_data_processing']

export function consentState(db, userId) {
  const rows = db.all('SELECT consent_type, version, granted, created_at FROM consents WHERE user_id = ? ORDER BY created_at', userId)
  const state = {}
  for (const r of rows) state[r.consent_type] = { granted: !!r.granted, version: r.version, at: r.created_at, current: r.version === CONSENT_VERSIONS[r.consent_type] }
  return state
}
const hasRequiredConsents = (db, userId) => {
  const s = consentState(db, userId)
  return REQUIRED_CONSENTS.every((c) => s[c]?.granted && s[c]?.current)
}
export const requireConsents = (ctx) => (req, res, next) =>
  hasRequiredConsents(ctx.db, req.user.id) ? next() : next(forbidden('Необходимо принять условия использования и согласие на обработку данных о здоровье'))

const ACCESSIBILITY_DEFAULTS = {
  fontScale: 1.15, contrast: 'standard', motion: 'system', largeTargets: false, oneHanded: 'off',
  disableTimeLimits: false, readAloud: false, dyslexiaSpacing: false, confirmActions: true,
}
const accessibilitySchema = z.object({
  fontScale: z.number().min(1).max(1.6), contrast: z.enum(['standard', 'high']), motion: z.enum(['system', 'reduced', 'full']),
  largeTargets: z.boolean(), oneHanded: z.enum(['off', 'left', 'right']), disableTimeLimits: z.boolean(), readAloud: z.boolean(),
  dyslexiaSpacing: z.boolean(), confirmActions: z.boolean(),
}).partial()

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 16).nullable().optional(),
  sex: z.enum(['female', 'male', 'other', 'undisclosed']).nullable().optional(),
  strokeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().refine((d) => !d || Date.parse(d) <= Date.now(), 'Дата не может быть в будущем'),
  strokeType: z.enum(['ischemic', 'hemorrhagic', 'unknown']).nullable().optional(),
  affectedSide: z.enum(['left', 'right', 'both', 'none', 'unknown']).nullable().optional(),
  dominantHand: z.enum(['left', 'right', 'unknown']).nullable().optional(),
  goals: z.array(z.string().trim().min(1).max(140)).max(5).optional(),
  sessionsPerWeekGoal: z.number().int().min(1).max(14).optional(),
  sessionMinutesGoal: z.number().int().min(5).max(90).optional(),
})

const resultSchema = z.object({
  exerciseId: z.string().refine((id) => !!EXERCISE_BY_ID[id], 'Неизвестное упражнение'),
  level: z.number().int().min(1).max(5),
  completed: z.boolean(),
  durationMs: z.number().int().min(0).max(3 * 3600e3),
  accuracy: z.number().min(0).max(1).nullable(),
  meanRtMs: z.number().min(0).max(60000).nullable(),
  errors: z.number().int().min(0).max(10000).nullable(),
  timed: z.boolean().default(true),
  metrics: z.record(z.string().max(40), z.union([z.number(), z.string().max(200), z.boolean(), z.null()])).refine((m) => Object.keys(m).length <= 30, 'Слишком много метрик').default({}),
})

function profileDto(user, p) {
  return {
    id: user.id, email: user.email, displayName: user.display_name, role: user.role,
    profile: p ? {
      birthYear: p.birth_year, sex: p.sex, strokeDate: p.stroke_date, strokeType: p.stroke_type, affectedSide: p.affected_side,
      dominantHand: p.dominant_hand, goals: parse(p.goals, []), sessionsPerWeekGoal: p.sessions_per_week_goal,
      sessionMinutesGoal: p.session_minutes_goal, onboardingCompletedAt: p.onboarding_completed_at,
    } : null,
  }
}

const today = () => new Date().toISOString().slice(0, 10)

export function patientRoutes(ctx) {
  const r = Router()
  const { db } = ctx
  const notifyUser = (uid) => ctx.notify(uid)

  // ---------------- Identity, profile, consents, accessibility ----------------
  r.get('/me', (req, res) => {
    const p = db.get('SELECT * FROM patient_profiles WHERE user_id = ?', req.user.id)
    const a = db.get('SELECT settings FROM accessibility_settings WHERE user_id = ?', req.user.id)
    res.json({
      ...profileDto(req.user, p),
      consents: consentState(db, req.user.id),
      consentVersions: CONSENT_VERSIONS,
      requiredConsents: REQUIRED_CONSENTS,
      accessibility: { ...ACCESSIBILITY_DEFAULTS, ...parse(a?.settings, {}) },
      hasPlan: !!getActivePlan(db, req.user.id),
    })
  })

  r.put('/me/profile', validate(profileSchema), (req, res) => {
    const b = req.body, t = now()
    const cur = db.get('SELECT * FROM patient_profiles WHERE user_id = ?', req.user.id)
    const val = (k, col) => (b[k] !== undefined ? b[k] : cur?.[col] ?? null)
    db.transaction((tx) => {
      if (b.displayName) tx.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', b.displayName, t, req.user.id)
      tx.run(
        `INSERT INTO patient_profiles (user_id, birth_year, sex, stroke_date, stroke_type, affected_side, dominant_hand, goals, sessions_per_week_goal, session_minutes_goal, onboarding_completed_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET birth_year=excluded.birth_year, sex=excluded.sex, stroke_date=excluded.stroke_date, stroke_type=excluded.stroke_type,
           affected_side=excluded.affected_side, dominant_hand=excluded.dominant_hand, goals=excluded.goals, sessions_per_week_goal=excluded.sessions_per_week_goal,
           session_minutes_goal=excluded.session_minutes_goal, updated_at=excluded.updated_at`,
        req.user.id, val('birthYear', 'birth_year'), val('sex', 'sex'), val('strokeDate', 'stroke_date'), val('strokeType', 'stroke_type'),
        val('affectedSide', 'affected_side'), val('dominantHand', 'dominant_hand'), json(b.goals ?? parse(cur?.goals, [])),
        b.sessionsPerWeekGoal ?? cur?.sessions_per_week_goal ?? 5, b.sessionMinutesGoal ?? cur?.session_minutes_goal ?? 20, cur?.onboarding_completed_at ?? null, t,
      )
    })
    ctx.audit(req, { action: 'profile.update', resourceType: 'patient_profile', resourceId: req.user.id, patientId: req.user.id })
    const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id)
    res.json(profileDto(user, db.get('SELECT * FROM patient_profiles WHERE user_id = ?', req.user.id)))
  })

  r.put('/me/accessibility', validate(accessibilitySchema), (req, res) => {
    const cur = parse(db.get('SELECT settings FROM accessibility_settings WHERE user_id = ?', req.user.id)?.settings, {})
    const merged = { ...ACCESSIBILITY_DEFAULTS, ...cur, ...req.body }
    db.run('INSERT INTO accessibility_settings (user_id, settings, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings, updated_at=excluded.updated_at', req.user.id, json(merged), now())
    res.json(merged)
  })

  r.post('/me/consents', validate(z.object({
    consents: z.array(z.object({ type: z.enum(Object.keys(CONSENT_VERSIONS)), granted: z.boolean() })).min(1).max(10),
  })), (req, res) => {
    const t = now()
    db.transaction((tx) => {
      for (const c of req.body.consents) tx.run('INSERT INTO consents (id, user_id, consent_type, version, granted, created_at) VALUES (?,?,?,?,?,?)', uuid(), req.user.id, c.type, CONSENT_VERSIONS[c.type], c.granted ? 1 : 0, t)
    })
    ctx.audit(req, { action: 'consent.record', resourceType: 'consent', patientId: req.user.id, details: { types: req.body.consents.map((c) => `${c.type}:${c.granted}`) } })
    res.json(consentState(db, req.user.id))
  })

  // ---------------- Screening → plan ----------------
  r.get('/screening/instrument', (req, res) => res.json(SCREENING_INSTRUMENT))

  r.post('/screening', requireRole('patient'), requireConsents(ctx), validate(z.object({
    items: z.record(z.string().max(20), z.number().int().min(0).max(4)).refine((m) => Object.keys(m).length <= 50, 'Слишком много ответов'),
    safety: z.object({ clearance: z.enum(['yes', 'no', 'unsure']), pain: z.enum(['no', 'mild', 'strong']), seizures: z.enum(['no', 'yes', 'unsure']) }),
  })), (req, res) => {
    const unknown = Object.keys(req.body.items).filter((k) => !SCREENING_INSTRUMENT.questions.some((q) => q.id === k))
    if (unknown.length) throw badRequest('Неизвестные вопросы', { unknown })
    const scored = scoreScreening(req.body)
    const t = now()
    const plan = db.transaction((tx) => {
      tx.run('INSERT INTO screening_assessments (id, user_id, instrument, answers, domain_scores, created_at) VALUES (?,?,?,?,?,?)', uuid(), req.user.id, SCREENING_INSTRUMENT.id, json(req.body), json(scored), t)
      const existing = getActivePlan(tx, req.user.id)
      const profile = tx.get('SELECT * FROM patient_profiles WHERE user_id = ?', req.user.id)
      if (!profile) tx.run('INSERT INTO patient_profiles (user_id, updated_at) VALUES (?,?)', req.user.id, t)
      tx.run('UPDATE patient_profiles SET onboarding_completed_at = COALESCE(onboarding_completed_at, ?), updated_at = ? WHERE user_id = ?', t, t, req.user.id)
      let domains = buildInitialPlanDomains(scored)
      if (existing) {
        // Re-assessment: keep clinician-set bounds and current levels; refresh priorities and safety flags only.
        domains = Object.fromEntries(Object.entries(existing.domains).map(([d, cfg]) => [d, { ...cfg, priority: domains[d].priority, physicalAllowed: d === 'motor' ? (cfg.physicalAllowedByClinician ?? domains.motor.physicalAllowed) : cfg.physicalAllowed, excludeFastPaced: d === 'attention' ? domains.attention.excludeFastPaced : cfg.excludeFastPaced }]))
      }
      return createPlan(tx, {
        patientId: req.user.id, domains,
        sessionsPerWeek: profile?.sessions_per_week_goal ?? 5, maxSessionMinutes: profile?.session_minutes_goal ?? 20,
        createdBy: 'screening', createdByRole: 'system', reason: existing ? 'reassessment' : 'initial_screening',
      })
    })
    db.run("UPDATE recommendations SET status = 'expired' WHERE patient_id = ? AND type = 'reassessment' AND status = 'active'", req.user.id)
    ctx.audit(req, { action: 'screening.submit', resourceType: 'screening', patientId: req.user.id })
    res.status(201).json({ scores: scored, plan: planDto(plan) })
  })

  // ---------------- Plan & library ----------------
  r.get('/exercises', (req, res) => res.json({ version: LIBRARY_VERSION, domains: DOMAINS, exercises: EXERCISES.map(publicExercise) }))

  r.get('/plan', (req, res) => {
    const plan = getActivePlan(db, req.user.id)
    if (!plan) return res.json({ plan: null })
    const versions = db.all('SELECT version, created_by_role, reason, created_at FROM rehab_plans WHERE patient_id = ? ORDER BY version DESC LIMIT 20', req.user.id)
    res.json({ plan: planDto(plan), history: versions })
  })

  r.get('/today', (req, res) => {
    const plan = getActivePlan(db, req.user.id)
    if (!plan) return res.json({ needsScreening: true })
    periodicChecks(db, { patientId: req.user.id, notify: notifyUser(req.user.id) })
    const daily = buildDailyPlan(db, plan, today())
    daily.items = daily.items.map((i) => ({ ...i, title: EXERCISE_BY_ID[i.exerciseId].title, summary: EXERCISE_BY_ID[i.exerciseId].summary, kind: EXERCISE_BY_ID[i.exerciseId].kind }))
    const recs = db.all("SELECT id, type, domain, payload, rationale, status, created_at FROM recommendations WHERE patient_id = ? AND status IN ('active','applied','pending_clinician') ORDER BY created_at DESC LIMIT 6", req.user.id)
      .map((x) => ({ ...x, payload: parse(x.payload, {}), rationale: parse(x.rationale, {}) }))
    const inProgress = db.get("SELECT id, started_at FROM exercise_sessions WHERE patient_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1", req.user.id)
    res.json({
      today: daily, week: weeklyProgress(db, req.user.id), recommendations: recs, inProgressSession: inProgress ?? null,
      nextReassessment: nextReassessmentDate(db, req.user.id),
      unreadNotifications: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n,
    })
  })

  // ---------------- Sessions & results ----------------
  r.post('/sessions', requireRole('patient'), requireConsents(ctx), validate(z.object({ fatigueBefore: z.number().int().min(0).max(10).nullable().default(null) })), (req, res) => {
    const plan = getActivePlan(db, req.user.id)
    if (!plan) throw conflict('Сначала пройдите первичную самооценку')
    // Close abandoned sessions so history stays honest.
    db.run("UPDATE exercise_sessions SET status = 'stopped', ended_at = ?, stop_reason = 'abandoned' WHERE patient_id = ? AND status = 'in_progress'", now(), req.user.id)
    const id = uuid()
    db.run('INSERT INTO exercise_sessions (id, patient_id, plan_id, started_at, status, fatigue_before) VALUES (?,?,?,?,?,?)', id, req.user.id, plan.id, now(), 'in_progress', req.body.fatigueBefore)
    res.status(201).json({ sessionId: id })
  })

  const ownSession = (req) => {
    const s = db.get('SELECT * FROM exercise_sessions WHERE id = ? AND patient_id = ?', req.params.id, req.user.id)
    if (!s) throw notFound('Занятие не найдено')
    return s
  }

  r.post('/sessions/:id/results', validate(resultSchema), (req, res) => {
    const s = ownSession(req)
    if (s.status !== 'in_progress') throw conflict('Занятие уже завершено')
    const b = req.body, ex = EXERCISE_BY_ID[b.exerciseId]
    const id = uuid()
    db.run(
      `INSERT INTO exercise_results (id, session_id, patient_id, exercise_id, domain, level, completed, duration_ms, accuracy, mean_rt_ms, errors, timed, metrics, library_version, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, s.id, req.user.id, ex.id, ex.domain, b.level, b.completed ? 1 : 0, b.durationMs, b.accuracy, b.meanRtMs, b.errors, b.timed ? 1 : 0, json(b.metrics), LIBRARY_VERSION, now(),
    )
    res.status(201).json({ resultId: id, previous: exerciseTrend(db, req.user.id, ex.id, 6) })
  })

  r.post('/sessions/:id/complete', validate(z.object({
    status: z.enum(['completed', 'stopped']),
    fatigueAfter: z.number().int().min(0).max(10).nullable().default(null),
    discomfort: z.number().int().min(0).max(10).nullable().default(null),
    stopReason: z.enum(['tired', 'discomfort', 'too_hard', 'no_time', 'technical', 'other']).nullable().default(null),
  })), (req, res) => {
    const s = ownSession(req)
    if (s.status !== 'in_progress') throw conflict('Занятие уже завершено')
    const b = req.body
    db.run('UPDATE exercise_sessions SET status = ?, ended_at = ?, fatigue_after = ?, discomfort = ?, stop_reason = ? WHERE id = ?', b.status, now(), b.fatigueAfter, b.discomfort, b.stopReason, s.id)
    const session = db.get('SELECT * FROM exercise_sessions WHERE id = ?', s.id)
    const outcome = evaluateAfterSession(db, { patientId: req.user.id, session, notify: notifyUser(req.user.id) })
    ctx.audit(req, { action: 'session.complete', resourceType: 'session', resourceId: s.id, patientId: req.user.id, details: { status: b.status, levelChanges: outcome.changes.length } })
    res.json({ session: { id: s.id, status: b.status }, levelChanges: outcome.changes, recommendations: outcome.recommendations })
  })

  // ---------------- Analytics ----------------
  r.get('/analytics/summary', validate(z.object({ period: z.enum(['7', '30', '90']).default('30') }), 'query'), (req, res) => {
    res.json(summary(db, req.user.id, Number(req.valid.query.period)))
  })
  r.get('/analytics/history', validate(z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), 'query'), (req, res) => {
    res.json({ sessions: history(db, req.user.id, req.valid.query) })
  })
  r.get('/analytics/exercise/:exerciseId', (req, res) => {
    if (!EXERCISE_BY_ID[req.params.exerciseId]) throw notFound()
    res.json({ attempts: exerciseTrend(db, req.user.id, req.params.exerciseId, 20) })
  })
  r.get('/assessments', (req, res) => {
    res.json({
      clinical: db.all('SELECT id, scale, score, assessed_at, source, created_at FROM clinical_assessments WHERE patient_id = ? ORDER BY assessed_at DESC', req.user.id),
      screenings: db.all('SELECT id, instrument, domain_scores, created_at FROM screening_assessments WHERE user_id = ? ORDER BY created_at DESC', req.user.id).map((s) => ({ ...s, domain_scores: parse(s.domain_scores, {}) })),
      nextReassessment: nextReassessmentDate(db, req.user.id),
    })
  })

  // ---------------- Recommendations & notifications ----------------
  r.get('/recommendations', (req, res) => {
    res.json(db.all('SELECT id, type, domain, payload, rationale, status, requires_clinician, created_at, decided_at, decision_note FROM recommendations WHERE patient_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id)
      .map((x) => ({ ...x, payload: parse(x.payload, {}), rationale: parse(x.rationale, {}) })))
  })
  r.post('/recommendations/:id/dismiss', (req, res) => {
    const rec = db.get("SELECT id FROM recommendations WHERE id = ? AND patient_id = ? AND status IN ('active','applied')", req.params.id, req.user.id)
    if (!rec) throw notFound()
    db.run("UPDATE recommendations SET status = 'dismissed', decided_by = ?, decided_at = ? WHERE id = ?", req.user.id, now(), rec.id)
    res.json({ ok: true })
  })
  r.get('/notifications', (req, res) => {
    res.json(db.all('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', req.user.id))
  })
  r.post('/notifications/read-all', (req, res) => {
    db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), req.user.id)
    res.json({ ok: true })
  })
  r.post('/notifications/:id/read', (req, res) => {
    db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', now(), req.params.id, req.user.id)
    res.json({ ok: true })
  })

  // ---------------- Medication schedule (patient-entered reminders, not prescriptions) ----------------
  r.get('/medications', (req, res) => {
    const meds = db.all('SELECT id, name, time_of_day, created_at FROM medications WHERE patient_id = ? AND active = 1 ORDER BY time_of_day', req.user.id)
    const taken = new Set(db.all('SELECT l.medication_id FROM medication_logs l JOIN medications m ON m.id = l.medication_id WHERE m.patient_id = ? AND l.log_date = ?', req.user.id, today()).map((x) => x.medication_id))
    res.json(meds.map((m) => ({ id: m.id, name: m.name, time: m.time_of_day, takenToday: taken.has(m.id) })))
  })
  const medSchema = z.object({ name: z.string().trim().min(1).max(80), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
  r.post('/medications', validate(medSchema), (req, res) => {
    if (db.get('SELECT COUNT(*) n FROM medications WHERE patient_id = ? AND active = 1', req.user.id).n >= 30) throw badRequest('Слишком много записей')
    const id = uuid()
    db.run('INSERT INTO medications (id, patient_id, name, time_of_day, created_at) VALUES (?,?,?,?,?)', id, req.user.id, req.body.name, req.body.time, now())
    res.status(201).json({ id })
  })
  r.put('/medications/:id', validate(medSchema), (req, res) => {
    const u = db.run('UPDATE medications SET name = ?, time_of_day = ? WHERE id = ? AND patient_id = ? AND active = 1', req.body.name, req.body.time, req.params.id, req.user.id)
    if (!u.changes) throw notFound()
    res.json({ ok: true })
  })
  r.delete('/medications/:id', (req, res) => {
    const u = db.run('UPDATE medications SET active = 0 WHERE id = ? AND patient_id = ?', req.params.id, req.user.id)
    if (!u.changes) throw notFound()
    res.json({ ok: true })
  })
  r.post('/medications/:id/taken', validate(z.object({ taken: z.boolean() })), (req, res) => {
    const m = db.get('SELECT id FROM medications WHERE id = ? AND patient_id = ? AND active = 1', req.params.id, req.user.id)
    if (!m) throw notFound()
    if (req.body.taken) db.run('INSERT OR IGNORE INTO medication_logs (medication_id, log_date, taken_at) VALUES (?,?,?)', m.id, today(), now())
    else db.run('DELETE FROM medication_logs WHERE medication_id = ? AND log_date = ?', m.id, today())
    res.json({ ok: true })
  })

  // ---------------- Care team (patient-controlled sharing) ----------------
  r.post('/me/share-codes', requireRole('patient'), (req, res) => {
    const code = generateShareCode()
    const expires = new Date(Date.now() + 24 * 3600e3).toISOString()
    db.run('INSERT INTO share_codes (code_hash, patient_id, expires_at, created_at) VALUES (?,?,?,?)', sha256(code), req.user.id, expires, now())
    db.run('INSERT INTO consents (id, user_id, consent_type, version, granted, created_at) VALUES (?,?,?,?,?,?)', uuid(), req.user.id, 'clinician_sharing', CONSENT_VERSIONS.clinician_sharing, 1, now())
    ctx.audit(req, { action: 'care.share_code.create', resourceType: 'share_code', patientId: req.user.id })
    res.status(201).json({ code, expiresAt: expires })
  })
  r.get('/me/care-team', (req, res) => {
    res.json(db.all(
      `SELECT c.id, c.status, c.granted_at, c.revoked_at, u.display_name AS clinician_name, u.email AS clinician_email
       FROM care_relationships c JOIN users u ON u.id = c.clinician_id WHERE c.patient_id = ? ORDER BY c.granted_at DESC`, req.user.id,
    ))
  })
  r.delete('/me/care-team/:id', (req, res) => {
    const u = db.run("UPDATE care_relationships SET status = 'revoked', revoked_at = ? WHERE id = ? AND patient_id = ? AND status = 'active'", now(), req.params.id, req.user.id)
    if (!u.changes) throw notFound()
    ctx.audit(req, { action: 'care.revoke', resourceType: 'care_relationship', resourceId: req.params.id, patientId: req.user.id })
    res.json({ ok: true })
  })

  // ---------------- Data portability & erasure ----------------
  r.get('/me/export', (req, res) => {
    const uid = req.user.id
    const dump = {
      exportedAt: now(), format: 'rehabme-export-v1',
      user: profileDto(req.user, db.get('SELECT * FROM patient_profiles WHERE user_id = ?', uid)),
      consents: db.all('SELECT consent_type, version, granted, created_at FROM consents WHERE user_id = ?', uid),
      screenings: db.all('SELECT instrument, answers, domain_scores, created_at FROM screening_assessments WHERE user_id = ?', uid).map((s) => ({ ...s, answers: parse(s.answers), domain_scores: parse(s.domain_scores) })),
      clinicalAssessments: db.all('SELECT scale, score, assessed_at, source FROM clinical_assessments WHERE patient_id = ?', uid),
      plans: db.all('SELECT version, status, domains, sessions_per_week, max_session_minutes, created_by_role, reason, created_at FROM rehab_plans WHERE patient_id = ?', uid).map((p) => ({ ...p, domains: parse(p.domains) })),
      sessions: history(db, uid, { limit: 100000 }),
      recommendations: db.all('SELECT type, domain, payload, rationale, status, created_at FROM recommendations WHERE patient_id = ?', uid),
      predictions: db.all('SELECT model_name, model_version, mode, status, output, created_at FROM predictions WHERE patient_id = ?', uid).map((p) => ({ ...p, output: parse(p.output) })),
      medications: db.all('SELECT name, time_of_day, active, created_at FROM medications WHERE patient_id = ?', uid),
      assistantMessages: db.all('SELECT m.role, m.content, m.created_at FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id WHERE c.user_id = ?', uid).map((m) => ({ ...m, content: ctx.cipher.decrypt(m.content) })),
    }
    ctx.audit(req, { action: 'data.export', resourceType: 'patient', resourceId: uid, patientId: uid })
    res.setHeader('content-disposition', 'attachment; filename="rehabme-data-export.json"')
    res.json(dump)
  })

  r.delete('/me', validate(z.object({ confirm: z.literal('УДАЛИТЬ') })), (req, res) => {
    const uid = req.user.id
    ctx.audit(req, { action: 'account.delete', resourceType: 'user', resourceId: uid, patientId: uid })
    db.transaction((tx) => {
      // Cascading deletes remove all patient-owned rows. The user row is tombstoned without PII
      // so audit-log references stay valid.
      for (const t of ['exercise_results', 'exercise_sessions', 'recommendations', 'predictions', 'rehab_plans', 'clinical_assessments', 'medications', 'care_relationships', 'share_codes'])
        tx.run(`DELETE FROM ${t} WHERE patient_id = ?`, uid)
      for (const t of ['screening_assessments', 'accessibility_settings', 'patient_profiles', 'notifications', 'ai_conversations', 'consents', 'local_credentials'])
        tx.run(`DELETE FROM ${t} WHERE user_id = ?`, uid)
      tx.run("UPDATE users SET email = NULL, display_name = NULL, auth_uid = 'deleted:' || id, deleted_at = ?, updated_at = ? WHERE id = ?", now(), now(), uid)
    })
    res.json({ ok: true, note: 'Данные удалены из рабочей базы. Резервные копии перезаписываются в течение срока хранения бэкапов (см. политику конфиденциальности).' })
  })

  return r
}

export function planDto(plan) {
  return {
    id: plan.id, version: plan.version, sessionsPerWeek: plan.sessions_per_week, maxSessionMinutes: plan.max_session_minutes,
    excludedExercises: plan.excluded_exercises, createdByRole: plan.created_by_role, reason: plan.reason, createdAt: plan.created_at,
    domains: Object.fromEntries(Object.entries(plan.domains).map(([d, c]) => [d, { ...c, label: DOMAINS[d]?.label }])),
  }
}
