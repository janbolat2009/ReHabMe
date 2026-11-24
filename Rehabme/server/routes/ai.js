// Recovery prediction (ML) and AI assistant (LLM) — two separate systems with separate endpoints.
import { Router } from 'express'
import { z } from 'zod'
import { ah, notFound } from '../lib/errors.js'
import { validate } from '../middleware/core.js'
import { now, uuid, json, parse } from '../db/sqlite.js'
import { allowedMode } from '../services/mlClient.js'
import { getActivePlan, buildDailyPlan } from '../services/engine.js'
import { EXERCISE_BY_ID } from '../services/library.js'
import { consentState } from './patient.js'

// Assemble model inputs from data the platform actually holds. Missing → NaN (model imputes, and the
// ML service abstains if too much is missing). Clinical baselines come only from clinician-entered scales.
export function buildFeatures(db, patientId, overrides = {}) {
  const p = db.get('SELECT * FROM patient_profiles WHERE user_id = ?', patientId)
  const firstOf = (scale) => db.get("SELECT score, assessed_at FROM clinical_assessments WHERE patient_id = ? AND scale = ? AND source = 'clinician' ORDER BY assessed_at ASC LIMIT 1", patientId, scale)
  const barthel = firstOf('barthel'), fma = firstOf('fma_ue'), moca = firstOf('moca'), nihss = firstOf('nihss')
  const baselineDate = barthel?.assessed_at ?? fma?.assessed_at ?? null
  const onset = p?.stroke_date ? Date.parse(p.stroke_date) : null
  const features = {
    age: p?.birth_year ? new Date().getFullYear() - p.birth_year : null,
    sex_female: p?.sex === 'female' ? 1 : p?.sex === 'male' ? 0 : null,
    stroke_hemorrhagic: p?.stroke_type === 'hemorrhagic' ? 1 : p?.stroke_type === 'ischemic' ? 0 : null,
    nihss_baseline: nihss?.score ?? null,
    barthel_baseline: barthel?.score ?? null,
    fma_ue_baseline: fma?.score ?? null,
    moca_baseline: moca?.score ?? null,
    days_onset_to_baseline: onset && baselineDate ? Math.max(0, Math.round((Date.parse(baselineDate) - onset) / 864e5)) : null,
    hypertension: null, diabetes: null, atrial_fibrillation: null, prior_stroke: null,
    ...overrides,
  }
  return features
}

export async function runPrediction(ctx, req, patientId, overrides) {
  const { db, ml, config } = ctx
  const features = buildFeatures(db, patientId, overrides)
  const status = await ml.status()
  const record = (row) => {
    const id = uuid()
    db.run(
      'INSERT INTO predictions (id, patient_id, model_name, model_version, mode, status, target, input_snapshot, output, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, patientId, row.modelName ?? null, row.modelVersion ?? null, row.mode, row.status, row.target ?? null, json(features), json(row.output), now(),
    )
    ctx.audit(req, { action: 'prediction.run', resourceType: 'prediction', resourceId: id, patientId, details: { status: row.status, mode: row.mode } })
    return { id, createdAt: now(), ...row, features }
  }

  if (!status.available) {
    return record({ mode: 'none', status: 'unavailable', output: { reason: 'service_unreachable', message: 'Сервис прогнозирования сейчас недоступен. Остальные функции работают как обычно.' } })
  }
  const models = (status.models ?? []).map((m) => ({ ...m, mode: allowedMode(config, m) })).filter((m) => m.mode)
  if (!models.length) {
    return record({ mode: 'none', status: 'unavailable', output: { reason: 'no_validated_model', message: 'Клинически валидированная модель прогнозирования пока не развёрнута. Прогноз станет доступен после завершения клинической проверки.' } })
  }
  try {
    const result = await ml.predict(features)
    const allowed = new Set(models.map((m) => `${m.name}@${m.version}`))
    const items = (result.results ?? []).filter((r) => allowed.has(`${r.model.name}@${r.model.version}`))
      .map((r) => ({ ...r, mode: models.find((m) => m.name === r.model.name && m.version === r.model.version).mode }))
    if (!items.length) return record({ mode: 'none', status: 'unavailable', output: { reason: 'no_result' } })
    const anyOk = items.some((i) => i.status === 'ok')
    return record({ modelName: items[0].model.name, modelVersion: items[0].model.version, mode: items[0].mode, status: anyOk ? 'ok' : 'abstained', target: items.map((i) => i.target).join(','), output: { results: items } })
  } catch (e) {
    ctx.log.warn({ err: e.message }, 'prediction call failed')
    return record({ mode: 'none', status: 'unavailable', output: { reason: 'service_error', message: 'Не удалось получить прогноз. Попробуйте позже.' } })
  }
}

export const predictionDto = (p) => p && ({
  id: p.id, createdAt: p.created_at ?? p.createdAt, mode: p.mode, status: p.status, modelName: p.model_name ?? p.modelName,
  modelVersion: p.model_version ?? p.modelVersion, output: typeof p.output === 'string' ? parse(p.output, {}) : p.output,
  features: typeof p.input_snapshot === 'string' ? parse(p.input_snapshot, {}) : p.features,
  reviewStatus: p.review_status ?? 'unreviewed', reviewNote: p.review_note ?? null, reviewedAt: p.reviewed_at ?? null,
})

export function aiRoutes(ctx) {
  const r = Router()
  const { db } = ctx

  r.get('/model/status', ah(async (req, res) => {
    const s = await ctx.ml.status()
    res.json({
      available: s.available,
      models: (s.models ?? []).map((m) => ({ name: m.name, version: m.version, task: m.task, status: m.status, dataSource: m.data_source, target: m.target, displayedAs: allowedMode(ctx.config, m) ?? 'hidden', metrics: m.metrics })),
    })
  }))

  r.get('/predictions/latest', (req, res) => {
    const p = db.get('SELECT * FROM predictions WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1', req.user.id)
    res.json({ prediction: predictionDto(p) ?? null })
  })

  r.post('/predictions', ah(async (req, res) => {
    const p = await runPrediction(ctx, req, req.user.id, {})
    res.status(201).json({ prediction: predictionDto(p) })
  }))

  // ---------------- Assistant ----------------
  r.post('/assistant/messages', validate(z.object({ conversationId: z.string().uuid().nullable().optional(), message: z.string().trim().min(1).max(2000) })), ah(async (req, res) => {
    let convId = req.body.conversationId
    if (convId) {
      if (!db.get('SELECT 1 FROM ai_conversations WHERE id = ? AND user_id = ?', convId, req.user.id)) throw notFound('Диалог не найден')
    } else {
      convId = uuid()
      db.run('INSERT INTO ai_conversations (id, user_id, created_at) VALUES (?,?,?)', convId, req.user.id, now())
    }
    const consents = consentState(db, req.user.id)
    const plan = getActivePlan(db, req.user.id)
    let todayCtx = null
    if (plan) {
      const d = buildDailyPlan(db, plan, new Date().toISOString())
      todayCtx = { ...d, items: d.items.map((i) => ({ ...i, title: EXERCISE_BY_ID[i.exerciseId].title })) }
    }
    const out = await ctx.assistant.answer({ message: req.body.message, consentExternal: !!consents.ai_assistant_external?.granted, context: { today: todayCtx } })
    const t = now()
    db.run('INSERT INTO ai_messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)', uuid(), convId, 'user', ctx.cipher.encrypt(req.body.message), t)
    const msgId = uuid()
    db.run('INSERT INTO ai_messages (id, conversation_id, role, content, citations, safety, created_at) VALUES (?,?,?,?,?,?,?)', msgId, convId, 'assistant', ctx.cipher.encrypt(out.answer), json(out.citations), json({ ...out.safety, mode: out.mode, needsClinician: out.needsClinician }), now())
    if (out.safety.route !== 'general') ctx.audit(req, { action: 'assistant.safety_route', resourceType: 'ai_message', resourceId: msgId, patientId: req.user.id, details: { route: out.safety.route } })
    res.json({ conversationId: convId, message: { id: msgId, role: 'assistant', content: out.answer, citations: out.citations, actions: out.actions, needsClinician: out.needsClinician, mode: out.mode, safetyRoute: out.safety.route } })
  }))

  r.get('/assistant/conversations/latest', (req, res) => {
    const c = db.get('SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', req.user.id)
    if (!c) return res.json({ conversationId: null, messages: [] })
    const msgs = db.all('SELECT id, role, content, citations, safety, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at LIMIT 200', c.id)
    res.json({ conversationId: c.id, messages: msgs.map((m) => ({ id: m.id, role: m.role, content: ctx.cipher.decrypt(m.content), citations: parse(m.citations, []), safety: parse(m.safety, {}), createdAt: m.created_at })) })
  })

  r.delete('/assistant/conversations', (req, res) => {
    db.run('DELETE FROM ai_conversations WHERE user_id = ?', req.user.id)
    res.json({ ok: true })
  })

  r.get('/assistant/info', (req, res) => {
    const consents = consentState(db, req.user.id)
    res.json({
      mode: ctx.assistant.llmConfigured && consents.ai_assistant_external?.granted ? 'generative' : 'extractive',
      llmConfigured: ctx.assistant.llmConfigured,
      externalConsent: !!consents.ai_assistant_external?.granted,
      retentionDays: ctx.config.AI_MESSAGE_RETENTION_DAYS,
    })
  })

  return r
}
