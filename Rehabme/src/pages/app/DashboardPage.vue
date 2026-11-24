<template>
  <div class="dash">
    <header class="dash__head">
      <div>
        <p class="label">{{ dateLabel }}</p>
        <h1 class="dash__title">{{ greeting() }}{{ s.firstName ? `, ${s.firstName}` : '' }}.</h1>
        <p class="lede" v-if="today">{{ statusLine }}</p>
      </div>
    </header>

    <div v-if="loading" class="grid"><div class="skeleton" style="height: 380px" /><div class="skeleton" style="height: 380px" /></div>
    <StateBlock v-else-if="error" tone="error" title="Не удалось загрузить план" :text="error"><template #actions><Btn icon="refresh" @click="load">Повторить</Btn></template></StateBlock>

    <template v-else-if="today">
      <div class="grid">
        <!-- 1. What to do today -->
        <section class="panel today" aria-labelledby="today-h">
          <div class="row"><h2 id="today-h" class="h2">План на сегодня</h2><span class="chip num"><Icon name="clock" :size="16" />~{{ today.today.estimatedMinutes }} мин</span></div>
          <ol class="items">
            <li v-for="(it, i) in today.today.items" :key="it.exerciseId" class="item" :class="{ done: it.done }" :style="{ '--c': `var(--d-${it.domain})` }">
              <span class="item__state" :aria-label="it.done ? 'Выполнено' : `Упражнение ${i + 1}`"><Icon v-if="it.done" name="check" :size="18" stroke="3" /><span v-else class="num">{{ i + 1 }}</span></span>
              <span class="stack" style="--gap: 2px"><b>{{ it.title }}</b><span class="muted small"><Icon :name="DOMAIN_ICON[it.domain]" :size="14" /> {{ domainName(it.domain) }} · уровень {{ it.level }} · {{ it.minutes }} мин</span></span>
              <RouterLink v-if="!it.done" :to="`/app/practice/${it.exerciseId}`" class="item__go" :aria-label="`Выполнить отдельно: ${it.title}`"><Icon name="right" /></RouterLink>
            </li>
          </ol>
          <div class="cluster hand-aware">
            <Btn v-if="remaining" size="lg" icon="play" to="/app/session">{{ doneCount ? 'Продолжить занятие' : 'Начать занятие' }}</Btn>
            <p v-else class="done-msg"><Icon name="check" /> Всё на сегодня выполнено. Отдых — тоже часть восстановления.</p>
          </div>
        </section>

        <!-- 2. Week & what's next -->
        <div class="stack side-col">
          <section class="panel" aria-labelledby="week-h">
            <div class="row"><h2 id="week-h" class="h2">Неделя</h2><span class="num"><b>{{ today.week.completedSessions }}</b> / {{ today.week.goalSessions }} занятий</span></div>
            <ol class="week">
              <li v-for="d in today.week.week" :key="d.date" :class="{ on: d.practiced, now: d.date === todayIso }">
                <span class="week__dot" :aria-label="`${weekday(d.date)}: ${d.practiced ? 'было занятие' : 'не было занятия'}`"><Icon v-if="d.practiced" name="check" :size="14" stroke="3" /></span>
                <span class="small">{{ weekday(d.date) }}</span>
              </li>
            </ol>
            <div class="bar" role="progressbar" :aria-valuenow="today.week.completedSessions" aria-valuemin="0" :aria-valuemax="today.week.goalSessions" aria-label="Выполнение недельной цели"><i :style="{ width: `${Math.min(100, (today.week.completedSessions / today.week.goalSessions) * 100)}%` }" /></div>
          </section>
          <section class="panel" aria-labelledby="next-h">
            <h2 id="next-h" class="h2">Дальше по программе</h2>
            <ul class="next">
              <li><Icon name="calendar" /><span><b>Повторная самооценка</b><br /><span class="muted">{{ today.nextReassessment ? fmtDate(today.nextReassessment) : 'после первой недели' }}</span></span><RouterLink v-if="reassessDue" to="/app/assessment" class="chip chip-accent">Пройти</RouterLink></li>
              <li><Icon name="steps" /><span><b>Прогноз</b><br /><span class="muted">{{ predictionLine }}</span></span><RouterLink to="/app/prediction" class="chip">Открыть</RouterLink></li>
              <li v-if="meds.length"><Icon name="pill" /><span><b>Лекарства сегодня</b><br /><span class="muted">{{ meds.filter((m) => m.takenToday).length }} из {{ meds.length }} отмечено</span></span><RouterLink to="/app/profile#meds" class="chip">Отметить</RouterLink></li>
            </ul>
          </section>
        </div>
      </div>

      <!-- 3. What changed & why -->
      <section v-if="today.recommendations.length" class="sec" aria-labelledby="rec-h">
        <div class="row"><h2 id="rec-h" class="h2">Что изменилось в программе</h2><RouterLink to="/app/plan" class="small">Вся программа</RouterLink></div>
        <ul class="recs">
          <li v-for="r in today.recommendations" :key="r.id" class="rec" :class="`rec--${r.type}`">
            <Icon :name="REC[r.type]?.icon ?? 'info'" />
            <div class="stack" style="--gap: 4px">
              <b>{{ recTitle(r) }}</b>
              <span class="muted">{{ r.payload.message ?? REC[r.type]?.text }}</span>
              <details><summary>Почему?</summary><p class="small muted">{{ explain(r) }}</p></details>
            </div>
            <span v-if="r.status === 'pending_clinician'" class="chip chip-warn">ждёт решения врача</span>
            <button v-else class="rec__x" @click="dismiss(r)" :aria-label="`Скрыть: ${recTitle(r)}`"><Icon name="x" :size="18" /></button>
          </li>
        </ul>
      </section>

      <!-- 4. How results change (exercise performance — not recovery) -->
      <section class="sec" aria-labelledby="perf-h">
        <div class="row"><h2 id="perf-h" class="h2">Результаты упражнений · 30 дней</h2><RouterLink to="/app/progress" class="small">Подробнее</RouterLink></div>
        <div v-if="perfDomains.length" class="perf">
          <article v-for="d in perfDomains" :key="d.key" class="perf__card" :style="{ '--c': `var(--d-${d.key})` }">
            <div class="row"><span class="perf__name"><Icon :name="DOMAIN_ICON[d.key]" :size="18" />{{ d.label }}</span><span class="num perf__val">{{ pct(d.meanAccuracy) }}</span></div>
            <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path :d="spark(d.series)" /></svg>
            <span class="small muted">{{ trendText(d) }}</span>
          </article>
        </div>
        <StateBlock v-else title="Пока нет результатов" text="После первых занятий здесь появится динамика точности по направлениям." icon="chart" />
      </section>

      <!-- 5. Timeline -->
      <section class="sec" aria-labelledby="tl-h">
        <h2 id="tl-h" class="h2">Недавние занятия</h2>
        <ol v-if="history.length" class="timeline">
          <li v-for="h in history" :key="h.id"><span class="tl__dot" :class="h.status" /><span class="stack" style="--gap: 2px"><b>{{ fmtDate(h.started_at, { day: 'numeric', month: 'long', weekday: 'short' }) }}</b><span class="muted small">{{ h.results.length }} {{ plural(h.results.length, 'упражнение', 'упражнения', 'упражнений') }} · {{ h.status === 'completed' ? 'завершено' : 'остановлено' }}{{ h.discomfort >= 7 ? ' · отмечен сильный дискомфорт' : '' }}</span></span></li>
        </ol>
        <p v-else class="muted">Здесь появится история ваших занятий.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { useSession } from '@/stores/session'
import { useToasts } from '@/stores/toasts'
import { greeting, fmtDate, pct, plural, DOMAIN_ICON } from '@/lib/ui'

const s = useSession(), toasts = useToasts(), router = useRouter()
const loading = ref(true), error = ref(''), today = ref(null), summary = ref(null), history = ref([]), meds = ref([]), prediction = ref(null)
const todayIso = new Date().toISOString().slice(0, 10)
const dateLabel = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
const DOMAIN_NAMES = { memory: 'Память', attention: 'Внимание', cognition: 'Мышление', motor: 'Моторика', speech: 'Речь', wellbeing: 'Самочувствие' }
const domainName = (d) => DOMAIN_NAMES[d] ?? d
const weekday = (d) => new Date(d).toLocaleDateString('ru-RU', { weekday: 'short' })
const REC = {
  difficulty_change: { icon: 'layers', text: 'Сложность изменена по результатам занятий.' },
  rest: { icon: 'moon', text: 'Сделайте следующее занятие короче или отдохните.' },
  clinician_contact: { icon: 'alert', text: 'Обсудите самочувствие с врачом.' },
  reassessment: { icon: 'calendar', text: 'Пора обновить самооценку.' },
  consistency: { icon: 'clock', text: 'Короткое занятие сегодня поможет сохранить ритм.' },
}

const doneCount = computed(() => today.value?.today.items.filter((i) => i.done).length ?? 0)
const remaining = computed(() => (today.value?.today.items.length ?? 0) - doneCount.value)
const statusLine = computed(() => {
  const n = today.value.today.items.length
  if (!remaining.value) return 'План на сегодня выполнен.'
  return `Сегодня ${n} ${plural(n, 'упражнение', 'упражнения', 'упражнений')}, около ${today.value.today.estimatedMinutes} минут${doneCount.value ? ` · выполнено ${doneCount.value}` : ''}.`
})
const reassessDue = computed(() => today.value?.nextReassessment && Date.parse(today.value.nextReassessment) <= Date.now())
const predictionLine = computed(() => {
  const p = prediction.value
  if (!p) return 'Пока не рассчитывался'
  if (p.status === 'ok') return `${p.mode === 'demo' ? 'Демо-режим · ' : ''}рассчитан ${fmtDate(p.createdAt)}`
  if (p.status === 'abstained') return 'Недостаточно данных для оценки'
  return 'Модель пока недоступна'
})
const perfDomains = computed(() => Object.entries(summary.value?.performance ?? {}).map(([key, v]) => ({ key, ...v })).filter((d) => d.meanAccuracy != null))
const recTitle = (r) => (r.type === 'difficulty_change' ? `${domainName(r.domain)}: уровень ${r.payload.from} → ${r.payload.to}` : { rest: 'Рекомендуем отдых', clinician_contact: 'Свяжитесь с врачом', reassessment: 'Повторная оценка', consistency: 'Сохраним ритм' }[r.type])
function explain(r) {
  const x = r.rationale
  if (x.rule === 'promote_high_accuracy') return `Последние ${x.window} результата на уровне ${x.level}: средняя точность ${Math.round(x.meanAccuracy * 100)}% (порог 85%), без сильной усталости и дискомфорта.`
  if (x.rule === 'demote_low_accuracy') return `Последние ${x.window} результата на уровне ${x.level}: средняя точность ${Math.round(x.meanAccuracy * 100)}% (ниже 50%). Чуть более лёгкий уровень поможет заниматься комфортнее.`
  if (x.rule === 'discomfort_stop') return `После занятия вы отметили дискомфорт ${x.discomfort} из 10 (порог ${x.threshold}).`
  if (x.rule === 'high_fatigue') return `После занятия вы отметили усталость ${x.fatigueAfter} из 10.`
  if (x.rule === 'reassessment_interval') return `С последней самооценки прошло ${x.daysSinceLast} дн. (интервал ${x.interval}).`
  if (x.rule === 'inactivity') return `Последнее занятие было ${fmtDate(x.lastSession)}.`
  if (x.outOfRange) return `Изменение выходит за пределы, разрешённые специалистом (${x.outOfRange.min}–${x.outOfRange.max}), поэтому требует его решения.`
  return 'Правило программы персонализации.'
}
const spark = (series) => {
  const pts = series.filter((p) => p.accuracy != null)
  if (!pts.length) return ''
  return pts.map((p, i) => `${i ? 'L' : 'M'}${pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100},${30 - p.accuracy * 28}`).join('')
}
const trendText = (d) => d.previousMeanAccuracy == null ? `${d.attempts} ${plural(d.attempts, 'попытка', 'попытки', 'попыток')}` : `${d.meanAccuracy >= d.previousMeanAccuracy ? '↑' : '↓'} ${Math.abs(Math.round((d.meanAccuracy - d.previousMeanAccuracy) * 100))} п.п. к прошлому периоду`

async function load() {
  loading.value = true; error.value = ''
  try {
    const t = await api.get('/today')
    if (t.needsScreening) return router.replace('/welcome')
    today.value = t
    const [sm, hi, md, pr] = await Promise.allSettled([api.get('/analytics/summary?period=30'), api.get('/analytics/history?limit=5'), api.get('/medications'), api.get('/predictions/latest')])
    summary.value = sm.value ?? null; history.value = hi.value?.sessions ?? []; meds.value = md.value ?? []; prediction.value = pr.value?.prediction ?? null
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function dismiss(r) {
  try { await api.post(`/recommendations/${r.id}/dismiss`); today.value.recommendations = today.value.recommendations.filter((x) => x.id !== r.id) } catch (e) { toasts.error(e.message) }
}
onMounted(load)
</script>

<style scoped>
.dash { display: grid; gap: var(--s-6); }
.dash__title { font-family: var(--font-display); font-weight: 400; letter-spacing: -0.035em; font-size: var(--t-3xl); margin: var(--s-2) 0; }
.h2 { font-size: var(--t-xl); }
.row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
.small { font-size: var(--t-sm); }
.grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: var(--s-5); align-items: start; }
.grid > *, .dash > * { min-width: 0; }
.today { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-5); }
.item > .stack { min-width: 0; overflow-wrap: anywhere; hyphens: auto; }
.items { list-style: none; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-2); }
.item { display: flex; align-items: center; gap: var(--s-4); padding: var(--s-3) var(--s-4); border-radius: 18px; background: var(--paper); border-left: 5px solid var(--c); }
.item.done { opacity: 0.72; }
.item.done b { text-decoration: line-through; text-decoration-thickness: 1px; }
.item__state { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 2px var(--line-strong); font-weight: 700; }
.item.done .item__state { background: var(--teal); color: #fff; box-shadow: none; }
.item__go { margin-left: auto; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; color: var(--ink); }
.item__go:hover { background: var(--paper-2); }
.done-msg { display: flex; gap: var(--s-2); align-items: center; color: var(--teal); font-weight: 600; }
.side-col { --gap: var(--s-5); }
.week { list-style: none; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin: var(--s-4) 0; text-align: center; }
.week li { display: grid; justify-items: center; gap: 6px; }
.week__dot { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--paper-2); color: #fff; }
.week li.on .week__dot { background: var(--teal); }
.week li.now .week__dot { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
.bar { height: 10px; border-radius: 5px; background: var(--paper-2); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--teal); border-radius: 5px; transition: width var(--d-slow) var(--ease-out); }
.next { list-style: none; display: grid; margin-top: var(--s-3); }
.next li { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
.next li:last-child { border-bottom: 0; }
.next li > span { flex: 1; }
.next .chip { text-decoration: none; }
.sec { display: grid; gap: var(--s-4); }
.recs { list-style: none; display: grid; gap: var(--s-2); }
.rec { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); }
.rec > div { flex: 1; }
.rec--clinician_contact { background: var(--danger-soft); }
.rec details summary { cursor: pointer; font-weight: 500; color: var(--accent-ink); width: fit-content; }
.rec__x { width: 44px; height: 44px; border-radius: 50%; border: 0; background: transparent; display: grid; place-items: center; }
.rec__x:hover { background: var(--paper-2); }
.perf { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--s-3); }
.perf__card { display: grid; gap: var(--s-2); padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); border-top: 4px solid var(--c); }
.perf__name { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; }
.perf__name :deep(svg) { color: var(--c); }
.perf__val { font-family: var(--font-display); font-size: var(--t-xl); }
.spark { width: 100%; height: 36px; overflow: visible; }
.spark path { fill: none; stroke: var(--c); stroke-width: 2.4; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.timeline { list-style: none; display: grid; gap: var(--s-3); border-left: 2px solid var(--line); padding-left: var(--s-4); margin-left: 8px; }
.timeline li { display: flex; gap: var(--s-3); position: relative; }
.tl__dot { position: absolute; left: calc(-1 * var(--s-4) - 8px); top: 6px; width: 14px; height: 14px; border-radius: 50%; background: var(--teal); border: 3px solid var(--paper); }
.tl__dot.stopped { background: var(--ink-3); }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
