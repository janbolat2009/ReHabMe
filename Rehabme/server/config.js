// Central, validated runtime configuration. Fails fast on unsafe combinations.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(__dirname, '..')

// Minimal .env loader (avoids an extra dependency). Real env vars always win.
function loadDotEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const [, key, raw] = m
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, '')
  }
}
if (process.env.NODE_ENV !== 'test' && process.env.APP_ENV !== 'test') loadDotEnv(resolve(ROOT, '.env'))

const bool = (def) => z.enum(['true', 'false', '1', '0']).optional().transform((v) => (v === undefined ? def : v === 'true' || v === '1'))

const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'demo', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_PATH: z.string().default(resolve(ROOT, 'server/data/rehabme.sqlite')),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: bool(false),

  AUTH_PROVIDER: z.enum(['firebase', 'local']).default('local'),
  FIREBASE_PROJECT_ID: z.string().default('rehabme-4ba77'),
  LOCAL_AUTH_SECRET: z.string().optional(),

  DATA_ENCRYPTION_KEY: z.string().optional(), // 32-byte base64; required outside dev/test
  AUDIT_IP_SALT: z.string().default('dev-salt-change-me'),

  OPENAI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  // External LLM processing of patient text needs a legal basis (DPA) — opt-in only.
  LLM_EXTERNAL_PROCESSING_APPROVED: bool(false),
  KB_REQUIRE_APPROVED: bool(true),
  AI_MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  ML_SERVICE_URL: z.string().default('http://127.0.0.1:8001'),
  ML_TIMEOUT_MS: z.coerce.number().int().default(3000),
  // Demo mode may serve a model trained on a synthetic test fixture, always labelled as such.
  ML_ALLOW_DEMO_MODELS: bool(false),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVE_STATIC: bool(false),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}
export const config = parsed.data

const isDevLike = ['development', 'test'].includes(config.APP_ENV)

// ---- Safety checks: refuse to boot in unsafe configurations ----
const problems = []
if (config.APP_ENV === 'production') {
  if (config.AUTH_PROVIDER !== 'firebase') problems.push('AUTH_PROVIDER=local is not allowed in production')
  if (config.ML_ALLOW_DEMO_MODELS) problems.push('ML_ALLOW_DEMO_MODELS must be false in production')
  if (!config.KB_REQUIRE_APPROVED) problems.push('KB_REQUIRE_APPROVED must be true in production')
}
if (config.AUTH_PROVIDER === 'local') {
  if (!config.LOCAL_AUTH_SECRET) {
    if (isDevLike) config.LOCAL_AUTH_SECRET = 'dev-only-insecure-secret-' + config.APP_ENV
    else problems.push('LOCAL_AUTH_SECRET is required when AUTH_PROVIDER=local')
  } else if (config.LOCAL_AUTH_SECRET.length < 32 && !isDevLike) {
    problems.push('LOCAL_AUTH_SECRET must be at least 32 characters')
  }
}
if (!config.DATA_ENCRYPTION_KEY) {
  if (isDevLike) config.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64') // deterministic dev key
  else problems.push('DATA_ENCRYPTION_KEY (32-byte base64) is required outside development/test')
}
if (problems.length) {
  console.error('Refusing to start:\n - ' + problems.join('\n - '))
  process.exit(1)
}

export const isProduction = config.APP_ENV === 'production'
export const isDevLikeEnv = isDevLike
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
