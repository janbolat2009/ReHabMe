// `node scripts/check-release-gates.js --target technical|clinical`
// Exits non-zero if any gate of the target set is open or lacks existing evidence.
import { readFileSync, existsSync } from 'node:fs'

const i = process.argv.indexOf('--target')
const target = i > -1 ? process.argv[i + 1] : 'technical'
const gates = JSON.parse(readFileSync(new URL('../release-gates.json', import.meta.url), 'utf8'))[target]
if (!gates) { console.error(`unknown target ${target}`); process.exit(2) }
let failed = 0
for (const g of gates) {
  const evidenceOk = !!g.evidence && existsSync(new URL(`../${g.evidence}`, import.meta.url))
  const ok = g.status === 'passed' && evidenceOk
  if (!ok) failed++
  const why = ok ? '' : `  [${g.status}${g.status === 'passed' && !evidenceOk ? ', evidence missing' : ''}${g.owner ? `, owner: ${g.owner}` : ''}]`
  console.log(`${ok ? 'PASS' : 'OPEN'} ${g.id} ${g.title}${why}`)
}
console.log(`\n${target}: ${gates.length - failed}/${gates.length} gates passed`)
process.exit(failed ? 1 : 0)
