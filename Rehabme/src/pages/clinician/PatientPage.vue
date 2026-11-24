<template>
  <div class="stack" style="--gap: var(--s-5)">
    <RouterLink to="/clinic" class="back no-print"><Icon name="left" />Все пациенты</RouterLink>
    <div v-if="loading" class="skeleton" style="height: 420px" />
    <StateBlock v-else-if="error" tone="error" title="Нет доступа или пациент не найден" :text="error" />
    <template v-else>
      <header class="row">
        <div class="stack" style="--gap: 4px"><p class="label">Карта пациента</p><h1 class="title">{{ d.patient.displayName || 'Пациент' }}</h1>
          <p class="muted">{{ profileLine }}</p></div>
        <div class="cluster no-print"><span v-if="pending.length" class="chip chip-warn"><Icon name="flag" :size="14" />{{ pending.length }} на проверку</span><Btn variant="secondary" icon="download" @click="print">Печать отчёта</Btn></div>
      </header>
      <div class="tabs no-print" role="tablist" aria-label="Разделы карты">
        <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id" class="tab" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
      </div>

      <!-- Overview -->
      <section v-show="tab === 'overview' || printing" class="stack" role="tabpanel">
        <div class="kpis">
          <div class="kpi"><span class="muted">Занятий за 30 дней</span><b class="num">{{ d.analytics.engagement.current.sessions }}</b></div>
          <div class="kpi"><span class="muted">Регулярность</span><b class="num">{{ pct(d.analytics.engagement.current.adherence) }}</b></div>
          <div class="kpi"><span class="muted">Средняя точность</span><b class="num">{{ pct(d.analytics.engagement.current.meanAccuracy) }}</b></div>
          <div class="kpi"><span class="muted">Остановлено занятий</span><b class="num">{{ d.analytics.engagement.current.stoppedSessions }}</b></div>
        </div>
        <div class="panel" v-if="perfSeries.length"><LineChart :series="perfSeries" :y-min="0" :y-max="1" :height="240" :y-format="(v) => Math.round(v * 100) + '%'" :x-format="(x) => fmtDate(x, { day: 'numeric', month: 'short' })" aria-label="Точность по направлениям за 30 дней" /></div>
        <h2 class="h2">Последние занятия</h2>
        <table class="tbl"><thead><tr><th>Дата</th><th>Статус</th><th>Упражнений</th><th>Усталость до/после</th><th>Дискомфорт</th></tr></thead>
          <tbody><tr v-for="s in d.sessions" :key="s.id" :class="{ alert: s.discomfort >= 7 }"><td>{{ fmtDate(s.started_at) }}</td><td>{{ s.status === 'completed' ? 'завершено' : `остановлено${s.stop_reason ? ' · ' + s.stop_reason : ''}` }}</td><td class="num">{{ s.results.length }}</td><td class="num">{{ s.fatigue_before ?? '—' }} / {{ s.fatigue_after ?? '—' }}</td><td class="num">{{ s.discomfort ?? '—' }}</td></tr></tbody></table>
        <div v-if="d.screening" class="panel-flat stack"><h2 class="h2">Последняя самооценка пациента ({{ fmtDate(d.screening.created_at) }})</h2><p class="muted small">Самооценка — не клиническая шкала. 0 — нет трудностей, 100 — максимальные.</p>
          <div class="cluster"><span v-for="(v, k) in d.screening.domain_scores.domainScores" :key="k" class="chip">{{ d.domains[k]?.label }}: {{ v ?? '—' }}</span></div>
          <div class="cluster"><span class="chip" :class="d.screening.domain_scores.flags.physicalExerciseCleared ? 'chip-teal' : 'chip-warn'">Разрешение на физ. нагрузку: {{ d.screening.domain_scores.flags.physicalExerciseCleared ? 'да (со слов)' : 'нет/не уверен' }}</span><span class="chip">Боль в плече: {{ d.screening.domain_scores.flags.shoulderPain }}</span><span class="chip">Судороги в анамнезе: {{ d.screening.domain_scores.flags.seizureHistory ? 'да/не уверен' : 'нет' }}</span></div></div>
      </section>

      <!-- Plan editor -->
      <section v-show="tab === 'plan'" class="stack" role="tabpanel">
        <StateBlock v-if="!d.plan" title="Плана ещё нет" text="План появится после первичной самооценки пациента." />
        <form v-else class="stack" @submit.prevent="savePlan">
          <div class="plan-row head"><span>Направление</span><span>Вкл.</span><span>Уровень</span><span>Мин.</span><span>Макс.</span></div>
          <div v-for="(c, k) in planForm.domains" :key="k" class="plan-row">
            <span><Icon :name="DOMAIN_ICON[k]" :size="16" /> {{ d.domains[k].label }}</span>
            <input type="checkbox" v-model="c.enabled" :aria-label="`${d.domains[k].label}: включено`" />
            <input class="input sm" type="number" min="1" max="5" v-model.number="c.level" :aria-label="`${d.domains[k].label}: уровень`" />
            <input class="input sm" type="number" min="1" max="5" v-model.number="c.minLevel" :aria-label="`${d.domains[k].label}: минимальный уровень`" />
            <input class="input sm" type="number" min="1" max="5" v-model.number="c.maxLevel" :aria-label="`${d.domains[k].label}: максимальный уровень`" />
          </div>
          <Toggle v-model="planForm.domains.motor.physicalAllowed" label="Разрешить физические упражнения для рук (видео)" hint="Только после осмотра. Учтите боль в плече и противопоказания." />
          <Toggle v-model="planForm.domains.attention.excludeFastPaced" label="Исключить упражнения на скорость реакции" hint="Например, при судорогах в анамнезе" />
          <div class="grid2"><label class="field"><span>Занятий в неделю</span><input class="input" type="number" min="1" max="14" v-model.number="planForm.sessionsPerWeek" /></label><label class="field"><span>Максимум минут за занятие</span><input class="input" type="number" min="5" max="90" v-model.number="planForm.maxSessionMinutes" /></label></div>
          <label class="field"><span>Причина изменения (увидит пациент)</span><input class="input" v-model.trim="planForm.reason" maxlength="500" placeholder="Например: после осмотра разрешены упражнения для рук" /></label>
          <p v-if="planError" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ planError }}</p>
          <div class="cluster"><Btn type="submit" icon="check" :loading="savingPlan" :disabled="planForm.reason.length < 3">Сохранить план (v{{ d.plan.version + 1 }})</Btn></div>
        </form>
      </section>

      <!-- Assessments -->
      <section v-show="tab === 'assess' || printing" class="stack" role="tabpanel">
        <h2 class="h2">Клинические оценки</h2>
        <form class="panel grid4 no-print" @submit.prevent="addAssessment">
          <label class="field"><span>Шкала</span><select class="select" v-model="asm.scale"><option v-for="(s, k) in d.scales" :key="k" :value="k">{{ s.label }}</option></select></label>
          <label class="field"><span>Балл ({{ d.scales[asm.scale].min }}–{{ d.scales[asm.scale].max }})</span><input class="input" type="number" step="0.5" v-model.number="asm.score" :min="d.scales[asm.scale].min" :max="d.scales[asm.scale].max" /></label>
          <label class="field"><span>Дата оценки</span><input class="input" type="date" v-model="asm.assessedAt" :max="today" /></label>
          <Btn type="submit" icon="plus" :disabled="asm.score === null || asm.score === ''">Добавить</Btn>
        </form>
        <table class="tbl"><thead><tr><th>Дата</th><th>Шкала</th><th>Балл</th><th>Источник</th></tr></thead>
          <tbody><tr v-for="a in d.assessments" :key="a.id"><td>{{ fmtDate(a.assessed_at) }}</td><td>{{ d.scales[a.scale].label }}</td><td class="num">{{ a.score }}</td><td>{{ a.source === 'clinician' ? 'специалист' : 'со слов пациента' }}</td></tr></tbody></table>
      </section>

      <!-- Recommendations review -->
      <section v-show="tab === 'recs'" class="stack" role="tabpanel">
        <h2 class="h2">Рекомендации системы</h2>
        <p class="muted">Автоматические изменения внутри разрешённых пределов уже применены — их можно отменить. Изменения за пределами ждут вашего решения.</p>
        <ul class="recs">
          <li v-for="r in d.recommendations" :key="r.id" :class="r.status">
            <div class="stack" style="--gap: 4px"><b>{{ recTitle(r) }}</b><span class="muted small">{{ STATUS[r.status] }} · {{ fmtDate(r.created_at) }} · правило: {{ r.rationale.rule }}{{ r.rationale.meanAccuracy != null ? ` · точность ${Math.round(r.rationale.meanAccuracy * 100)}%` : '' }}</span><span v-if="r.decision_note" class="small">Комментарий: {{ r.decision_note }}</span></div>
            <div v-if="['pending_clinician', 'applied', 'active'].includes(r.status) && r.type === 'difficulty_change'" class="cluster">
              <Btn v-if="r.status === 'pending_clinician'" size="sm" icon="check" @click="decide(r, 'approved')">Одобрить</Btn>
              <Btn size="sm" variant="secondary" icon="x" @click="decide(r, 'rejected')">{{ r.status === 'applied' ? 'Отменить изменение' : 'Отклонить' }}</Btn>
            </div>
          </li>
        </ul>
      </section>

      <!-- Prediction review -->
      <section v-show="tab === 'pred'" class="stack" role="tabpanel">
        <h2 class="h2">Прогноз</h2>
        <form class="panel stack" @submit.prevent="runPred"><p class="muted small">Сопутствующие заболевания (необязательно, уточняют оценку):</p>
          <div class="cluster"><label v-for="(l, k) in COMORB" :key="k" class="cluster" style="--gap: 6px"><input type="checkbox" v-model="comorb[k]" />{{ l }}</label></div>
          <div><Btn type="submit" icon="refresh" :loading="running">Рассчитать</Btn></div></form>
        <template v-if="latestPred">
          <PredictionView :prediction="latestPred" audience="clinician" />
          <div class="panel stack"><span class="label">Ваша оценка прогноза</span>
            <p v-if="latestPred.reviewStatus !== 'unreviewed'" class="small">Статус: {{ latestPred.reviewStatus === 'acknowledged' ? 'принято к сведению' : 'оспорено' }}{{ latestPred.reviewNote ? ` — ${latestPred.reviewNote}` : '' }}</p>
            <input class="input" v-model.trim="reviewNote" maxlength="1000" placeholder="Комментарий (необязательно)" aria-label="Комментарий к прогнозу" />
            <div class="cluster"><Btn size="sm" icon="check" @click="review('acknowledged')">Принять к сведению</Btn><Btn size="sm" variant="secondary" icon="flag" @click="review('disputed')">Оспорить</Btn></div></div>
        </template>
      </section>
      <p class="hint print-only">Отчёт сформирован {{ new Date().toLocaleString('ru-RU') }} в ReHabMe. Результаты упражнений не являются клинической оценкой восстановления.</p>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Toggle from '@/components/ui/Toggle.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import LineChart from '@/components/charts/LineChart.vue'
import PredictionView from '@/components/prediction/PredictionView.vue'
import { api } from '@/lib/api'
import { useToasts } from '@/stores/toasts'
import { fmtDate, pct, DOMAIN_ICON } from '@/lib/ui'

const props = defineProps({ id: String })
const toasts = useToasts()
const TABS = [{ id: 'overview', label: 'Обзор' }, { id: 'plan', label: 'План' }, { id: 'assess', label: 'Оценки' }, { id: 'recs', label: 'Рекомендации' }, { id: 'pred', label: 'Прогноз' }]
const STATUS = { active: 'активна', applied: 'применена автоматически', pending_clinician: 'ждёт вашего решения', approved: 'одобрена', rejected: 'отклонена', dismissed: 'скрыта пациентом', expired: 'неактуальна' }
const COMORB = { hypertension: 'Гипертензия', diabetes: 'Диабет', atrial_fibrillation: 'Фибрилляция предсердий', prior_stroke: 'Инсульт в анамнезе' }
const today = new Date().toISOString().slice(0, 10)
const d = ref(null), loading = ref(true), error = ref(''), tab = ref('overview'), printing = ref(false)
const planForm = reactive({ domains: {}, sessionsPerWeek: 5, maxSessionMinutes: 20, reason: '' }), savingPlan = ref(false), planError = ref('')
const asm = reactive({ scale: 'barthel', score: null, assessedAt: today })
const comorb = reactive({ hypertension: false, diabetes: false, atrial_fibrillation: false, prior_stroke: false }), running = ref(false), reviewNote = ref('')

const pending = computed(() => d.value?.recommendations.filter((r) => r.status === 'pending_clinician') ?? [])
const latestPred = computed(() => d.value?.predictions?.[0] ?? null)
const profileLine = computed(() => {
  const p = d.value.profile
  if (!p) return 'Профиль не заполнен'
  return [p.birthYear && `${new Date().getFullYear() - p.birthYear} лет`, p.strokeType && { ischemic: 'ишемический инсульт', hemorrhagic: 'геморрагический инсульт', unknown: 'тип инсульта не указан' }[p.strokeType], p.strokeDate && `с ${fmtDate(p.strokeDate, { day: 'numeric', month: 'long', year: 'numeric' })}`, p.affectedSide && `поражённая сторона: ${{ left: 'левая', right: 'правая', both: 'обе', none: 'нет', unknown: 'не указана' }[p.affectedSide]}`].filter(Boolean).join(' · ')
})
const perfSeries = computed(() => Object.entries(d.value?.analytics.performance ?? {}).map(([k, v]) => ({ id: k, label: v.label, color: `var(--d-${k})`, points: v.series.map((p) => ({ x: p.date, y: p.accuracy })) })))
const recTitle = (r) => (r.type === 'difficulty_change' ? `${d.value.domains[r.domain]?.label}: уровень ${r.payload.from} → ${r.payload.to}` : { rest: 'Рекомендован отдых', clinician_contact: 'Пациенту рекомендовано связаться с врачом', reassessment: 'Повторная самооценка', consistency: 'Пропуск занятий' }[r.type])

async function load() {
  loading.value = true; error.value = ''
  try {
    d.value = await api.get(`/clinician/patients/${props.id}`)
    if (d.value.plan) {
      planForm.domains = Object.fromEntries(Object.entries(d.value.plan.domains).map(([k, c]) => [k, { enabled: c.enabled, level: c.level, minLevel: c.minLevel, maxLevel: c.maxLevel, physicalAllowed: !!c.physicalAllowed, excludeFastPaced: !!c.excludeFastPaced }]))
      planForm.sessionsPerWeek = d.value.plan.sessionsPerWeek; planForm.maxSessionMinutes = d.value.plan.maxSessionMinutes
    }
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
async function savePlan() {
  planError.value = ''
  const bad = Object.entries(planForm.domains).find(([, c]) => !(c.minLevel <= c.level && c.level <= c.maxLevel))
  if (bad) { planError.value = `${d.value.domains[bad[0]].label}: уровень должен быть между минимальным и максимальным`; return }
  savingPlan.value = true
  try { await api.put(`/clinician/patients/${props.id}/plan`, { ...planForm }); planForm.reason = ''; toasts.success('План сохранён, пациент уведомлён'); await load() } catch (e) { planError.value = e.message } finally { savingPlan.value = false }
}
async function addAssessment() {
  try { await api.post(`/clinician/patients/${props.id}/assessments`, { ...asm, score: Number(asm.score) }); asm.score = null; toasts.success('Оценка добавлена'); await load() } catch (e) { toasts.error(e.message) }
}
async function decide(r, decision) {
  try { await api.post(`/clinician/recommendations/${r.id}/decision`, { decision }); toasts.success('Решение сохранено'); await load() } catch (e) { toasts.error(e.message) }
}
async function runPred() {
  running.value = true
  try { const body = Object.fromEntries(Object.entries(comorb).map(([k, v]) => [k, v ? 1 : 0])); await api.post(`/clinician/patients/${props.id}/predictions`, body); await load() } catch (e) { toasts.error(e.message) } finally { running.value = false }
}
async function review(status) {
  try { await api.post(`/clinician/predictions/${latestPred.value.id}/review`, { status, note: reviewNote.value || undefined }); toasts.success('Отметка сохранена'); await load() } catch (e) { toasts.error(e.message) }
}
async function print() { printing.value = true; await nextTick(); window.print(); printing.value = false }
onMounted(load)
</script>

<style scoped>
.back { display: inline-flex; gap: 4px; align-items: center; font-weight: 500; text-decoration: none; width: fit-content; }
.row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--s-4); }
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.h2 { font-size: var(--t-xl); }
.small { font-size: var(--t-sm); }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); }
.tab { min-height: var(--target); padding: 0 var(--s-4); border: 0; background: transparent; font-weight: 600; color: var(--ink-3); border-bottom: 3px solid transparent; }
.tab.on { color: var(--ink); border-bottom-color: var(--accent); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--s-3); }
.kpi { display: grid; gap: 4px; padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); }
.kpi b { font-family: var(--font-display); font-weight: 400; font-size: var(--t-2xl); }
.tbl { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
.tbl th, .tbl td { text-align: left; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); }
.tbl th { color: var(--ink-3); font-weight: 500; }
.tbl tr.alert td { background: var(--danger-soft); }
.plan-row { display: grid; grid-template-columns: 1.4fr 60px repeat(3, 90px); gap: var(--s-3); align-items: center; padding: var(--s-2) 0; border-bottom: 1px solid var(--line); }
.plan-row.head { color: var(--ink-3); font-size: var(--t-sm); }
.plan-row input[type='checkbox'] { width: 24px; height: 24px; accent-color: var(--ink); }
.input.sm { min-height: 44px; padding: 0.4em 0.6em; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.grid4 { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: var(--s-3); align-items: end; }
.recs { list-style: none; display: grid; gap: var(--s-2); }
.recs li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-3); padding: var(--s-4); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); }
.recs li.pending_clinician { box-shadow: inset 4px 0 0 var(--warn), var(--shadow-1); }
.print-only { display: none; }
@media print { .print-only { display: block; } }
@media (max-width: 760px) { .plan-row { grid-template-columns: 1fr repeat(4, 56px); } .grid2, .grid4 { grid-template-columns: 1fr; } }
</style>
