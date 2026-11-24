<template>
  <div class="game">
    <p class="game__prompt">Нажмите на круг — спокойно и точно</p>
    <p class="game__sub" aria-live="polite">{{ hits }} из {{ params.targets }}</p>
    <div class="field-area" ref="area" @pointerdown="miss">
      <button v-if="pos && hits < params.targets" class="tgt" :style="{ left: pos.x + '%', top: pos.y + '%', width: params.size + 'px', height: params.size + 'px' }"
        :aria-label="`Цель ${hits + 1} из ${params.targets}. Нажмите Enter`" :disabled="paused" @pointerdown.stop @click="hit">
        <span class="tgt__core" />
      </button>
    </div>
    <p class="game__sub">Без мыши: клавиша Tab переводит фокус на цель, Enter — нажатие.</p>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const area = ref(null), pos = ref(null), hits = ref(0)
let misses = 0, shownAt = 0
const rts = []
const place = async () => {
  pos.value = { x: 10 + Math.random() * 80, y: 12 + Math.random() * 76 }
  shownAt = performance.now()
  await nextTick()
  area.value?.querySelector('.tgt')?.focus({ preventScroll: true })
}
function hit() {
  if (props.paused) return
  rts.push(performance.now() - shownAt)
  hits.value++
  emit('progress', { done: hits.value, total: props.params.targets })
  if (hits.value >= props.params.targets) return emit('finish', result(true))
  place()
}
function miss() { if (!props.paused) misses++ }
onMounted(place)
const result = (completed) => ({ completed, accuracy: hits.value + misses ? hits.value / (hits.value + misses) : 0, errors: misses, meanRtMs: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null, metrics: { targets: props.params.targets, size: props.params.size, hits: hits.value } })
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.tgt { position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 0; padding: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 22%, transparent); animation: appear var(--d-med) var(--ease-out); }
.tgt__core { width: 55%; height: 55%; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 30%, transparent); }
.tgt:focus-visible { outline: 4px solid var(--ink); outline-offset: 4px; }
@keyframes appear { from { transform: translate(-50%, -50%) scale(0.6); opacity: 0; } }
</style>
