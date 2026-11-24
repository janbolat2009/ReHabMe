// Personalized Rehabilitation Engine (hybrid: clinical rules + performance analytics).
// The LLM is NOT involved in any decision here. Every decision is deterministic, logged with a rationale,
// bounded by clinician-set limits, and reversible (plans are versioned, never overwritten).
import { EXERCISES, EXERCISE_BY_ID, DOMAINS, LIBRARY_VERSION } from './library.js'
import { now, uuid, json, parse } from '../db/sqlite.js'

export const ENGINE_VERSION = 'engine-2026.11.1'

// ---------------------------------------------------------------------------------------------
// 1. Onboarding screening — patient self-report. This is NOT a validated clinical instrument;
//    it only orders domains by perceived difficulty and picks conservative starting levels.
// ---------------------------------------------------------------------------------------------
export const SCREENING_INSTRUMENT = {
  id: 'rehabme-selfreport-v1',
  disclaimer: 'Самооценка не является клинической шкалой и не заменяет осмотр специалиста.',
  scale: ['Совсем не трудно', 'Немного трудно', 'Умеренно трудно', 'Очень трудно', 'Не могу сделать'],
  questions: [
    { id: 'mem1', domain: 'memory', text: 'Насколько трудно вам запоминать новую информацию — имена, списки, договорённости?' },
    { id: 'mem2', domain: 'memory', text: 'Насколько трудно вспомнить, что вы собирались сделать?' },
    { id: 'att1', domain: 'attention', text: 'Насколько трудно сосредоточиться на одном деле 10–15 минут?' },
    { id: 'att2', domain: 'attention', text: 'Насколько трудно замечать детали — например, нужный предмет на полке?' },
    { id: 'cog1', domain: 'cognition', text: 'Насколько трудно планировать дела или решать бытовые задачи?' },
    { id: 'mot1', domain: 'motor', text: 'Насколько трудно выполнять точные движения рукой — застегнуть пуговицу, взять мелкий предмет?' },
    { id: 'mot2', domain: 'motor', text: 'Насколько трудно управлять мышью или нажимать на экран телефона?' },
    { id: 'sp1', domain: 'speech', text: 'Насколько трудно подбирать слова или чётко произносить их?' },
    { id: 'wb1', domain: 'wellbeing', text: 'Как часто за последние две недели вы чувствовали подавленность или тревогу?' },
  ],
  safety: [
    { id: 'clearance', text: 'Разрешил ли вам врач выполнять физические упражнения дома?', options: ['yes', 'no', 'unsure'] },
    { id: 'pain', text: 'Есть ли у вас боль в плече или руке при движении?', options: ['no', 'mild', 'strong'] },
    { id: 'seizures', text: 'Были ли у вас судорожные приступы после инсульта?', options: ['no', 'yes', 'unsure'] },
  ],
}

export function scoreScreening(answers) {
  const byDomain = {}
  for (const q of SCREENING_INSTRUMENT.questions) {
    const v = answers.items?.[q.id]
    if (typeof v !== 'number' || v < 0 || v > 4) continue
    ;(byDomain[q.domain] ||= []).push(v)
  }
  const domainScores = {}
  for (const d of Object.keys(DOMAINS)) {
    const vals = byDomain[d]
    domainScores[d] = vals?.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 25) : null // 0..100 = perceived difficulty
  }
  const s = answers.safety || {}
  const flags = {
    physicalExerciseCleared: s.clearance === 'yes',
    shoulderPain: s.pain === 'strong' ? 'strong' : s.pain === 'mild' ? 'mild' : 'none',
    seizureHistory: s.seizures !== 'no',
  }
  return { domainScores, flags }
}

// Perceived difficulty 0..100 → conservative start level 1..3 (never above 3 without clinician input).
const startLevel = (score) => (score == null ? 2 : score >= 60 ? 1 : score >= 30 ? 2 : 3)

export function buildInitialPlanDomains({ domainScores, flags }) {
  const domains = {}
  for (const d of Object.keys(DOMAINS)) {
    const score = domainScores[d]
    domains[d] = {
      enabled: true,
      level: startLevel(score),
      minLevel: 1,
      maxLevel: 3, // engine may self-adjust within 1..3; higher levels require clinician approval
      priority: score ?? 40,
      notes: [],
    }
  }
  // Safety rules: physical (video) exercises are held until a clinician clears them.
  domains.motor.physicalAllowed = flags.physicalExerciseCleared && flags.shoulderPain !== 'strong'
  if (!domains.motor.physicalAllowed) domains.motor.notes.push('physical_hold_pending_clearance')
  // Fast-paced reaction tasks are held for people reporting seizures (photic/flicker caution) until reviewed.
  domains.attention.excludeFastPaced = flags.seizureHistory
  return domains
}

export function createPlan(db, { patientId, domains, sessionsPerWeek, maxSessionMinutes, createdBy, createdByRole, reason }) {
  return db.transaction((tx) => {
    const prev = tx.get("SELECT * FROM rehab_plans WHERE patient_id = ? AND status = 'active'", patientId)
    if (prev) tx.run("UPDATE rehab_plans SET status = 'superseded' WHERE id = ?", prev.id)
    const id = uuid()
    tx.run(
      `INSERT INTO rehab_plans (id, patient_id, version, status, domains, sessions_per_week, max_session_minutes, excluded_exercises, created_by, created_by_role, reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, patientId, (prev?.version ?? 0) + 1, 'active', json(domains),
      sessionsPerWeek ?? prev?.sessions_per_week ?? 5, maxSessionMinutes ?? prev?.max_session_minutes ?? 20,
      prev?.excluded_exercises ?? '[]', createdBy, createdByRole, reason ?? null, now(),
    )
    return getActivePlan(tx, patientId)
  })
}

export function getActivePlan(db, patientId) {
  const row = db.get("SELECT * FROM rehab_plans WHERE patient_id = ? AND status = 'active'", patientId)
  if (!row) return null
  return { ...row, domains: parse(row.domains, {}), excluded_exercises: parse(row.excluded_exercises, []) }
}

// ---------------------------------------------------------------------------------------------
// 2. Daily plan — deterministic for a given patient+date (stable when the page is reloaded).
// ---------------------------------------------------------------------------------------------
function seededRandom(seedStr) {
  let h = 2166136261
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function eligibleExercises(plan) {
  return EXERCISES.filter((e) => {
    const d = plan.domains[e.domain]
    if (!d?.enabled) return false
    if (plan.excluded_exercises.includes(e.id)) return false
    if (e.physical && !plan.domains.motor?.physicalAllowed) return false
    if (e.id === 'attention-gonogo' && d.excludeFastPaced) return false
    return true
  })
}

export function buildDailyPlan(db, plan, dateISO) {
  const day = dateISO.slice(0, 10)
  const rand = seededRandom(`${plan.patient_id}:${day}:${plan.version}`)
  const pool = eligibleExercises(plan)
  // Least-recently-practised first, weighted by domain priority, with a deterministic tie-break.
  const lastDone = Object.fromEntries(
    db.all('SELECT exercise_id, MAX(created_at) AS last FROM exercise_results WHERE patient_id = ? GROUP BY exercise_id', plan.patient_id)
      .map((r) => [r.exercise_id, r.last]),
  )
  const scored = pool.map((e) => {
    const daysSince = lastDone[e.id] ? (Date.parse(day) - Date.parse(lastDone[e.id].slice(0, 10))) / 864e5 : 30
    const priority = plan.domains[e.domain].priority ?? 40
    return { e, score: Math.min(daysSince, 30) * 2 + priority / 10 + rand() * 3 }
  }).sort((a, b) => b.score - a.score)

  const picked = []
  const usedDomains = new Set()
  let minutes = 0
  // First pass: at most one exercise per domain, highest score first.
  for (const { e } of scored) {
    if (usedDomains.has(e.domain)) continue
    if (minutes + e.minutes > plan.max_session_minutes) continue
    picked.push(e); usedDomains.add(e.domain); minutes += e.minutes
    if (picked.length >= 5) break
  }
  const doneToday = new Set(
    db.all('SELECT DISTINCT exercise_id FROM exercise_results WHERE patient_id = ? AND substr(created_at,1,10) = ? AND completed = 1', plan.patient_id, day).map((r) => r.exercise_id),
  )
  return {
    date: day,
    planVersion: plan.version,
    estimatedMinutes: minutes,
    items: picked.map((e) => ({ exerciseId: e.id, domain: e.domain, level: plan.domains[e.domain].level, minutes: e.minutes, done: doneToday.has(e.id) })),
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Adaptive Difficulty Engine — runs after each completed session.
// ---------------------------------------------------------------------------------------------
export const RULES = {
  window: 3,               // consecutive results at the current level considered
  promoteAccuracy: 0.85,   // mean accuracy to suggest stepping up
  demoteAccuracy: 0.5,     // mean accuracy to suggest stepping down
  maxFatigueToPromote: 6,  // 0..10 self-reported
  maxDiscomfortToPromote: 3,
  discomfortStop: 7,       // triggers rest + clinician contact
  fatigueRest: 8,
  reassessmentDays: 28,
  inactivityDays: 3,
}

function addRecommendation(db, patientId, rec) {
  // Collapse duplicates: one active recommendation per (type, domain).
  const open = db.get(
    "SELECT id FROM recommendations WHERE patient_id = ? AND type = ? AND IFNULL(domain,'') = IFNULL(?, '') AND status IN ('active','pending_clinician')",
    patientId, rec.type, rec.domain ?? null,
  )
  if (open) return null
  const id = uuid()
  db.run(
    `INSERT INTO recommendations (id, patient_id, type, domain, payload, rationale, status, requires_clinician, engine_version, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, patientId, rec.type, rec.domain ?? null, json(rec.payload ?? {}), json(rec.rationale), rec.status, rec.requiresClinician ? 1 : 0, ENGINE_VERSION, now(),
  )
  return id
}

export function evaluateAfterSession(db, { patientId, session, notify }) {
  const plan = getActivePlan(db, patientId)
  if (!plan) return { changes: [], recommendations: [] }
  const out = { changes: [], recommendations: [] }

  // Safety first: discomfort / fatigue override any progression.
  if ((session.discomfort ?? 0) >= RULES.discomfortStop) {
    out.recommendations.push(addRecommendation(db, patientId, {
      type: 'clinician_contact', status: 'active',
      rationale: { rule: 'discomfort_stop', discomfort: session.discomfort, threshold: RULES.discomfortStop },
      payload: { message: 'Вы отметили сильный дискомфорт. Сделайте перерыв и обсудите это с врачом перед следующим занятием.' },
    }))
    notify?.({ kind: 'safety', title: 'Сделайте перерыв', body: 'Вы отметили сильный дискомфорт. Сообщите об этом врачу. При внезапной слабости, нарушении речи или асимметрии лица — звоните 103.', link: '/app/assistant', dedupeKey: `discomfort:${session.id}` })
    return out // no difficulty changes after a high-discomfort session
  }
  if ((session.fatigue_after ?? 0) >= RULES.fatigueRest) {
    out.recommendations.push(addRecommendation(db, patientId, {
      type: 'rest', status: 'active',
      rationale: { rule: 'high_fatigue', fatigueAfter: session.fatigue_after, threshold: RULES.fatigueRest },
      payload: { message: 'Сильная усталость после занятия. Завтра лучше сделать более короткую тренировку или отдохнуть.' },
    }))
  }

  const newDomains = structuredClone(plan.domains)
  let changed = false
  for (const [domain, cfg] of Object.entries(plan.domains)) {
    if (!cfg.enabled) continue
    const recent = db.all(
      `SELECT accuracy, completed FROM exercise_results r
       WHERE r.patient_id = ? AND r.domain = ? AND r.level = ? AND r.accuracy IS NOT NULL
       ORDER BY r.created_at DESC LIMIT ?`,
      patientId, domain, cfg.level, RULES.window,
    )
    if (recent.length < RULES.window) continue
    const meanAcc = recent.reduce((a, r) => a + r.accuracy, 0) / recent.length
    const allCompleted = recent.every((r) => r.completed === 1)
    const rationale = { rule: null, domain, level: cfg.level, window: recent.length, meanAccuracy: +meanAcc.toFixed(3), fatigueAfter: session.fatigue_after, discomfort: session.discomfort }

    let target = null
    if (meanAcc >= RULES.promoteAccuracy && allCompleted && (session.fatigue_after ?? 0) <= RULES.maxFatigueToPromote && (session.discomfort ?? 0) <= RULES.maxDiscomfortToPromote) {
      target = cfg.level + 1; rationale.rule = 'promote_high_accuracy'
    } else if (meanAcc < RULES.demoteAccuracy) {
      target = cfg.level - 1; rationale.rule = 'demote_low_accuracy'
    }
    if (target == null || target < 1 || target > 5) continue

    if (target >= cfg.minLevel && target <= cfg.maxLevel) {
      newDomains[domain].level = target
      changed = true
      out.changes.push({ domain, from: cfg.level, to: target })
      out.recommendations.push(addRecommendation(db, patientId, { type: 'difficulty_change', domain, status: 'applied', payload: { from: cfg.level, to: target }, rationale }))
      notify?.({ kind: 'plan', title: `${DOMAINS[domain].label}: уровень ${target}`, body: target > cfg.level ? 'Вы стабильно справляетесь — сложность немного повышена.' : 'Сложность немного снижена, чтобы занятия были комфортнее.', link: '/app/plan', dedupeKey: `level:${domain}:${target}:${plan.version}` })
    } else {
      // Outside the clinician-approved range → never auto-applied; queued for clinician review.
      out.recommendations.push(addRecommendation(db, patientId, { type: 'difficulty_change', domain, status: 'pending_clinician', requiresClinician: true, payload: { from: cfg.level, to: target }, rationale: { ...rationale, outOfRange: { min: cfg.minLevel, max: cfg.maxLevel } } }))
    }
  }
  if (changed) {
    createPlan(db, { patientId, domains: newDomains, createdBy: ENGINE_VERSION, createdByRole: 'system', reason: 'adaptive_difficulty' })
  }
  out.recommendations = out.recommendations.filter(Boolean)
  return out
}

// Periodic checks (run on dashboard load; idempotent thanks to recommendation/notification de-duplication).
export function periodicChecks(db, { patientId, notify }) {
  const lastScreen = db.get('SELECT created_at FROM screening_assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', patientId)
  if (lastScreen) {
    const days = (Date.now() - Date.parse(lastScreen.created_at)) / 864e5
    if (days >= RULES.reassessmentDays) {
      addRecommendation(db, patientId, { type: 'reassessment', status: 'active', rationale: { rule: 'reassessment_interval', daysSinceLast: Math.floor(days), interval: RULES.reassessmentDays }, payload: {} })
      notify?.({ kind: 'assessment', title: 'Пора пройти повторную оценку', body: 'Прошло 4 недели с прошлой самооценки. Это займёт 3 минуты.', link: '/app/assessment', dedupeKey: `reassess:${lastScreen.created_at.slice(0, 10)}` })
    }
  }
  const lastSession = db.get("SELECT started_at FROM exercise_sessions WHERE patient_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1", patientId)
  if (lastSession && (Date.now() - Date.parse(lastSession.started_at)) / 864e5 >= RULES.inactivityDays) {
    addRecommendation(db, patientId, { type: 'consistency', status: 'active', rationale: { rule: 'inactivity', lastSession: lastSession.started_at, thresholdDays: RULES.inactivityDays }, payload: { message: 'Короткое занятие сегодня поможет сохранить ритм. Даже 10 минут — это хорошо.' } })
  }
}

export function nextReassessmentDate(db, patientId) {
  const last = db.get('SELECT created_at FROM screening_assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', patientId)
  if (!last) return null
  return new Date(Date.parse(last.created_at) + RULES.reassessmentDays * 864e5).toISOString()
}

export { LIBRARY_VERSION, EXERCISE_BY_ID }
