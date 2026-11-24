<template>
  <div class="game">
    <p class="game__prompt">Нажимайте, только когда круг <b>зелёный с галочкой</b></p>
    <div class="game__meter" aria-hidden="true"><i v-for="t in params.trials" :key="t" :class="{ done: t <= trial }" /></div>
    <div class="stage" aria-live="assertive">
      <div v-if="stim" class="stim" :class="stim.go ? 'go' : 'nogo'" :aria-label="stim.go ? 'Зелёный круг с галочкой — нажимайте' : 'Серый круг с крестиком — не нажимайте'" role="img">
        <Icon :name="stim.go ? 'check' : 'x'" :size="64" stroke="3" />
      </div>
      <p v-else class="game__sub">{{ trial >= params.trials ? 'Готово' : '…' }}</p>
    </div>
    <p class="game__feedback" :class="fb?.ok ? 'ok' : 'bad'" role="status">{{ fb?.text ?? '' }}</p>
    <Btn size="lg" class="gobtn" @click="respond" :disabled="paused">Нажать (или пробел)</Btn>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const trial = ref(0), stim = ref(null), fb = ref(null)
let hits = 0, misses = 0, fas = 0, crs = 0, shownAt = 0, responded = false, timer = null
const rts = []

function next() {
  if (props.paused) return
  if (trial.value >= props.params.trials) return emit('finish', result(true))
  stim.value = { go: Math.random() < props.params.goRatio }
  shownAt = performance.now(); responded = false; fb.value = null
  timer = setTimeout(endTrial, props.params.stimulusMs)
}
function endTrial() {
  if (!responded) { if (stim.value.go) { misses++; fb.value = { ok: false, text: 'Пропущено' } } else { crs++; fb.value = { ok: true, text: 'Верно — не нажимать' } } }
  stim.value = null
  trial.value++
  emit('progress', { done: trial.value, total: props.params.trials })
  timer = setTimeout(next, 1000) // calm inter-trial interval, ≤ 1 stimulus per second
}
function respond() {
  if (!stim.value || responded || props.paused) return
  responded = true
  if (stim.value.go) { hits++; rts.push(performance.now() - shownAt); fb.value = { ok: true, text: 'Верно!' } } else { fas++; fb.value = { ok: false, text: 'Этот круг не нужно было нажимать' } }
}
const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); respond() } }
watch(() => props.paused, (p) => { clearTimeout(timer); if (p) { stim.value = null } else timer = setTimeout(next, 800) })
onMounted(() => { window.addEventListener('keydown', onKey); timer = setTimeout(next, 1200) })
onBeforeUnmount(() => { clearTimeout(timer); window.removeEventListener('keydown', onKey) })
const result = (completed) => {
  const n = hits + misses + fas + crs
  return { completed, accuracy: n ? (hits + crs) / n : 0, errors: misses + fas, meanRtMs: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null, metrics: { hits, misses, falseAlarms: fas, correctRejections: crs } }
}
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.stage { display: grid; place-items: center; width: 220px; height: 220px; }
.stim { display: grid; place-items: center; width: 180px; height: 180px; border-radius: 50%; color: #fff; }
.stim.go { background: var(--teal); }
.stim.nogo { background: #6b7370; }
.gobtn { min-width: min(100%, 360px); min-height: 84px; }
</style>
