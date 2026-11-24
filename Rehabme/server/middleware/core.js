// Request context, authentication, authorization, validation, audit and error handling.
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { HttpError, unauthorized, forbidden, badRequest } from '../lib/errors.js'
import { sha256 } from '../lib/crypto.js'
import { now, uuid, json } from '../db/sqlite.js'

export function requestContext(log) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id')
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
    res.setHeader('x-request-id', req.id)
    const start = process.hrtime.bigint()
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6
      // Never log bodies, query strings or auth headers (may contain health data / tokens).
      log.info({ reqId: req.id, method: req.method, route: req.route?.path ?? req.path.split('?')[0], status: res.statusCode, ms: Math.round(ms), uid: req.user?.id }, 'request')
    })
    next()
  }
}

export function authenticate(ctx) {
  return async (req, res, next) => {
    try {
      const header = req.get('authorization') || ''
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
      if (!token) throw unauthorized()
      const claims = await ctx.tokens.verify(token)
      req.user = provisionUser(ctx.db, claims)
      if (req.user.deleted_at) throw unauthorized('Учётная запись удалена')
      next()
    } catch (e) {
      next(e)
    }
  }
}

// Just-in-time provisioning: every verified identity maps to exactly one user row (default role: patient).
// Roles are never taken from the token — only from the database, set by an administrator.
export function provisionUser(db, claims) {
  const existing = db.get('SELECT * FROM users WHERE auth_provider = ? AND auth_uid = ?', claims.provider, claims.uid)
  if (existing) return existing
  // A still-unexpired token for an erased local account must not resurrect it.
  if (claims.provider === 'local' && db.get('SELECT 1 FROM users WHERE id = ?', claims.uid)) throw unauthorized('Учётная запись удалена')
  const t = now()
  const id = claims.provider === 'local' ? claims.uid : uuid()
  db.run(
    'INSERT INTO users (id, auth_provider, auth_uid, email, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    id, claims.provider, claims.uid, claims.email, claims.name, 'patient', t, t,
  )
  return db.get('SELECT * FROM users WHERE id = ?', id)
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden())

// Patient-data isolation: a user may read a patient's data only if they ARE the patient,
// or they are a clinician with an active, patient-granted care relationship.
export function canAccessPatient(db, user, patientId) {
  if (!user) return false
  if (user.id === patientId) return true
  if (user.role !== 'clinician') return false
  return !!db.get("SELECT 1 FROM care_relationships WHERE patient_id = ? AND clinician_id = ? AND status = 'active'", patientId, user.id)
}

export function assertPatientAccess(ctx, req, patientId, action) {
  const ok = canAccessPatient(ctx.db, req.user, patientId)
  ctx.audit(req, { action, resourceType: 'patient', resourceId: patientId, patientId, outcome: ok ? 'success' : 'denied' })
  if (!ok) throw forbidden('Нет доступа к данным этого пациента')
}

export const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source])
  if (!r.success) return next(badRequest('Проверьте введённые данные', r.error.flatten()))
  if (source === 'body') req.body = r.data
  else req.valid = { ...(req.valid || {}), [source]: r.data }
  next()
}

export function createAuditLogger(db, salt) {
  return (req, { action, resourceType = null, resourceId = null, patientId = null, outcome = 'success', details = {} }) => {
    try {
      db.run(
        'INSERT INTO audit_logs (at, request_id, actor_id, actor_role, action, resource_type, resource_id, patient_id, outcome, ip_hash, details) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        now(), req?.id ?? null, req?.user?.id ?? null, req?.user?.role ?? null, action, resourceType, resourceId, patientId, outcome,
        req?.ip ? sha256(salt + req.ip).slice(0, 32) : null, json(details),
      )
    } catch {
      /* audit must never break the request path; failures surface via logs */
    }
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Маршрут не найден' } })
}

export function errorHandler(log, { exposeDetails }) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof ZodError) err = badRequest('Проверьте введённые данные', err.flatten())
    if (err?.type === 'entity.too.large') err = new HttpError(413, 'payload_too_large', 'Слишком большой запрос')
    if (err?.type === 'entity.parse.failed') err = badRequest('Некорректный JSON')
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } })
    }
    log.error({ reqId: req.id, err: { message: err?.message, stack: exposeDetails ? err?.stack : undefined } }, 'unhandled error')
    res.status(500).json({ error: { code: 'internal', message: 'Внутренняя ошибка. Мы уже разбираемся.', requestId: req.id } })
  }
}
