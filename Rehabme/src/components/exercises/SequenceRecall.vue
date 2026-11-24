<template>
  <div class="game">
    <p class="game__prompt" aria-live="polite">{{ phase === 'show' ? 'Запоминайте порядок…' : phase === 'input' ? 'Ваш ход: нажмите плитки в том же порядке' : phase === 'feedback' ? feedback : 'Приготовьтесь' }}</p>
    <div class="game__meter" aria-label="Раунды"><i v-for="r in params.rounds" :key="r" :class="{ done: r <= round }" /></div>
    <div class="game__grid seq" style="grid-template-columns: repeat(3, 1fr)">
      <button v-for="n in 9" :key="n" class="tile" :class="{ 'is-lit': lit === n - 1, 'is-sel': phase === 'input' && pressed.includes(n - 1) && lit !== n - 1 }"
        :disabled="phase !== 'input' || paused" :aria-label="`Плитка ${n}`" @click="press(n - 1)">
        <span class="num seq__n">{{ n }}</span>
      </button>
    </div>
    <p class="game__sub">Можно нажимать цифры 1–9 на клавиатуре. Шаг {{ pressed.length }} из {{ seq.length }}.</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const round = ref(0), seq = ref([]), pressed = ref([]), lit = ref(null), phase = ref('ready'), feedback = ref('')
let span = props.params.span, correct = 0, errors = 0, timers = [], inputStart = 0
const rts = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))

function play() {
  phase.value = 'show'
  seq.value = Array.from({ length: span }, () => Math.floor(Math.random() * 9))
  pressed.value = []
  seq.value.forEach((t, i) => {
    later(() => { lit.value = t }, i * props.params.stepMs + 300)
    later(() => { lit.value = null }, i * props.params.stepMs + props.params.stepMs * 0.7)
  })
  later(() => { phase.value = 'input'; inputStart = performance.now() }, seq.value.length * props.params.stepMs + 400)
}
function press(t) {
  pressed.value.push(t)
  const i = pressed.value.length - 1
  if (pressed.value[i] !== seq.value[i]) return endRound(false)
  if (pressed.value.length === seq.value.length) endRound(true)
}
function endRound(ok) {
  rts.push(performance.now() - inputStart)
  phase.value = 'feedback'
  if (ok) { correct++; feedback.value = 'Верно!'; span = Math.min(props.params.span + 2, span + 1) } else { errors++; feedback.value = 'Не совсем. Ничего страшного — продолжим.' }
  round.value++
  emit('progress', { done: round.value, total: props.params.rounds })
  if (round.value >= props.params.rounds) return later(() => emit('finish', result(true)), 900)
  later(play, 1400)
}
function onKey(e) { if (phase.value === 'input' && !props.paused && /^[1-9]$/.test(e.key)) press(Number(e.key) - 1) }
watch(() => props.paused, (p) => {
  if (p) { timers.forEach(clearTimeout); timers = []; lit.value = null; if (phase.value === 'show') phase.value = 'ready' }
  else if (phase.value === 'ready') later(play, 500)
})
onMounted(() => { window.addEventListener('keydown', onKey); later(play, 900) })
onBeforeUnmount(() => { timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey) })
const result = (completed) => ({
  completed, accuracy: round.value ? correct / round.value : 0, errors,
  meanRtMs: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
  metrics: { rounds: round.value, maxSpan: span },
})
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.seq { width: min(100%, 420px); }
.seq__n { font-size: var(--t-md); opacity: 0.55; }
</style>
