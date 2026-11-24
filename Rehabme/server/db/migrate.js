// `npm run db:migrate` — applies pending SQL migrations. Take a backup first in staging/production:
//   sqlite3 "$DATABASE_PATH" ".backup '/backups/rehabme-$(date +%F-%H%M).sqlite'"
import { config } from '../config.js'
import { openDatabase, migrate } from './sqlite.js'

const db = openDatabase(config.DATABASE_PATH)
migrate(db, (m) => console.log(m))
console.log('migrations up to date:', db.all('SELECT name, applied_at FROM schema_migrations ORDER BY name').map((r) => r.name).join(', '))
db.close()
