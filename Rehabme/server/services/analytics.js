// Progress analytics. Three deliberately separate families — never merged into one "recovery score":
//   1. engagement   — did the patient practise (sessions, minutes, adherence to their weekly goal)
//   2. performance  — how the patient performed in exercises (accuracy, reaction time) — NOT clinical recovery
//   3. clinical     — standardised scales recorded by clinicians (Barthel, FMA, MoCA, mRS, NIHSS)
import { DOMAINS, EXERCISE_BY_ID } from './library.js'
import { parse } from '../db/sqlite.js'

const DAY = 864e5
const isoDay = (t) => new Date(t).toISOString().slice(0, 10)

export const SCALES = {
  barthel: { label: 'Индекс Бартел', min: 0, max: 100, higherIsBetter: true, unit: 'баллов' },
  fma_ue: { label: 'Fugl-Meyer, верхняя конечность', min: 0, max: 66, higherIsBetter: true, unit: 'баллов' },
  fma_le: { label: 'Fugl-Meyer, нижняя конечность', min: 0, max: 34, higherIsBetter: true, unit: 'баллов' },
  moca: { label: 'MoCA', min: 0, max: 30, higherIsBetter: true, unit: 'баллов' },
  mrs: { label: 'Модифицированная шкала Рэнкина (mRS)', min: 0, max: 6, higherIsBetter: false, unit: '' },
  nihss: { label: 'NIHSS', min: 0, max: 42, higherIsBetter: false, unit: 'баллов' },
}

function windowStats(db, patientId, fromMs, toMs, goalPerWeek) {
  const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString()
  const sessions = db.all(
    "SELECT id, started_at, ended_at, status FROM exercise_sessions WHERE patient_id = ? AND started_at >= ? AND started_at < ? AND status IN ('completed','stopped')",
    patientId, from, to,
  )
  const results = db.all(
    'SELECT exercise_id, domain, level, completed, duration_ms, accuracy, mean_rt_ms, errors, created_at FROM exercise_results WHERE patient_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at',
    patientId, from, to,
  )
  const days = Math.max(1, Math.round((toMs - fromMs) / DAY))
  const activeDays = new Set(sessions.map((s) => s.started_at.slice(0, 10))).size
  const minutes = Math.round(results.reduce((a, r) => a + r.duration_ms, 0) / 60000)
  const completedSessions = sessions.filter((s) => s.status === 'completed').length
  const expected = (goalPerWeek * days) / 7
  const acc = results.filter((r) => r.accuracy != null)
  return {
    sessions: completedSessions,
    stoppedSessions: sessions.length - completedSessions,
    activeDays,
    minutes,
    exercises: results.length,
    adherence: expected > 0 ? Math.min(1, completedSessions / expected) : null,
    meanAccuracy: acc.length ? acc.reduce((a, r) => a + r.accuracy, 0) / acc.length : null,
    results,
    sessionsList: sessions,
  }
}

export function summary(db, patientId, periodDays = 30) {
  const profile = db.get('SELECT sessions_per_week_goal FROM patient_profiles WHERE user_id = ?', patientId)
  const goal = profile?.sessions_per_week_goal ?? 5
  const end = Date.now() + 1 // include "now"
  const start = end - periodDays * DAY
  const cur = windowStats(db, patientId, start, end, goal)
  const prev = windowStats(db, patientId, start - periodDays * DAY, start, goal)

  // Daily engagement series (zero-filled so gaps are visible, not hidden).
  const daily = []
  for (let t = start; t < end; t += DAY) {
    const d = isoDay(t)
    const rs = cur.results.filter((r) => r.created_at.startsWith(d))
    daily.push({ date: d, minutes: Math.round(rs.reduce((a, r) => a + r.duration_ms, 0) / 60000), exercises: rs.length })
  }

  // Performance per domain: daily mean accuracy and RT (only days with data).
  const performance = {}
  for (const domain of Object.keys(DOMAINS)) {
    const rs = cur.results.filter((r) => r.domain === domain)
    if (!rs.length) continue
    const byDay = {}
    for (const r of rs) (byDay[r.created_at.slice(0, 10)] ||= []).push(r)
    const series = Object.entries(byDay).map(([date, list]) => {
      const a = list.filter((x) => x.accuracy != null), rt = list.filter((x) => x.mean_rt_ms != null)
      return {
        date,
        accuracy: a.length ? +(a.reduce((s, x) => s + x.accuracy, 0) / a.length).toFixed(3) : null,
        reactionMs: rt.length ? Math.round(rt.reduce((s, x) => s + x.mean_rt_ms, 0) / rt.length) : null,
        level: Math.max(...list.map((x) => x.level)),
      }
    })
    const prevRs = prev.results.filter((r) => r.domain === domain && r.accuracy != null)
    performance[domain] = {
      label: DOMAINS[domain].label,
      attempts: rs.length,
      series,
      meanAccuracy: series.filter((s) => s.accuracy != null).length ? +(rs.filter((r) => r.accuracy != null).reduce((s, r) => s + r.accuracy, 0) / rs.filter((r) => r.accuracy != null).length).toFixed(3) : null,
      previousMeanAccuracy: prevRs.length ? +(prevRs.reduce((s, r) => s + r.accuracy, 0) / prevRs.length).toFixed(3) : null,
    }
  }

  const clinical = db.all('SELECT id, scale, score, assessed_at, source FROM clinical_assessments WHERE patient_id = ? ORDER BY assessed_at', patientId)
  const clinicalByScale = {}
  for (const a of clinical) (clinicalByScale[a.scale] ||= { ...SCALES[a.scale], points: [] }).points.push({ id: a.id, score: a.score, date: a.assessed_at, source: a.source })

  return {
    periodDays,
    generatedAt: new Date().toISOString(),
    engagement: {
      current: pick(cur), previous: pick(prev), weeklyGoal: goal, daily,
    },
    performance,
    clinical: clinicalByScale,
    notes: [
      'Результаты упражнений показывают выполнение заданий в приложении и не являются клинической оценкой восстановления.',
      'Клинические показатели вносит специалист по стандартизированным шкалам.',
    ],
  }
}

const pick = (w) => ({ sessions: w.sessions, stoppedSessions: w.stoppedSessions, activeDays: w.activeDays, minutes: w.minutes, exercises: w.exercises, adherence: w.adherence, meanAccuracy: w.meanAccuracy })

export function history(db, patientId, { limit = 50, before } = {}) {
  const sessions = db.all(
    `SELECT id, started_at, ended_at, status, fatigue_before, fatigue_after, discomfort, stop_reason FROM exercise_sessions
     WHERE patient_id = ? AND status != 'in_progress' ${before ? 'AND started_at < ?' : ''} ORDER BY started_at DESC LIMIT ?`,
    ...(before ? [patientId, before, limit] : [patientId, limit]),
  )
  const ids = sessions.map((s) => s.id)
  const results = ids.length
    ? db.all(`SELECT session_id, exercise_id, domain, level, completed, duration_ms, accuracy, mean_rt_ms, errors, metrics, created_at FROM exercise_results WHERE session_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`, ...ids)
    : []
  return sessions.map((s) => ({
    ...s,
    results: results.filter((r) => r.session_id === s.id).map((r) => ({ ...r, title: EXERCISE_BY_ID[r.exercise_id]?.title ?? r.exercise_id, metrics: parse(r.metrics, {}) })),
  }))
}

export function exerciseTrend(db, patientId, exerciseId, limit = 10) {
  return db.all(
    'SELECT level, accuracy, mean_rt_ms, errors, duration_ms, completed, created_at FROM exercise_results WHERE patient_id = ? AND exercise_id = ? ORDER BY created_at DESC LIMIT ?',
    patientId, exerciseId, limit,
  ).reverse()
}

export function weeklyProgress(db, patientId) {
  const profile = db.get('SELECT sessions_per_week_goal, session_minutes_goal FROM patient_profiles WHERE user_id = ?', patientId)
  const d = new Date()
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
  const rows = db.all("SELECT started_at FROM exercise_sessions WHERE patient_id = ? AND status = 'completed' AND started_at >= ?", patientId, monday.toISOString())
  const days = new Set(rows.map((r) => r.started_at.slice(0, 10)))
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = isoDay(monday.getTime() + i * DAY)
    return { date: day, practiced: days.has(day) }
  })
  return { goalSessions: profile?.sessions_per_week_goal ?? 5, goalMinutes: profile?.session_minutes_goal ?? 20, completedSessions: rows.length, week }
}
