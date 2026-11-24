// Process entrypoint: config → logger → database (+migrations) → services → HTTP server.
import pino from 'pino'
import OpenAI from 'openai'
import { config } from './config.js'
import { openDatabase, migrate } from './db/sqlite.js'
import { createApp } from './app.js'
import { createMlClient } from './services/mlClient.js'
import { createTokenService } from './auth/tokens.js'

const log = pino({
  level: config.LOG_LEVEL,
  base: { service: 'rehabme-api', env: config.APP_ENV },
  redact: { paths: ['req.headers.authorization', '*.password', '*.token', '*.message', '*.content'], censor: '[redacted]' },
})

const db = openDatabase(config.DATABASE_PATH)
migrate(db, (m) => log.info(m))

const openai = config.OPENAI_API_KEY && config.LLM_EXTERNAL_PROCESSING_APPROVED ? new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 20000, maxRetries: 1 }) : null
if (config.OPENAI_API_KEY && !config.LLM_EXTERNAL_PROCESSING_APPROVED) {
  log.warn('OPENAI_API_KEY is set but LLM_EXTERNAL_PROCESSING_APPROVED=false — assistant runs in local extractive mode (no patient text leaves the server).')
}

const { app } = createApp({ config, db, log, ml: createMlClient(config, log), tokens: createTokenService(config), openai })

// Data retention: assistant transcripts are kept only for AI_MESSAGE_RETENTION_DAYS.
function purgeExpired() {
  const cutoff = new Date(Date.now() - config.AI_MESSAGE_RETENTION_DAYS * 864e5).toISOString()
  const r = db.run('DELETE FROM ai_conversations WHERE created_at < ?', cutoff)
  db.run("UPDATE share_codes SET used_at = COALESCE(used_at, 'expired') WHERE expires_at < ? AND used_at IS NULL", new Date().toISOString())
  if (r.changes) log.info({ removed: r.changes }, 'retention: purged expired assistant conversations')
}
purgeExpired()
setInterval(purgeExpired, 6 * 3600e3).unref()

const server = app.listen(config.PORT, () => log.info({ port: config.PORT, auth: config.AUTH_PROVIDER }, 'ReHabMe API listening'))

function shutdown(signal) {
  log.info({ signal }, 'shutting down')
  server.close(() => { db.close(); process.exit(0) })
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
