// Curated knowledge base + BM25 retrieval (runs fully locally — no patient text leaves the server for search).
// Every chunk keeps provenance: document id, title, source, version, review status.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXERCISES, LIBRARY_VERSION, DOMAINS } from '../library.js'

const KB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../knowledge')

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: m[2] }
}

export function loadDocuments() {
  const docs = readdirSync(KB_DIR).filter((f) => f.endsWith('.md')).map((f) => {
    const { meta, body } = parseFrontmatter(readFileSync(resolve(KB_DIR, f), 'utf8'))
    return { id: meta.id || f.replace(/\.md$/, ''), title: meta.title || f, source: meta.source || 'ReHabMe', sourceUrl: meta.source_url || null, version: meta.version || '0', reviewStatus: meta.review_status || 'draft', category: meta.category || 'general', body }
  })
  // Exercise instructions are generated from the controlled library so they never drift from the app.
  for (const e of EXERCISES) {
    docs.push({
      id: `exercise-${e.id}`, title: `Упражнение «${e.title}»`, source: `Библиотека упражнений ReHabMe v${LIBRARY_VERSION}`, sourceUrl: null,
      version: LIBRARY_VERSION, reviewStatus: e.approval.status === 'approved' ? 'approved' : 'draft', category: 'exercise',
      body: `## ${e.title}\nНаправление: ${DOMAINS[e.domain].label}. ${e.summary}\nПримерная длительность: ${e.minutes} мин.\nКак выполнять: ${e.instructions.join(' ')}\n${e.timeLimitAdjustable ? 'Ограничение по времени можно отключить в настройках доступности.' : 'В этом упражнении время — часть задания, поэтому темп на начальных уровнях медленный.'}`,
    })
  }
  return docs
}

// Split by "## " headings so citations point at a specific section.
function chunk(doc) {
  const parts = doc.body.split(/\n(?=## )/).map((p) => p.trim()).filter(Boolean)
  return parts.map((text, i) => {
    const heading = text.match(/^## (.+)$/m)?.[1] ?? doc.title
    return { id: `${doc.id}#${i}`, docId: doc.id, heading, text, doc }
  })
}

// Light Russian/English normalisation: lowercase, ё→е, crude suffix stripping (prefix-6 stemming).
const STOP = new Set('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между the a an of to is are and or in on for how what'.split(' '))
const RU_ENDINGS = /(иями|ями|ами|ость|ости|ению|ения|ение|ений|ется|ются|ться|ешь|ого|его|ому|ему|ыми|ими|ией|ия|ие|ий|ый|ой|ая|яя|ое|ее|ые|ие|ую|юю|ах|ях|ом|ем|ам|ям|ов|ев|ей|ть|ь|а|я|ы|и|у|ю|е|о)$/u
const stem = (w) => {
  if (/^[a-z]+$/.test(w)) return w.length > 6 ? w.slice(0, 6) : w
  const s = w.length > 4 ? w.replace(RU_ENDINGS, '') : w
  return s.length > 5 ? s.slice(0, 5) : s
}
export const tokenize = (s) =>
  String(s).toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)

export function buildIndex(docs) {
  const chunks = docs.flatMap(chunk)
  const tf = chunks.map((c) => {
    const m = new Map()
    for (const t of tokenize(`${c.heading} ${c.heading} ${c.text}`)) m.set(t, (m.get(t) || 0) + 1)
    return m
  })
  const lens = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0))
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length)
  const df = new Map()
  for (const m of tf) for (const t of m.keys()) df.set(t, (df.get(t) || 0) + 1)
  const N = chunks.length
  const k1 = 1.4, b = 0.75

  return {
    size: N,
    search(query, { k = 4, requireApproved = true } = {}) {
      const q = [...new Set(tokenize(query))]
      const scored = []
      chunks.forEach((c, i) => {
        if (requireApproved && c.doc.reviewStatus !== 'approved') return
        let s = 0, matched = 0
        for (const t of q) {
          const f = tf[i].get(t)
          if (!f) continue
          matched++
          const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5))
          s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * lens[i]) / avg)))
        }
        // coverage = share of query terms present; guards against single generic-word matches
        if (s > 0) scored.push({ chunk: c, score: s, coverage: q.length ? matched / q.length : 0 })
      })
      scored.sort((x, y) => y.score - x.score)
      // Keep at most two chunks per document for diversity.
      const per = new Map(), out = []
      for (const r of scored) {
        const n = per.get(r.chunk.docId) || 0
        if (n >= 2) continue
        per.set(r.chunk.docId, n + 1); out.push(r)
        if (out.length >= k) break
      }
      return { queryTerms: q.length, results: out }
    },
  }
}

export const citationOf = (c) => ({ id: c.id, title: c.doc.title, section: c.heading, source: c.doc.source, sourceUrl: c.doc.sourceUrl, version: c.doc.version, reviewStatus: c.doc.reviewStatus })
