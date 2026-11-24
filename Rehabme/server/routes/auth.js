// Local email/password auth — ONLY for development, automated tests, staging and the public demo.
// Production uses Firebase Authentication (config refuses AUTH_PROVIDER=local in production).
import { Router } from 'express'
import { z } from 'zod'
import { ah, unauthorized, conflict, HttpError } from '../lib/errors.js'
import { validate } from '../middleware/core.js'
import { hashPassword, verifyPassword } from '../lib/crypto.js'
import { now, uuid } from '../db/sqlite.js'

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, 'Пароль должен быть не короче 10 символов').max(200),
})
const registration = credentials.extend({ displayName: z.string().trim().min(1).max(80) })

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export function authRoutes(ctx) {
  const r = Router()

  r.post('/register', validate(registration), ah(async (req, res) => {
    const { email, password, displayName } = req.body
    if (ctx.db.get('SELECT 1 FROM local_credentials WHERE email = ?', email)) throw conflict('Этот email уже зарегистрирован')
    const id = uuid(), t = now()
    const hash = await hashPassword(password)
    ctx.db.transaction((tx) => {
      tx.run('INSERT INTO users (id, auth_provider, auth_uid, email, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, 'local', id, email, displayName, 'patient', t, t)
      tx.run('INSERT INTO local_credentials (user_id, email, password_hash) VALUES (?,?,?)', id, email, hash)
    })
    const user = ctx.db.get('SELECT * FROM users WHERE id = ?', id)
    ctx.audit({ ...req, user }, { action: 'auth.register', resourceType: 'user', resourceId: id })
    res.status(201).json({ token: await ctx.tokens.issue(user) })
  }))

  r.post('/login', validate(credentials), ah(async (req, res) => {
    const { email, password } = req.body
    const cred = ctx.db.get('SELECT * FROM local_credentials WHERE email = ?', email)
    if (cred?.locked_until && Date.parse(cred.locked_until) > Date.now()) {
      throw new HttpError(429, 'locked', 'Слишком много неудачных попыток. Попробуйте через 15 минут.')
    }
    const ok = cred ? await verifyPassword(password, cred.password_hash) : (await hashPassword(password), false) // similar timing for unknown emails
    if (!ok) {
      if (cred) {
        const attempts = cred.failed_attempts + 1
        const lock = attempts >= MAX_ATTEMPTS
        ctx.db.run('UPDATE local_credentials SET failed_attempts = ?, locked_until = ? WHERE user_id = ?', lock ? 0 : attempts, lock ? new Date(Date.now() + LOCK_MINUTES * 6e4).toISOString() : null, cred.user_id)
      }
      ctx.audit(req, { action: 'auth.login', outcome: 'denied', details: { reason: 'bad_credentials' } })
      throw unauthorized('Неверный email или пароль')
    }
    ctx.db.run('UPDATE local_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?', cred.user_id)
    const user = ctx.db.get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', cred.user_id)
    if (!user) throw unauthorized('Неверный email или пароль')
    ctx.audit({ ...req, user }, { action: 'auth.login', resourceType: 'user', resourceId: user.id })
    res.json({ token: await ctx.tokens.issue(user) })
  }))

  return r
}
