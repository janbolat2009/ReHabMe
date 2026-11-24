<template>
  <div class="game">
    <p class="game__prompt">Держите указатель внутри движущегося круга</p>
    <p class="game__sub" aria-live="off">Осталось {{ Math.max(0, Math.ceil(params.seconds - elapsed)) }} с · внутри круга {{ Math.round(share * 100) }}%</p>
    <div class="field-area" ref="area" tabindex="0" aria-label="Поле упражнения. Управление: стрелки на клавиатуре" @pointermove="onMove" @keydown="onKey">
      <div class="ring" :class="{ in: inside }" :style="{ left: t.x + 'px', top: t.y + 'px', width: params.radius * 2 + 'px', height: params.radius * 2 + 'px' }" />
      <div v-if="cursor" class="cur" :style="{ left: cursor.x + 'px', top: cursor.y + 'px' }" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const area = ref(null), t = ref({ x: 0, y: 0 }), cursor = ref(null), elapsed = ref(0)
let insideMs = 0, totalMs = 0, last = 0, raf = 0, phase = 0, done = false
const inside = computed(() => !!cursor.value && Math.hypot(cursor.value.x - t.value.x, cursor.value.y - t.value.y) <= props.params.radius)
const share = computed(() => (totalMs ? insideMs / totalMs : 0))

function frame(now) {
  const dt = last ? Math.min(64, now - last) : 16
  last = now
  if (!props.paused && area.value) {
    const r = area.value.getBoundingClientRect()
    phase += (dt / 1000) * props.params.speed
    const mx = r.width / 2, my = r.height / 2
    t.value = { x: mx + Math.sin(phase) * (mx - props.params.radius - 12), y: my + Math.sin(phase * 0.7 + 1) * (my - props.params.radius - 12) }
    if (cursor.value) { totalMs += dt; if (inside.value) insideMs += dt }
    elapsed.value += dt / 1000
    if (elapsed.value >= props.params.seconds && !done) { done = true; emit('finish', result(true)); return }
  }
  raf = requestAnimationFrame(frame)
}
function onMove(e) { const r = area.value.getBoundingClientRect(); cursor.value = { x: e.clientX - r.left, y: e.clientY - r.top } }
function onKey(e) {
  const d = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -14], ArrowDown: [0, 14] }[e.key]
  if (!d) return
  e.preventDefault()
  cursor.value ??= { ...t.value }
  cursor.value = { x: cursor.value.x + d[0], y: cursor.value.y + d[1] }
}
onMounted(() => { raf = requestAnimationFrame(frame) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
const result = (completed) => ({ completed, accuracy: share.value, errors: null, meanRtMs: null, metrics: { secondsTracked: Math.round(totalMs / 1000), radius: props.params.radius, speed: props.params.speed } })
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.field-area { cursor: crosshair; }
.ring { position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); transition: background var(--d-fast); }
.ring.in { background: color-mix(in srgb, var(--teal) 28%, transparent); border-color: var(--teal); }
.cur { position: absolute; width: 16px; height: 16px; transform: translate(-50%, -50%); border-radius: 50%; background: var(--ink); pointer-events: none; }
</style>
