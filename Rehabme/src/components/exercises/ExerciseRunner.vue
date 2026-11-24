<template>
  <section class="runner" :aria-labelledby="hid">
    <header class="runner__head">
      <div class="stack" style="--gap: 4px">
        <span class="label"><Icon :name="DOMAIN_ICON[exercise.domain]" :size="14" /> {{ domainLabel }} · уровень {{ level }}</span>
        <h2 :id="hid" class="runner__title">{{ exercise.title }}</h2>
      </div>
      <div v-if="phase === 'play'" class="runner__tools hand-aware">
        <span v-if="timed" class="chip num" aria-live="off"><Icon name="clock" :size="16" />{{ mmss(elapsed) }}</span>
        <span v-if="progress" class="chip num">{{ progress.done }} / {{ progress.total }}</span>
        <Btn variant="secondary" size="sm" :icon="paused ? 'play' : 'pause'" @click="togglePause">{{ paused ? 'Продолжить' : 'Пауза' }}</Btn>
        <Btn variant="ghost" size="sm" icon="stop" @click="askStop">Завершить</Btn>
      </div>
    </header>

    <!-- Intro: instructions, read-aloud, demonstration -->
    <div v-if="phase === 'intro'" class="intro">
      <div class="stack">
        <p class="lede">{{ exercise.summary }}</p>
        <ol class="steps">
          <li v-for="(s, i) in exercise.instructions" :key="i" :class="{ demo: demoStep === i }"><span class="num">{{ i + 1 }}</span>{{ s }}</li>
        </ol>
        <p v-if="!exercise.timeLimitAdjustable" class="hint"><Icon name="clock" :size="16" /> В этом упражнении время — часть задания; темп на низких уровнях медленный.</p>
        <p v-else-if="!timed" class="hint"><Icon name="clock" :size="16" /> Ограничение по времени отключено — занимайтесь в своём темпе.</p>
        <p v-if="exercise.physical" class="safety"><Icon name="alert" :size="18" /> Остановитесь при боли, головокружении или онемении. При внезапной слабости или нарушении речи звоните 103.</p>
        <div class="cluster hand-aware">
          <Btn size="lg" icon="play" @click="start">Начать</Btn>
          <Btn v-if="speech.supported" variant="secondary" icon="sound" @click="readAloud">Прочитать вслух</Btn>
          <Btn v-if="skippable" variant="ghost" @click="$emit('skip')">Пропустить</Btn>
        </div>
      </div>
      <div class="demo-card" aria-hidden="true">
        <span class="label">Как это выглядит</span>
        <div class="demo-stage"><Icon :name="DOMAIN_ICON[exercise.domain]" :size="56" stroke="1.4" /><span class="demo-pointer"><Icon name="hand" :size="30" /></span></div>
        <p class="muted">Шаг {{ demoStep + 1 }}: {{ exercise.instructions[demoStep] }}</p>
      </div>
    </div>

    <!-- Play -->
    <div v-else-if="phase === 'play'" class="play">
      <component :is="component" ref="game" :params="params" :level="level" :timed="timed" :paused="paused" :exercise="exercise" @finish="onFinish" @progress="progress = $event" />
      <div v-if="paused" class="pause-veil" role="dialog" aria-modal="false" aria-label="Пауза">
        <div class="panel stack" style="text-align: center; --gap: var(--s-4)">
          <h3>Пауза</h3>
          <p class="muted">Отдохните столько, сколько нужно. Инструкцию можно перечитать.</p>
          <ol class="steps"><li v-for="(s, i) in exercise.instructions" :key="i"><span class="num">{{ i + 1 }}</span>{{ s }}</li></ol>
          <div class="cluster" style="justify-content: center"><Btn icon="play" size="lg" @click="togglePause">Продолжить</Btn><Btn variant="secondary" icon="stop" @click="askStop">Завершить упражнение</Btn></div>
        </div>
      </div>
    </div>

    <!-- Result -->
    <div v-else-if="phase === 'result'" class="result">
      <div class="result__mark" :class="{ partial: !last.completed }" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path :d="last.completed ? 'M15 27 l7 7 l15 -16' : 'M17 26 h18'" /></svg></div>
      <h3 class="result__title">{{ last.completed ? 'Упражнение выполнено' : 'Упражнение остановлено' }}</h3>
      <p class="muted">{{ message }}</p>
      <dl class="stats">
        <div v-if="last.accuracy != null"><dt>Точность</dt><dd class="num">{{ Math.round(last.accuracy * 100) }}%</dd></div>
        <div v-if="last.meanRtMs != null"><dt>Среднее время ответа</dt><dd class="num">{{ (last.meanRtMs / 1000).toFixed(1) }} с</dd></div>
        <div><dt>Длительность</dt><dd class="num">{{ mmss(last.durationMs / 1000) }}</dd></div>
        <div v-if="last.errors != null"><dt>Ошибки</dt><dd class="num">{{ last.errors }}</dd></div>
      </dl>
      <div v-if="trend.length > 1" class="trend">
        <span class="label">Последние попытки — точность</span>
        <div class="trend__bars" role="img" :aria-label="`Точность в последних попытках: ${trend.map((t) => Math.round((t.accuracy ?? 0) * 100) + '%').join(', ')}`">
          <span v-for="(t, i) in trend" :key="i" :class="{ now: i === trend.length - 1 }" :style="{ height: `${Math.max(6, (t.accuracy ?? 0) * 100)}%` }" />
        </div>
      </div>
      <p class="hint">Результаты упражнения показывают выполнение задания, а не степень восстановления.</p>
      <p v-if="saveError" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ saveError }} <Btn size="sm" variant="secondary" @click="save">Повторить</Btn></p>
      <div class="cluster hand-aware"><Btn size="lg" trail="arrow" :loading="saving" :disabled="!!saveError" @click="$emit('done', last)">Дальше</Btn><Btn variant="secondary" icon="refresh" @click="restart">Ещё раз</Btn></div>
    </div>

    <Modal :open="confirmStop" title="Завершить упражнение?" @close="confirmStop = false">
      <p>Результат сохранится как незавершённый. Это нормально — можно вернуться позже.</p>
      <template #actions><Btn variant="secondary" @click="confirmStop = false">Продолжить упражнение</Btn><Btn @click="stopNow">Завершить</Btn></template>
    </Modal>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, useId, defineAsyncComponent } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Modal from '@/components/ui/Modal.vue'
import { useSession } from '@/stores/session'
import { speech, DOMAIN_ICON, prefersReducedMotion, announce } from '@/lib/ui'
import '@/styles/games.css'

const GAMES = {
  'memory-pairs': () => import('./MemoryPairs.vue'), 'memory-sequence': () => import('./SequenceRecall.vue'), 'memory-words': () => import('./WordRecall.vue'),
  'attention-search': () => import('./VisualSearch.vue'), 'attention-gonogo': () => import('./GoNoGo.vue'), 'cognition-sequence': () => import('./NumberSequence.vue'),
  'cognition-sort': () => import('./CategorySort.vue'), 'motor-targets': () => import('./TargetTap.vue'), 'motor-tracking': () => import('./Tracking.vue'),
}
const props = defineProps({ exercise: Object, level: Number, domainLabel: String, submit: Function, skippable: Boolean })
defineEmits(['done', 'skip'])
const s = useSession()
const hid = useId()
const component = computed(() => defineAsyncComponent(GAMES[props.exercise.id] ?? (() => import('./Guided.vue'))))
const params = computed(() => props.exercise.levels[props.level] ?? props.exercise.levels[1])
const timed = computed(() => !props.exercise.timeLimitAdjustable || !s.a11y.disableTimeLimits)

const phase = ref('intro'), paused = ref(false), progress = ref(null), elapsed = ref(0), game = ref(null), confirmStop = ref(false)
const last = ref(null), trend = ref([]), saving = ref(false), saveError = ref('')
const demoStep = ref(0)
let started = 0, pausedMs = 0, pauseAt = 0, tick, demoTimer

onMounted(() => {
  if (s.a11y.readAloud) readAloud()
  if (!prefersReducedMotion()) demoTimer = setInterval(() => { demoStep.value = (demoStep.value + 1) % props.exercise.instructions.length }, 2600)
})
onBeforeUnmount(() => { clearInterval(tick); clearInterval(demoTimer); speech.stop() })

const readAloud = () => speech.speak(`${props.exercise.title}. ${props.exercise.instructions.join(' ')}`)
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function start() {
  speech.stop()
  phase.value = 'play'; paused.value = false; progress.value = null; elapsed.value = 0; pausedMs = 0
  started = performance.now()
  clearInterval(tick)
  tick = setInterval(() => { if (!paused.value) elapsed.value = (performance.now() - started - pausedMs) / 1000 }, 500)
  announce(`Упражнение «${props.exercise.title}» началось`)
}
function togglePause() {
  if (paused.value) { pausedMs += performance.now() - pauseAt; paused.value = false; announce('Продолжаем') }
  else { pauseAt = performance.now(); paused.value = true; announce('Пауза') }
}
function askStop() { if (s.a11y.confirmActions) confirmStop.value = true; else stopNow() }
function stopNow() { confirmStop.value = false; onFinish(game.value?.partial?.() ?? { completed: false, accuracy: null, errors: null, meanRtMs: null, metrics: {} }) }

async function onFinish(r) {
  clearInterval(tick)
  if (paused.value) pausedMs += performance.now() - pauseAt
  const durationMs = Math.round(r.durationOverrideMs ?? performance.now() - started - pausedMs)
  last.value = {
    exerciseId: props.exercise.id, level: props.level, completed: !!r.completed, durationMs,
    accuracy: r.accuracy == null || Number.isNaN(r.accuracy) ? null : Math.max(0, Math.min(1, r.accuracy)),
    meanRtMs: r.meanRtMs == null ? null : Math.round(r.meanRtMs), errors: r.errors ?? null, timed: timed.value,
    metrics: Object.fromEntries(Object.entries(r.metrics ?? {}).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v))),
  }
  phase.value = 'result'
  announce(last.value.completed ? 'Упражнение выполнено' : 'Упражнение остановлено')
  await save()
}
async function save() {
  saving.value = true; saveError.value = ''
  try { trend.value = (await props.submit(last.value))?.previous ?? [] } catch (e) { saveError.value = `Результат не сохранился: ${e.message}` } finally { saving.value = false }
}
function restart() { phase.value = 'intro'; last.value = null; trend.value = [] }

const message = computed(() => {
  const a = last.value?.accuracy
  if (!last.value?.completed) return 'Остановиться вовремя — правильное решение. Результат сохранён.'
  if (a == null) return 'Спасибо! Отметка сохранена.'
  if (a >= 0.85) return 'Уверенный результат. Если так будет и дальше, программа предложит чуть более сложный уровень.'
  if (a >= 0.6) return 'Хорошая работа. Регулярные занятия важнее идеальных результатов.'
  return 'Это упражнение пока даётся непросто — это нормально. Программа подстроит сложность.'
})
</script>

<style scoped>
.runner { display: grid; gap: var(--s-6); }
.runner__head { display: flex; flex-wrap: wrap; gap: var(--s-4); align-items: flex-end; justify-content: space-between; padding-bottom: var(--s-4); border-bottom: 1px solid var(--line); }
.runner__title { font-size: var(--t-2xl); }
.runner__tools { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.intro { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: var(--s-6); align-items: start; }
.steps { list-style: none; display: grid; gap: var(--s-3); }
.steps li { display: flex; gap: var(--s-3); align-items: flex-start; padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); font-size: var(--t-lg); transition: box-shadow var(--d-med); }
.steps li.demo { box-shadow: inset 0 0 0 2px var(--accent); }
.steps .num { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--paper); font-size: var(--t-sm); font-weight: 700; }
.hint, .safety { display: flex; gap: 8px; align-items: center; }
.safety { padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--warn-soft); color: var(--ink); }
.demo-card { display: grid; gap: var(--s-3); padding: var(--s-5); border-radius: var(--r-panel); background: var(--paper-2); }
.demo-stage { position: relative; display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 18px; background: var(--surface); color: var(--ink-3); }
.demo-pointer { position: absolute; left: 60%; top: 55%; color: var(--accent-ink); animation: point 2.6s var(--ease-in-out) infinite; }
@keyframes point { 0%, 100% { transform: translate(0, 0); } 40% { transform: translate(-46px, -30px); } 55% { transform: translate(-46px, -30px) scale(0.86); } 70% { transform: translate(-46px, -30px); } }
@media (prefers-reduced-motion: reduce) { :root:not([data-motion='full']) .demo-pointer { animation: none; } }
:root[data-motion='reduced'] .demo-pointer { animation: none; }
.play { position: relative; min-height: 420px; }
.pause-veil { position: absolute; inset: -8px; z-index: 5; display: grid; place-items: center; background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(4px); border-radius: var(--r-panel); }
.result { display: grid; gap: var(--s-4); justify-items: center; text-align: center; max-width: 640px; margin-inline: auto; }
.result__title { font-size: var(--t-2xl); }
.result__mark svg { width: 88px; height: 88px; fill: none; stroke-width: 3; stroke-linecap: round; }
.result__mark circle { stroke: var(--teal); stroke-dasharray: 151; stroke-dashoffset: 151; animation: ring var(--d-slow) var(--ease-out) forwards; }
.result__mark path { stroke: var(--teal); stroke-dasharray: 40; stroke-dashoffset: 40; animation: ring var(--d-slow) var(--ease-out) 0.35s forwards; }
.result__mark.partial circle, .result__mark.partial path { stroke: var(--ink-3); }
@keyframes ring { to { stroke-dashoffset: 0; } }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--s-3); width: 100%; margin: 0; }
.stats div { padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); }
.stats dt { color: var(--ink-3); font-size: var(--t-sm); }
.stats dd { margin: 0; font-family: var(--font-display); font-size: var(--t-xl); }
.trend { width: 100%; display: grid; gap: var(--s-2); }
.trend__bars { display: flex; align-items: flex-end; gap: 8px; height: 80px; padding: 8px; border-radius: 14px; background: var(--paper-2); }
.trend__bars span { flex: 1; border-radius: 6px 6px 2px 2px; background: var(--line-strong); }
.trend__bars span.now { background: var(--teal); }
@media (max-width: 860px) { .intro { grid-template-columns: 1fr; } .demo-card { display: none; } }
</style>
