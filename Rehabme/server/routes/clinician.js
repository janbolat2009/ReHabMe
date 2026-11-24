// Healthcare-professional API. Access to a patient exists only through a patient-issued share code,
// and every read/write is authorised per patient and audit-logged.
import { Router } from 'express'
import { z } from 'zod'
import { ah, notFound, badRequest, conflict } from '../lib/errors.js'
import { validate, requireRole, assertPatientAccess } from '../middleware/core.js'
import { now, uuid, parse } from '../db/sqlite.js'
import { sha256 } from '../lib/crypto.js'
import { DOMAINS, EXERCISE_BY_ID } from '../services/library.js'
import { createPlan, getActivePlan } from '../services/engine.js'
import { summary, history, SCALES } from '../services/analytics.js'
import { planDto } from './patient.js'
import { runPrediction, predictionDto } from './ai.js'

const domainCfg = z.object({
  enabled: z.boolean(), level: z.number().int().min(1).max(5), minLevel: z.number().int().min(1).max(5), maxLevel: z.number().int().min(1).max(5),
  physicalAllowed: z.boolean().optional(), excludeFastPaced: z.boolean().optional(),
}).refine((d) => d.minLevel <= d.level && d.level <= d.maxLevel, 'Уровень должен быть в пределах min..max')

export function clinicianRoutes(ctx) {
  const r = Router()
  const { db } = ctx
  r.use(requireRole('clinician'))

  const patientRow = (id) => {
    const u = db.get("SELECT id, display_name, email, created_at FROM users WHERE id = ? AND role = 'patient' AND deleted_at IS NULL", id)
    if (!u) throw notFound('Пациент не найден')
    return u
  }

  r.post('/patients/claim', validate(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'Формат кода: XXXX-XXXX') })), (req, res) => {
    const row = db.get('SELECT * FROM share_codes WHERE code_hash = ?', sha256(req.body.code))
    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) {
      ctx.audit(req, { action: 'care.claim', outcome: 'denied', details: { reason: 'invalid_or_expired_code' } })
      throw badRequest('Код недействителен или истёк. Попросите пациента создать новый.')
    }
    if (db.get("SELECT 1 FROM care_relationships WHERE patient_id = ? AND clinician_id = ? AND status = 'active'", row.patient_id, req.user.id)) throw conflict('Пациент уже в вашем списке')
    db.transaction((tx) => {
      tx.run('UPDATE share_codes SET used_at = ?, used_by = ? WHERE code_hash = ?', now(), req.user.id, row.code_hash)
      tx.run('INSERT INTO care_relationships (id, patient_id, clinician_id, status, granted_at) VALUES (?,?,?,?,?)', uuid(), row.patient_id, req.user.id, 'active', now())
    })
    ctx.notify(row.patient_id)({ kind: 'care', title: 'Специалист подключён', body: `${req.user.display_name || 'Специалист'} получил доступ к вашей программе. Отозвать доступ можно в профиле.`, link: '/app/profile', dedupeKey: `care:${req.user.id}:${row.code_hash}` })
    ctx.audit(req, { action: 'care.claim', resourceType: 'patient', resourceId: row.patient_id, patientId: row.patient_id })
    res.status(201).json({ patientId: row.patient_id })
  })

  r.get('/patients', (req, res) => {
    const rows = db.all(
      `SELECT u.id, u.display_name, c.granted_at,
         (SELECT MAX(started_at) FROM exercise_sessions s WHERE s.patient_id = u.id AND s.status = 'completed') AS last_session,
         (SELECT COUNT(*) FROM exercise_sessions s WHERE s.patient_id = u.id AND s.status = 'completed' AND s.started_at >= ?) AS sessions_14d,
         (SELECT COUNT(*) FROM recommendations x WHERE x.patient_id = u.id AND x.status = 'pending_clinician') AS pending_reviews,
         (SELECT MAX(discomfort) FROM exercise_sessions s WHERE s.patient_id = u.id AND s.started_at >= ?) AS max_discomfort_14d
       FROM care_relationships c JOIN users u ON u.id = c.patient_id
       WHERE c.clinician_id = ? AND c.status = 'active' AND u.deleted_at IS NULL ORDER BY u.display_name`,
      new Date(Date.now() - 14 * 864e5).toISOString(), new Date(Date.now() - 14 * 864e5).toISOString(), req.user.id,
    )
    ctx.audit(req, { action: 'clinician.patients.list', resourceType: 'patient_list' })
    res.json(rows.map((x) => ({ ...x, alert: (x.max_discomfort_14d ?? 0) >= 7 ? 'discomfort' : null })))
  })

  r.get('/patients/:id', (req, res) => {
    assertPatientAccess(ctx, req, req.params.id, 'clinician.patient.read')
    const u = patientRow(req.params.id)
    const p = db.get('SELECT * FROM patient_profiles WHERE user_id = ?', u.id)
    const plan = getActivePlan(db, u.id)
    const screening = db.get('SELECT domain_scores, answers, created_at FROM screening_assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', u.id)
    res.json({
      patient: { id: u.id, displayName: u.display_name, since: u.created_at },
      profile: p ? { birthYear: p.birth_year, sex: p.sex, strokeDate: p.stroke_date, strokeType: p.stroke_type, affectedSide: p.affected_side, dominantHand: p.dominant_hand, goals: parse(p.goals, []), sessionsPerWeekGoal: p.sessions_per_week_goal } : null,
      plan: plan ? planDto(plan) : null,
      planHistory: db.all('SELECT version, created_by_role, reason, created_at FROM rehab_plans WHERE patient_id = ? ORDER BY version DESC LIMIT 30', u.id),
      screening: screening ? { ...screening, domain_scores: parse(screening.domain_scores, {}), answers: parse(screening.answers, {}) } : null,
      analytics: summary(db, u.id, 30),
      sessions: history(db, u.id, { limit: 20 }),
      assessments: db.all('SELECT id, scale, score, assessed_at, source, entered_by, created_at FROM clinical_assessments WHERE patient_id = ? ORDER BY assessed_at DESC', u.id),
      recommendations: db.all("SELECT id, type, domain, payload, rationale, status, requires_clinician, created_at, decided_at, decision_note FROM recommendations WHERE patient_id = ? ORDER BY CASE status WHEN 'pending_clinician' THEN 0 ELSE 1 END, created_at DESC LIMIT 40", u.id)
        .map((x) => ({ ...x, payload: parse(x.payload, {}), rationale: parse(x.rationale, {}) })),
      predictions: db.all('SELECT * FROM predictions WHERE patient_id = ? ORDER BY created_at DESC LIMIT 10', u.id).map(predictionDto),
      scales: SCALES,
      domains: DOMAINS,
    })
  })

  r.post('/patients/:id/assessments', validate(z.object({
    scale: z.enum(Object.keys(SCALES)), score: z.number(), assessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().max(2000).optional(),
  })), (req, res) => {
    assertPatientAccess(ctx, req, req.params.id, 'clinician.assessment.create')
    const s = SCALES[req.body.scale]
    if (req.body.score < s.min || req.body.score > s.max) throw badRequest(`${s.label}: допустимый диапазон ${s.min}–${s.max}`)
    if (Date.parse(req.body.assessedAt) > Date.now()) throw badRequest('Дата оценки не может быть в будущем')
    const id = uuid()
    db.run('INSERT INTO clinical_assessments (id, patient_id, scale, score, assessed_at, source, entered_by, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, req.params.id, req.body.scale, req.body.score, req.body.assessedAt, 'clinician', req.user.id, req.body.notes ? ctx.cipher.encrypt(req.body.notes) : null, now())
    res.status(201).json({ id })
  })

  r.put('/patients/:id/plan', validate(z.object({
    domains: z.partialRecord(z.enum(Object.keys(DOMAINS)), domainCfg),
    sessionsPerWeek: z.number().int().min(1).max(14),
    maxSessionMinutes: z.number().int().min(5).max(90),
    excludedExercises: z.array(z.string().refine((x) => !!EXERCISE_BY_ID[x])).default([]),
    reason: z.string().trim().min(3).max(500),
  })), (req, res) => {
    assertPatientAccess(ctx, req, req.params.id, 'clinician.plan.update')
    const cur = getActivePlan(db, req.params.id)
    if (!cur) throw conflict('У пациента ещё нет плана — он появится после первичной самооценки')
    const domains = { ...cur.domains }
    for (const [d, cfg] of Object.entries(req.body.domains)) {
      domains[d] = { ...domains[d], ...cfg }
      if (d === 'motor' && cfg.physicalAllowed !== undefined) {
        domains.motor.physicalAllowedByClinician = cfg.physicalAllowed
        domains.motor.notes = (domains.motor.notes || []).filter((n) => n !== 'physical_hold_pending_clearance')
      }
    }
    const plan = createPlan(db, { patientId: req.params.id, domains, sessionsPerWeek: req.body.sessionsPerWeek, maxSessionMinutes: req.body.maxSessionMinutes, createdBy: req.user.id, createdByRole: 'clinician', reason: req.body.reason })
    db.run('UPDATE rehab_plans SET excluded_exercises = ? WHERE id = ?', JSON.stringify(req.body.excludedExercises), plan.id)
    ctx.notify(req.params.id)({ kind: 'plan', title: 'Специалист обновил вашу программу', body: req.body.reason, link: '/app/plan', dedupeKey: `plan:${plan.id}` })
    res.json({ plan: planDto(getActivePlan(db, req.params.id)) })
  })

  r.post('/recommendations/:id/decision', validate(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() })), (req, res) => {
    const rec = db.get('SELECT * FROM recommendations WHERE id = ?', req.params.id)
    if (!rec) throw notFound()
    assertPatientAccess(ctx, req, rec.patient_id, 'clinician.recommendation.decide')
    if (!['pending_clinician', 'active', 'applied'].includes(rec.status)) throw conflict('Решение по рекомендации уже принято')
    db.run('UPDATE recommendations SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?', req.body.decision, req.user.id, now(), req.body.note ?? null, rec.id)
    const payload = parse(rec.payload, {})
    const plan = getActivePlan(db, rec.patient_id)
    if (rec.type === 'difficulty_change' && plan && rec.domain) {
      const domains = structuredClone(plan.domains)
      const cfg = domains[rec.domain]
      if (req.body.decision === 'approved' && rec.status === 'pending_clinician') {
        cfg.level = payload.to; cfg.maxLevel = Math.max(cfg.maxLevel, payload.to); cfg.minLevel = Math.min(cfg.minLevel, payload.to)
        createPlan(db, { patientId: rec.patient_id, domains, createdBy: req.user.id, createdByRole: 'clinician', reason: `approved_recommendation:${rec.id}` })
      } else if (req.body.decision === 'rejected' && rec.status === 'applied' && cfg.level === payload.to) {
        cfg.level = payload.from // revert an automatic change the clinician disagrees with
        createPlan(db, { patientId: rec.patient_id, domains, createdBy: req.user.id, createdByRole: 'clinician', reason: `rejected_recommendation:${rec.id}` })
      }
    }
    res.json({ ok: true })
  })

  r.post('/patients/:id/predictions', validate(z.object({
    hypertension: z.union([z.literal(0), z.literal(1)]).nullable().optional(), diabetes: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
    atrial_fibrillation: z.union([z.literal(0), z.literal(1)]).nullable().optional(), prior_stroke: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  })), ah(async (req, res) => {
    assertPatientAccess(ctx, req, req.params.id, 'clinician.prediction.run')
    const p = await runPrediction(ctx, req, req.params.id, req.body)
    res.status(201).json({ prediction: predictionDto(p) })
  }))

  r.post('/predictions/:id/review', validate(z.object({ status: z.enum(['acknowledged', 'disputed']), note: z.string().trim().max(1000).optional() })), (req, res) => {
    const p = db.get('SELECT patient_id FROM predictions WHERE id = ?', req.params.id)
    if (!p) throw notFound()
    assertPatientAccess(ctx, req, p.patient_id, 'clinician.prediction.review')
    db.run('UPDATE predictions SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?', req.body.status, req.user.id, now(), req.body.note ?? null, req.params.id)
    res.json({ ok: true })
  })

  return r
}
