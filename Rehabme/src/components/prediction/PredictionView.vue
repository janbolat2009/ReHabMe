<template>
  <div class="pv stack" style="--gap: var(--s-5)">
    <!-- Mode banner: never let a demo/research output look like a clinical result -->
    <div v-if="prediction.mode === 'demo'" class="banner banner--demo" role="note"><Icon name="alert" /><div><b>Демонстрационный режим.</b> Модель обучена на синтетических (искусственных) данных для проверки работы системы. Это <b>не прогноз</b> для вас и не медицинская информация.</div></div>
    <div v-else-if="prediction.mode === 'research'" class="banner banner--research" role="note"><Icon name="info" /><div><b>Исследовательский режим.</b> Модель не прошла клиническую валидацию. Используйте только как повод для разговора со специалистом.</div></div>

    <StateBlock v-if="prediction.status === 'unavailable'" tone="unavailable" title="Прогноз сейчас недоступен" :text="prediction.output?.message ?? 'Модель прогнозирования недоступна.'">
      <p class="small muted">Это не ошибка в ваших данных. Остальные функции работают как обычно.</p>
    </StateBlock>

    <template v-for="r in results" :key="r.model.name">
      <article class="panel stack res" style="--gap: var(--s-4)">
        <div class="row"><span class="label">Цель</span><span class="chip num">{{ r.model.name }} · v{{ r.model.version }}</span></div>
        <h2 class="res__goal">{{ GOALS[r.task] }}</h2>
        <p class="muted small">{{ r.target_label }}</p>

        <StateBlock v-if="r.status === 'abstained'" tone="unavailable" title="Модель воздержалась от оценки" :text="abstainText(r.reason)">
          <ul v-if="missing(r.reason).length" class="small"><li v-for="m in missing(r.reason)" :key="m">{{ m }}</li></ul>
        </StateBlock>

        <template v-else-if="r.task === 'survival'">
          <div class="range">
            <div><span class="label">Ориентировочный срок</span><p class="range__big num">{{ rangeText(r.prediction.range_days) }}</p><span class="muted small">в половине похожих случаев цель достигалась в этом интервале</span></div>
            <div class="probs">
              <div v-for="d in ['90', '180', '365']" :key="d" class="prob"><span class="muted small">к {{ MONTHS[d] }}</span><div class="prob__bar" role="img" :aria-label="`Вероятность к ${MONTHS[d]}: ${Math.round(r.prediction.probability_by_day[d] * 100)}%`"><i :style="{ width: r.prediction.probability_by_day[d] * 100 + '%' }" /></div><b class="num">{{ Math.round(r.prediction.probability_by_day[d] * 100) }}%</b></div>
            </div>
          </div>
          <LineChart :series="curveSeries(r)" :band="curveBand(r)" :y-min="0" :y-max="1" :height="260" :y-format="(v) => Math.round(v * 100) + '%'" :x-format="(x, long) => long ? `${x} дн. (~${Math.round(x / 30)} мес.)` : `${Math.round(x / 30)} мес`" x-label="День"
            aria-label="Накопленная вероятность достижения цели по времени: ваша оценка и типичная динамика в обучающих данных" />
        </template>

        <template v-else>
          <div class="range">
            <div><span class="label">Ожидаемый диапазон через 90 дней</span><p class="range__big num">{{ r.prediction.interval.low }}–{{ r.prediction.interval.high }} <span class="small muted">из 66</span></p><span class="muted small">интервал рассчитан так, чтобы в ~{{ Math.round(r.prediction.interval.nominal_coverage * 100) }}% похожих случаев результат попадал внутрь</span></div>
          </div>
          <div class="scale66" role="img" :aria-label="`Шкала 0–66: исходно ${r.prediction.baseline}, ожидаемый диапазон ${r.prediction.interval.low}–${r.prediction.interval.high}`">
            <div class="scale66__track"><i class="scale66__band" :style="{ left: pctOf(r.prediction.interval.low), width: pctOf(r.prediction.interval.high - r.prediction.interval.low) }" /><i class="scale66__base" :style="{ left: pctOf(r.prediction.baseline ?? 0) }" /></div>
            <div class="row small muted"><span>0</span><span>◆ исходно: {{ r.prediction.baseline ?? '—' }}</span><span>66</span></div>
          </div>
        </template>

        <details v-if="r.status === 'ok'" class="why" open>
          <summary>Что повлияло на оценку</summary>
          <ul class="factors">
            <li v-for="f in r.explanation.factors" :key="f.feature">
              <span>{{ f.label }}<span v-if="f.value != null" class="muted"> · {{ fmtVal(f) }}</span></span>
              <span class="factor__bar" :class="f.direction" aria-hidden="true"><i :style="{ width: Math.min(100, Math.abs(f.contribution) / maxContrib(r) * 100) + '%' }" /></span>
              <span class="small">{{ dirText(r, f) }}</span>
            </li>
          </ul>
          <p class="small muted">Это статистические связи в данных, на которых обучалась модель, а не причины. Они не означают, что изменение одного фактора изменит результат.</p>
        </details>

        <details v-if="r.status === 'ok'" class="why">
          <summary>Насколько можно доверять оценке</summary>
          <dl class="unc small">
            <template v-if="r.task === 'survival'"><dt>Индекс согласованности (C-index) на тестовых данных</dt><dd class="num">{{ fx(r.uncertainty.c_index_test) }}</dd><dt>Интегральная ошибка Брайера</dt><dd class="num">{{ fx(r.uncertainty.ibs_test) }}</dd><dt>Ошибка калибровки на 180-й день</dt><dd class="num">{{ fx(r.uncertainty.calibration_error_180d) }}</dd></template>
            <template v-else><dt>Средняя ошибка (MAE) на тестовых данных</dt><dd class="num">{{ fx(r.uncertainty.mae_test, 1) }} балла</dd><dt>Фактическое покрытие интервала</dt><dd class="num">{{ Math.round((r.uncertainty.empirical_coverage_test ?? 0) * 100) }}%</dd></template>
            <dt>Насколько ваш профиль типичен для обучающих данных</dt><dd class="num">расстояние {{ r.uncertainty.ood_distance }}</dd>
          </dl>
          <p v-if="prediction.mode === 'demo'" class="small muted">Эти показатели получены на синтетических данных и ничего не говорят о точности на реальных пациентах.</p>
        </details>
      </article>
    </template>

    <p v-if="audience === 'patient' && prediction.status !== 'unavailable'" class="next"><Icon name="users" /> Обсудите оценку со своим специалистом и пройдите повторную оценку по клиническим шкалам — это важнее любого прогноза.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import LineChart from '@/components/charts/LineChart.vue'

const props = defineProps({ prediction: Object, audience: { type: String, default: 'patient' } })
const GOALS = { survival: 'Самостоятельность в повседневных делах', regression: 'Функция руки (шкала Фугл-Мейера)' }
const MONTHS = { 90: '3 мес.', 180: '6 мес.', 365: '12 мес.' }
const FEATURE_NAMES = { barthel_baseline: 'Индекс Бартел (вносит специалист)', fma_ue_baseline: 'Шкала Фугл-Мейера для руки (вносит специалист)', age: 'Год рождения (профиль)', days_onset_to_baseline: 'Дата инсульта (профиль)', moca_baseline: 'Шкала MoCA', nihss_baseline: 'Шкала NIHSS' }
const results = computed(() => props.prediction.output?.results ?? [])
const fx = (v, d = 3) => (v == null ? '—' : Number(v).toFixed(d))
const pctOf = (v) => `${(v / 66) * 100}%`
const months = (d) => Math.max(1, Math.round(d / 30))
function rangeText(r) {
  if (!r.from && !r.to) return 'позже 12 месяцев'
  if (r.from && !r.to) return `от ${months(r.from)} мес. и позже`
  return `${months(r.from)}–${months(r.to)} мес.`
}
function abstainText(reason) {
  return {
    milestone_already_met: 'Цель уже достигнута по последней оценке специалиста — прогноз не нужен.',
    out_of_distribution: 'Ваши данные неполные или заметно отличаются от данных, на которых обучалась модель. В таких случаях оценка была бы ненадёжной, поэтому модель её не делает.',
  }[reason?.code] ?? 'Недостаточно данных для надёжной оценки.'
}
const missing = (reason) => (reason?.details ?? []).filter((d) => ['missing_required', 'too_many_missing'].includes(d.code)).flatMap((d) => d.features).filter((f) => FEATURE_NAMES[f]).map((f) => `Не хватает: ${FEATURE_NAMES[f]}`)
const maxContrib = (r) => Math.max(...r.explanation.factors.map((f) => Math.abs(f.contribution)), 1e-6)
const fmtVal = (f) => (['sex_female', 'stroke_hemorrhagic', 'hypertension', 'diabetes', 'atrial_fibrillation', 'prior_stroke'].includes(f.feature) ? (f.value ? 'да' : 'нет') : Math.round(f.value))
const dirText = (r, f) => (r.task === 'survival' ? (f.direction === 'up' ? 'связано с более высокой вероятностью' : 'связано с более низкой вероятностью') : f.direction === 'up' ? 'связано с более высокой оценкой' : 'связано с более низкой оценкой')
const curveSeries = (r) => [
  { id: 'you', label: 'Оценка для вас', color: 'var(--accent)', points: r.prediction.curve.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.day, y: p.p })), dots: false },
  ...(r.prediction.reference_curve ? [{ id: 'ref', label: 'Типичная динамика в данных', color: 'var(--ink-3)', dashed: true, dots: false, points: r.prediction.reference_curve.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.day, y: p.p })) }] : []),
]
const curveBand = (r) => {
  const { from, to } = r.prediction.range_days
  if (!from) return null
  const pts = r.prediction.curve.filter((p, i) => i % 2 === 0 && p.day >= from && p.day <= (to ?? 365)).map((p) => ({ x: p.day, lo: 0, hi: 1 }))
  return pts.length ? { label: 'Интервал 25–75%', color: 'var(--accent)', points: pts } : null
}
</script>

<style scoped>
.banner { display: flex; gap: var(--s-3); padding: var(--s-4); border-radius: 18px; align-items: flex-start; }
.banner--demo { background: var(--warn-soft); border: 2px dashed var(--warn); }
.banner--research { background: var(--paper-2); border: 1.5px solid var(--line-strong); }
.row { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.small { font-size: var(--t-sm); }
.res__goal { font-size: var(--t-2xl); }
.range { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-5); align-items: center; }
.range__big { font-family: var(--font-display); font-size: var(--t-3xl); letter-spacing: -0.03em; margin: var(--s-1) 0; }
.probs { display: grid; gap: var(--s-3); }
.prob { display: grid; grid-template-columns: 80px 1fr 48px; gap: var(--s-3); align-items: center; }
.prob__bar { height: 12px; border-radius: 6px; background: var(--paper-2); overflow: hidden; }
.prob__bar i { display: block; height: 100%; background: var(--accent); border-radius: 6px; transition: width var(--d-slow) var(--ease-out); }
.scale66__track { position: relative; height: 22px; border-radius: 11px; background: var(--paper-2); }
.scale66__band { position: absolute; top: 0; bottom: 0; border-radius: 11px; background: color-mix(in srgb, var(--accent) 45%, transparent); }
.scale66__base { position: absolute; top: -5px; width: 4px; height: 32px; border-radius: 2px; background: var(--ink); transform: translateX(-2px); }
.why summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; }
.factors { list-style: none; display: grid; gap: var(--s-3); margin: var(--s-2) 0; }
.factors li { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: var(--s-3); align-items: center; }
.factor__bar { height: 10px; border-radius: 5px; background: var(--paper-2); overflow: hidden; }
.factor__bar i { display: block; height: 100%; border-radius: 5px; }
.factor__bar.up i { background: var(--teal); }
.factor__bar.down i { background: var(--ink-3); }
.unc { display: grid; grid-template-columns: 1fr auto; gap: var(--s-2) var(--s-4); margin: var(--s-2) 0; }
.unc dd { margin: 0; font-weight: 700; }
.next { display: flex; gap: var(--s-3); padding: var(--s-4); border-radius: 18px; background: var(--teal-soft); }
@media (max-width: 760px) { .range { grid-template-columns: 1fr; } .factors li { grid-template-columns: 1fr; gap: 4px; } }
</style>
