// Thin data-access layer over Node's built-in SQLite (node:sqlite, no native addon).
// All queries use bound parameters — never string interpolation of user input.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations')

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON;')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA busy_timeout = 5000;')
  return wrap(db)
}

function wrap(db) {
  const cache = new Map()
  const stmt = (sql) => {
    let s = cache.get(sql)
    if (!s) { s = db.prepare(sql); cache.set(sql, s) }
    return s
  }
  let depth = 0
  const api = {
    raw: db,
    get: (sql, ...p) => stmt(sql).get(...p),
    all: (sql, ...p) => stmt(sql).all(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    exec: (sql) => db.exec(sql),
    // Re-entrant: the outermost call is a real transaction, nested calls become SAVEPOINTs.
    transaction(fn) {
      const sp = `sp_${depth}`
      db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`)
      depth++
      try {
        const r = fn(api)
        depth--
        db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`)
        return r
      } catch (e) {
        depth--
        db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
        throw e
      }
    },
    close: () => db.close(),
  }
  return api
}

export function migrate(db, log = () => {}) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set(db.all('SELECT name FROM schema_migrations').map((r) => r.name))
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (applied.has(f)) continue
    const sql = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8')
    db.transaction((tx) => {
      tx.exec(sql)
      tx.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', f, now())
    })
    log(`applied migration ${f}`)
  }
}

export const now = () => new Date().toISOString()
export const uuid = () => randomUUID()
export const json = (v) => JSON.stringify(v ?? null)
export const parse = (s, fallback = null) => {
  if (s == null) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
