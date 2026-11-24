<template>
  <div class="game">
    <p class="game__prompt">Найдите все такие фигуры: <span class="target-sample" aria-hidden="true"><Shape :kind="target" /></span><span class="sr-only">{{ NAMES[target] }}</span></p>
    <p class="game__sub" aria-live="polite">Отмечено: {{ marked.size }}</p>
    <div class="game__grid" :style="{ gridTemplateColumns: `repeat(${params.grid}, 1fr)`, width: `min(100%, ${params.grid * 92}px)` }">
      <button v-for="(c, i) in cells" :key="i" class="tile" :class="{ 'is-sel': marked.has(i) && !done, 'is-ok': done && c === target, 'is-bad': done && marked.has(i) && c !== target }"
        :aria-pressed="marked.has(i)" :aria-label="`${NAMES[c]}, клетка ${i + 1}`" :disabled="done || paused" @click="toggle(i)">
        <Shape :kind="c" />
      </button>
    </div>
    <Btn v-if="!done" size="lg" icon="check" @click="finish" :disabled="paused">Готово</Btn>
    <p v-else class="game__feedback ok" role="status">Найдено {{ hits }} из {{ total }}.</p>
  </div>
</template>

<script setup>
import { ref, computed, h } from 'vue'
import Btn from '@/components/ui/Btn.vue'

const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish'])
const NAMES = { circle: 'круг', square: 'квадрат', triangle: 'треугольник', diamond: 'ромб', ring: 'кольцо', hex: 'шестиугольник' }
const Shape = (p) => {
  const k = p.kind
  const s = { width: 40, height: 40, viewBox: '0 0 40 40', 'aria-hidden': 'true' }
  const fill = { fill: 'currentColor' }
  const shapes = {
    circle: h('circle', { cx: 20, cy: 20, r: 14, ...fill }),
    ring: h('circle', { cx: 20, cy: 20, r: 12, fill: 'none', stroke: 'currentColor', 'stroke-width': 5 }),
    square: h('rect', { x: 7, y: 7, width: 26, height: 26, rx: 3, ...fill }),
    diamond: h('path', { d: 'M20 4 36 20 20 36 4 20z', ...fill }),
    triangle: h('path', { d: 'M20 5 36 34H4z', ...fill }),
    hex: h('path', { d: 'M12 5h16l8 15-8 15H12L4 20z', ...fill }),
  }
  return h('svg', s, [shapes[k]])
}
Shape.props = ['kind']
const [target, ...rest] = props.params.similar ? ['circle', 'ring', 'hex'] : ['triangle', 'circle', 'square', 'diamond']
const n = props.params.grid ** 2
const cells = ref(Array.from({ length: n }, (_, i) => (i < props.params.targets ? target : rest[i % rest.length])).sort(() => Math.random() - 0.5))
const marked = ref(new Set()), done = ref(false), start = performance.now()
const total = props.params.targets
const hits = computed(() => [...marked.value].filter((i) => cells.value[i] === target).length)
function toggle(i) { const s = new Set(marked.value); s.has(i) ? s.delete(i) : s.add(i); marked.value = s }
function finish() { done.value = true; setTimeout(() => emit('finish', result(true)), 1500) }
const result = (completed) => {
  const fa = marked.value.size - hits.value
  return { completed, accuracy: hits.value / (total + fa), errors: total - hits.value + fa, meanRtMs: (performance.now() - start) / total, metrics: { targets: total, hits: hits.value, falseAlarms: fa, grid: props.params.grid } }
}
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.target-sample { display: inline-grid; place-items: center; vertical-align: middle; width: 52px; height: 52px; border-radius: 14px; background: var(--accent-soft); color: var(--accent-ink); }
.tile { color: var(--ink-2); }
</style>
