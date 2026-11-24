<!-- Accessible SVG bar chart (daily minutes etc.). Zero values remain visible as gaps — never hidden. -->
<template>
  <figure class="bc" ref="root">
    <svg :viewBox="`0 0 ${w} ${height}`" :width="w" :height="height" role="img" :aria-label="ariaLabel">
      <line :x1="0" :x2="w" :y1="height - 22" :y2="height - 22" class="bc__axis" />
      <g v-for="(d, i) in data" :key="d.label">
        <rect
          :x="i * step + gap / 2" :width="Math.max(2, step - gap)" :y="height - 22 - bh(d.value)" :height="bh(d.value)" rx="4"
          class="bc__bar" :class="{ zero: !d.value, anim: animate }" :style="{ '--i': i, fill: color }"
        ><title>{{ d.title ?? d.label }}: {{ format(d.value) }}</title></rect>
        <text v-if="showLabel(i)" :x="i * step + step / 2" :y="height - 6" text-anchor="middle">{{ d.label }}</text>
      </g>
    </svg>
    <div class="sr-only"><table><caption>{{ ariaLabel }}</caption><tbody><tr v-for="d in data" :key="d.label"><th>{{ d.title ?? d.label }}</th><td>{{ format(d.value) }}</td></tr></tbody></table></div>
  </figure>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { prefersReducedMotion } from '@/lib/ui'
const props = defineProps({ data: Array, height: { type: Number, default: 140 }, color: { type: String, default: 'var(--teal)' }, ariaLabel: String, format: { type: Function, default: (v) => String(v) } })
const root = ref(null)
const w = ref(600)
const animate = ref(false)
let ro
onMounted(() => { ro = new ResizeObserver(([e]) => { w.value = Math.max(240, Math.round(e.contentRect.width)) }); ro.observe(root.value); animate.value = !prefersReducedMotion() })
onBeforeUnmount(() => ro?.disconnect())
const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)))
const step = computed(() => w.value / Math.max(1, props.data.length))
const gap = computed(() => Math.min(10, step.value * 0.3))
const bh = (v) => (v ? Math.max(3, (v / max.value) * (props.height - 36)) : 2)
const showLabel = (i) => { const n = props.data.length; const every = Math.ceil(n / (w.value < 420 ? 4 : 8)); return i % every === 0 || i === n - 1 }
</script>

<style scoped>
.bc { position: relative; margin: 0; width: 100%; min-width: 0; }
svg { overflow: visible; font-family: var(--font-mono); font-size: 11px; }
text { fill: var(--ink-3); }
.bc__axis { stroke: var(--line-strong); }
.bc__bar.zero { fill: var(--line-strong) !important; }
.bc__bar.anim { transform-box: fill-box; transform-origin: bottom; animation: grow var(--d-slow) var(--ease-out) both; animation-delay: calc(var(--i) * 18ms); }
@keyframes grow { from { transform: scaleY(0); } }
</style>
