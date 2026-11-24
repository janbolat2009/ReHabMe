import { now, uuid } from '../db/sqlite.js'

// Idempotent: the (user_id, dedupe_key) unique index prevents duplicate notifications.
export function createNotifier(db) {
  return (userId) => ({ kind, title, body, link = null, dedupeKey = null }) => {
    db.run(
      'INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body, link, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?,?)',
      uuid(), userId, kind, title, body, link, dedupeKey, now(),
    )
  }
}
