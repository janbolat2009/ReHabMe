// Express application factory (no side effects → testable with an in-memory database).
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { requestContext, authenticate, notFoundHandler, errorHandler, createAuditLogger } from './middleware/core.js'
import { createFieldCipher } from './lib/crypto.js'
import { createNotifier } from './services/notifications.js'
import { createAssistant } from './services/assistant/assistant.js'
import { authRoutes } from './routes/auth.js'
import { patientRoutes } from './routes/patient.js'
import { aiRoutes } from './routes/ai.js'
import { clinicianRoutes } from './routes/clinician.js'
import { ROOT } from './config.js'

export function createApp({ config, db, log, ml, tokens, openai = null }) {
  const ctx = {
    config, db, log, ml, tokens,
    cipher: createFieldCipher(config.DATA_ENCRYPTION_KEY),
    audit: createAuditLogger(db, config.AUDIT_IP_SALT),
    notify: createNotifier(db),
  }
  ctx.assistant = createAssistant({ config, log, openai })

  const app = express()
  app.disable('x-powered-by')
  if (config.TRUST_PROXY) app.set('trust proxy', 1)

  const serveStatic = config.SERVE_STATIC && existsSync(resolve(ROOT, 'dist/index.html'))
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: serveStatic
        ? {
            'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'"], 'font-src': ["'self'", 'data:'],
            'connect-src': ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
            'frame-ancestors': ["'none'"], 'base-uri': ["'self'"], 'form-action': ["'self'"], 'object-src': ["'none'"],
          }
        : { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.APP_ENV === 'production' ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }))
  app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next() })

  // CORS allowlist (Bearer tokens, no cookies → no ambient credentials, so CSRF does not apply).
  const allowed = new Set(config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean))
  app.use((req, res, next) => {
    const origin = req.get('origin')
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-request-id')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Max-Age', '600')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin && allowed.has(origin) ? 204 : 403)
    next()
  })

  app.use(requestContext(log))
  app.use(express.json({ limit: '100kb' }))
  app.use((req, res, next) => { if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store'); next() })

  // ---- Health ----
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }))
  app.get('/readyz', async (req, res) => {
    let dbOk = false
    try { dbOk = db.get('SELECT 1 AS ok').ok === 1 } catch { /* reported below */ }
    const mlStatus = await ml.status()
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ready' : 'degraded',
      checks: { database: dbOk ? 'ok' : 'fail', mlService: mlStatus.available ? 'ok' : 'unavailable (optional)', knowledgeBaseChunks: ctx.assistant.index.size },
      env: config.APP_ENV,
    })
  })

  // ---- Rate limiting ----
  const isTest = config.APP_ENV === 'test'
  const limiter = (opts) => rateLimit({ standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'rate_limited', message: 'Слишком много запросов. Подождите немного.' } }, skip: () => isTest && !opts.enforceInTest, ...opts })
  app.use('/api/', limiter({ windowMs: 15 * 60e3, limit: 1000 }))
  const byUser = (req) => req.user?.id ?? req.ip

  // ---- API v1 ----
  if (config.AUTH_PROVIDER === 'local') {
    app.use('/api/v1/auth/local', limiter({ windowMs: 15 * 60e3, limit: 30, enforceInTest: true }), authRoutes(ctx))
  }
  app.get('/api/v1/meta', (req, res) => res.json({ authProvider: config.AUTH_PROVIDER, env: config.APP_ENV, version: process.env.npm_package_version ?? '2.0.0' }))

  const api = express.Router()
  api.use(authenticate(ctx))
  api.use('/assistant/messages', limiter({ windowMs: 60 * 60e3, limit: 60, keyGenerator: byUser }))
  api.use('/predictions', limiter({ windowMs: 60 * 60e3, limit: 30, keyGenerator: byUser }))
  api.use(patientRoutes(ctx))
  api.use(aiRoutes(ctx))
  api.use('/clinician', clinicianRoutes(ctx))
  app.use('/api/v1', api)
  app.use('/api', notFoundHandler)

  // ---- Static SPA (single-container deployments) ----
  if (serveStatic) {
    const dist = resolve(ROOT, 'dist')
    app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache') } }))
    app.get('*', (req, res) => res.sendFile(resolve(dist, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }))
  }

  app.use(errorHandler(log, { exposeDetails: config.APP_ENV !== 'production' }))
  return { app, ctx }
}
