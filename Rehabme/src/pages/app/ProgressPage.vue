<template>
  <div class="stack" style="--gap: var(--s-7)">
    <header class="row">
      <div class="stack" style="--gap: var(--s-2)"><p class="label">Аналитика</p><h1 class="title">Прогресс</h1></div>
      <Segmented v-model="period" label="Период" :options="[{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '90', label: '90 дней' }]" />
    </header>
    <p class="note"><Icon name="info" :size="18" />Три группы показателей показаны раздельно: регулярность занятий, результаты упражнений и клинические шкалы. Мы не объединяем их в общий «балл восстановления».</p>

    <div v-if="loading" class="stack"><div class="skeleton" style="height: 220px" /><div class="skeleton" style="height: 320px" /></div>
    <StateBlock v-else-if="error" tone="error" title="Не удалось загрузить аналитику" :text="error"><template #actions><Btn icon="refresh" @click="load">Повторить</Btn></template></StateBlock>
    <template v-else-if="data">
      <!-- 1. Engagement -->
      <section class="stack" aria-labelledby="eng-h">
        <h2 id="eng-h" class="h2"><span class="num badge-n">1</span> Регулярность</h2>
        <div class="kpis">
          <div v-for="k in kpis" :key="k.label" class="kpi"><span class="muted">{{ k.label }}</span><b class="num">{{ k.value }}</b><span v-if="k.delta" class="small" :class="k.delta.startsWith('+') ? 'up' : 'down'">{{ k.delta }} к прошлым {{ period }} дн.</span></div>
        </div>
        <div class="panel"><BarChart :data="dailyBars" :aria-label="`Минуты занятий по дням за ${period} дней`" :format="(v) => `${v} мин`" /></div>
      </section>

      <!-- 2. Exercise performance -->
      <section class="stack" aria-labelledby="perf-h">
        <h2 id="perf-h" class="h2"><span class="num badge-n">2</span> Результаты упражнений</h2>
        <template v-if="domains.length">
          <Segmented v-model="metric" label="Показатель" :options="[{ value: 'accuracy', label: 'Точность' }, { value: 'reactionMs', label: 'Время ответа' }]" />
          <div class="panel">
            <LineChart :series="perfSeries" :height="280" :y-min="metric === 'accuracy' ? 0 : undefined" :y-max="metric === 'accuracy' ? 1 : undefined"
              :y-format="metric === 'accuracy' ? (v) => Math.round(v * 100) + '%' : (v) => (v / 1000).toFixed(1) + ' с'" :x-format="(x, long) => fmtDate(x, long ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' })"
              :aria-label="metric === 'accuracy' ? 'Точность в упражнениях по направлениям' : 'Среднее время ответа по направлениям'" />
          </div>
          <table class="tbl">
            <caption class="sr-only">Сводка по направлениям</caption>
            <thead><tr><th>Направление</th><th>Попыток</th><th>Точность</th><th>Прошлый период</th></tr></thead>
            <tbody><tr v-for="d in domains" :key="d.key"><td><Icon :name="DOMAIN_ICON[d.key]" :size="16" :style="{ color: `var(--d-${d.key})` }" /> {{ d.label }}</td><td class="num">{{ d.attempts }}</td><td class="num">{{ pct(d.meanAccuracy) }}</td><td class="num">{{ pct(d.previousMeanAccuracy) }}</td></tr></tbody>
          </table>
          <p class="hint">Рост точности показывает, что задания приложения даются легче. Само по себе это не доказывает восстановление функций — об этом судит специалист.</p>
        </template>
        <StateBlock v-else title="Нет результатов за этот период" text="Выполните несколько занятий — здесь появятся графики." icon="chart"><template #actions><Btn to="/app/session" icon="play">Начать занятие</Btn></template></StateBlock>
      </section>

      <!-- 3. Clinical -->
      <section class="stack" aria-labelledby="clin-h">
        <h2 id="clin-h" class="h2"><span class="num badge-n">3</span> Клинические показатели</h2>
        <div v-if="clinical.length" class="grid-auto" style="--min: 300px">
          <article v-for="c in clinical" :key="c.key" class="panel stack" style="--gap: var(--s-3)">
            <div class="row"><b>{{ c.label }}</b><span class="muted small">{{ c.min }}–{{ c.max }}{{ c.higherIsBetter ? ', выше — лучше' : ', ниже — лучше' }}</span></div>
            <LineChart v-if="c.points.length > 1" :series="[{ id: c.key, label: c.label, color: 'var(--teal)', points: c.points.map((p) => ({ x: p.date, y: p.score })) }]" :y-min="c.min" :y-max="c.max" :height="160" :legend="false" :x-format="(x) => fmtDate(x, { day: 'numeric', month: 'short' })" :aria-label="`${c.label}: динамика`" />
            <ul class="pts"><li v-for="p in c.points" :key="p.id"><span class="num">{{ p.score }}</span><span class="muted">{{ fmtDate(p.date, { day: 'numeric', month: 'long', year: 'numeric' }) }} · {{ p.source === 'clinician' ? 'специалист' : 'со слов пациента' }}</span></li></ul>
          </article>
        </div>
        <StateBlock v-else title="Клинических оценок пока нет" text="Их вносит специалист после осмотра (например, индекс Бартел или шкала Фугл-Мейера). Пригласите специалиста в разделе «Профиль»." icon="shield"><template #actions><Btn variant="secondary" to="/app/profile#care">Пригласить специалиста</Btn></template></StateBlock>
      </section>

      <!-- History -->
      <section class="stack" aria-labelledby="hist-h">
        <h2 id="hist-h" class="h2">История занятий</h2>
        <ul v-if="history.length" class="hist">
          <li v-for="h in history" :key="h.id">
            <details>
              <summary><span class="num">{{ fmtDate(h.started_at, { day: 'numeric', month: 'long', weekday: 'short' }) }}</span><span class="chip" :class="h.status === 'completed' ? 'chip-teal' : ''">{{ h.status === 'completed' ? 'завершено' : 'остановлено' }}</span><span class="muted">{{ h.results.length }} упр.</span><span v-if="h.fatigue_after != null" class="muted">усталость {{ h.fatigue_after }}/10</span></summary>
              <table class="tbl"><thead><tr><th>Упражнение</th><th>Уровень</th><th>Точность</th><th>Время ответа</th><th>Длительность</th></tr></thead>
                <tbody><tr v-for="r in h.results" :key="r.created_at + r.exercise_id"><td>{{ r.title }}{{ r.completed ? '' : ' (не завершено)' }}</td><td class="num">{{ r.level }}</td><td class="num">{{ pct(r.accuracy) }}</td><td class="num">{{ r.mean_rt_ms ? (r.mean_rt_ms / 1000).toFixed(1) + ' с' : '—' }}</td><td class="num">{{ Math.round(r.duration_ms / 60000) || '<1' }} мин</td></tr></tbody></table>
            </details>
          </li>
        </ul>
        <p v-else class="muted">Пока нет завершённых занятий.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Segmented from '@/components/ui/Controls.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import LineChart from '@/components/charts/LineChart.vue'
import BarChart from '@/components/charts/BarChart.vue'
import { api } from '@/lib/api'
import { fmtDate, pct, DOMAIN_ICON } from '@/lib/ui'

const period = ref('30'), metric = ref('accuracy'), data = ref(null), history = ref([]), loading = ref(true), error = ref('')
const domains = computed(() => Object.entries(data.value?.performance ?? {}).map(([key, v]) => ({ key, ...v })))
const perfSeries = computed(() => domains.value.map((d) => ({ id: d.key, label: d.label, color: `var(--d-${d.key})`, points: d.series.map((p) => ({ x: p.date, y: p[metric.value] })) })))
const clinical = computed(() => Object.entries(data.value?.clinical ?? {}).map(([key, v]) => ({ key, ...v })))
const dailyBars = computed(() => (data.value?.engagement.daily ?? []).map((d) => ({ label: fmtDate(d.date, { day: 'numeric', month: 'short' }), title: fmtDate(d.date, { day: 'numeric', month: 'long' }), value: d.minutes })))
const delta = (a, b, f = (x) => x) => (b == null || a == null ? null : `${a - b >= 0 ? '+' : '−'}${f(Math.abs(a - b))}`)
const kpis = computed(() => {
  const c = data.value.engagement.current, p = data.value.engagement.previous
  return [
    { label: 'Занятий', value: c.sessions, delta: delta(c.sessions, p.sessions) },
    { label: 'Дней с занятиями', value: c.activeDays, delta: delta(c.activeDays, p.activeDays) },
    { label: 'Минут', value: c.minutes, delta: delta(c.minutes, p.minutes) },
    { label: `Регулярность (цель ${data.value.engagement.weeklyGoal}/нед)`, value: pct(c.adherence), delta: delta(c.adherence, p.adherence, (x) => `${Math.round(x * 100)} п.п.`) },
  ]
})
async function load() {
  loading.value = true; error.value = ''
  try { const [s, h] = await Promise.all([api.get(`/analytics/summary?period=${period.value}`), api.get('/analytics/history?limit=30')]); data.value = s; history.value = h.sessions } catch (e) { error.value = e.message } finally { loading.value = false }
}
watch(period, load)
onMounted(load)
</script>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: var(--s-4); align-items: flex-end; justify-content: space-between; }
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.h2 { font-size: var(--t-xl); display: flex; gap: var(--s-3); align-items: center; }
.badge-n { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--ink); color: var(--paper); font-size: var(--t-sm); }
.note { display: flex; gap: var(--s-2); padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--paper-2); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--s-3); }
.kpi { display: grid; gap: 4px; padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); }
.kpi b { font-family: var(--font-display); font-weight: 400; font-size: var(--t-2xl); }
.small { font-size: var(--t-sm); }
.up { color: var(--teal); }
.down { color: var(--ink-3); }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
@media (max-width: 760px) { .tbl { display: block; overflow-x: auto; white-space: nowrap; } }
.stack > * { min-width: 0; }
.tbl th, .tbl td { text-align: left; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); }
.tbl th { color: var(--ink-3); font-weight: 500; }
.pts { list-style: none; display: grid; gap: 4px; }
.pts li { display: flex; gap: var(--s-3); }
.pts .num { font-weight: 700; min-width: 3ch; }
.hist { list-style: none; display: grid; gap: var(--s-2); }
.hist details { border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); padding: var(--s-3) var(--s-4); }
.hist summary { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; cursor: pointer; min-height: 40px; }
.hist .tbl { margin-top: var(--s-3); }
</style>
