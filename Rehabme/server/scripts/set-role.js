// `npm run admin:set-role -- <email> <patient|clinician|admin>`
// Roles are granted out-of-band by an operator (after verifying the clinician's credentials), never self-assigned.
import { config } from '../config.js'
import { openDatabase, migrate, now } from '../db/sqlite.js'
import { createAuditLogger } from '../middleware/core.js'

const [email, role] = process.argv.slice(2)
if (!email || !['patient', 'clinician', 'admin'].includes(role)) {
  console.error('Usage: npm run admin:set-role -- <email> <patient|clinician|admin>')
  process.exit(1)
}
const db = openDatabase(config.DATABASE_PATH)
migrate(db)
const user = db.get('SELECT id, role FROM users WHERE lower(email) = lower(?) AND deleted_at IS NULL', email)
if (!user) { console.error('No such user (they must sign in once first).'); process.exit(1) }
db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, now(), user.id)
createAuditLogger(db, config.AUDIT_IP_SALT)({ id: 'cli', user: { id: 'operator-cli', role: 'admin' } }, { action: 'admin.set_role', resourceType: 'user', resourceId: user.id, details: { from: user.role, to: role } })
console.log(`Role for ${email}: ${user.role} → ${role}`)
db.close()
