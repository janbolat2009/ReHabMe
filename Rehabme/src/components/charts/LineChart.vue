<!-- Accessible SVG line chart: optional uncertainty band, keyboard/pointer inspection, SR data table. -->
<template>
  <figure class="lc" ref="root">
    <div
      class="lc__plot" tabindex="0" role="img" :aria-label="ariaLabel"
      @pointermove="onPointer" @pointerleave="cursor = null" @keydown="onKey" @focus="cursor ??= xs.length - 1" @blur="cursor = null"
    >
      <svg :viewBox="`0 0 ${w} ${height}`" :width="w" :height="height" aria-hidden="true">
        <g class="lc__grid">
          <g v-for="t in yTicks" :key="t">
            <line :x1="pad.l" :x2="w - pad.r" :y1="sy(t)" :y2="sy(t)" />
            <text :x="pad.l - 8" :y="sy(t)" dy="0.32em" text-anchor="end">{{ yFormat(t) }}</text>
          </g>
          <text v-for="(t, i) in xTicks" :key="'x' + i" :x="sx(t)" :y="height - 6" text-anchor="middle">{{ xFormat(t) }}</text>
        </g>
        <path v-if="band" class="lc__band" :d="bandPath" :style="{ fill: band.color || 'var(--accent)' }" />
        <path v-for="m in markers" :key="'m' + m.x" class="lc__marker" :d="`M${sx(m.x)},${pad.t} V${height - pad.b}`" />
        <path
          v-for="(s, i) in series" :key="s.id" class="lc__line" :class="{ dashed: s.dashed, draw: animate }"
          :d="linePath(s.points)" :style="{ stroke: s.color, '--len': 2400, animationDelay: i * 120 + 'ms' }"
        />
        <g v-for="s in series" :key="s.id + 'dots'">
          <template v-if="s.dots !== false">
            <circle v-for="p in s.points.filter((p) => p.y != null)" :key="String(p.x)" class="lc__dot" :cx="sx(p.x)" :cy="sy(p.y)" r="3.5" :style="{ fill: s.color }" />
          </template>
        </g>
        <g v-if="cursor != null">
          <line class="lc__cursor" :x1="sx(xs[cursor])" :x2="sx(xs[cursor])" :y1="pad.t" :y2="height - pad.b" />
          <template v-for="s in series" :key="s.id + 'c'">
            <circle v-if="valueAt(s, xs[cursor]) != null" :cx="sx(xs[cursor])" :cy="sy(valueAt(s, xs[cursor]))" r="6" class="lc__focus" :style="{ stroke: s.color }" />
          </template>
        </g>
      </svg>
      <div v-if="cursor != null" class="lc__tip" :style="tipStyle" aria-hidden="true">
        <strong>{{ xFormat(xs[cursor], true) }}</strong>
        <template v-for="s in series" :key="s.id">
          <span v-if="valueAt(s, xs[cursor]) != null"><i :style="{ background: s.color }" />{{ s.label }}: {{ yFormat(valueAt(s, xs[cursor])) }}</span>
        </template>
        <span v-if="band && bandAt(xs[cursor])">{{ band.label }}: {{ yFormat(bandAt(xs[cursor]).lo) }}–{{ yFormat(bandAt(xs[cursor]).hi) }}</span>
      </div>
    </div>
    <figcaption v-if="legend" class="lc__legend">
      <span v-for="s in series" :key="s.id"><i :class="{ dashed: s.dashed }" :style="{ background: s.dashed ? 'transparent' : s.color, borderColor: s.color }" />{{ s.label }}</span>
      <span v-if="band"><i class="band" :style="{ background: band.color || 'var(--accent)' }" />{{ band.label }}</span>
    </figcaption>
    <div class="sr-only"><table>
      <caption>{{ ariaLabel }}</caption>
      <thead><tr><th>{{ xLabel }}</th><th v-for="s in series" :key="s.id">{{ s.label }}</th></tr></thead>
      <tbody><tr v-for="x in xs" :key="String(x)"><td>{{ xFormat(x, true) }}</td><td v-for="s in series" :key="s.id">{{ valueAt(s, x) == null ? '—' : yFormat(valueAt(s, x)) }}</td></tr></tbody>
    </table></div>
  </figure>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { prefersReducedMotion } from '@/lib/ui'

const props = defineProps({
  series: { type: Array, required: true }, // [{ id, label, color, points: [{x, y}], dashed?, dots? }]
  band: Object, // { label, color, points: [{x, lo, hi}] }
  markers: { type: Array, default: () => [] },
  height: { type: Number, default: 240 },
  yMin: Number,
  yMax: Number,
  yFormat: { type: Function, default: (v) => String(Math.round(v * 10) / 10) },
  xFormat: { type: Function, default: (v) => String(v) },
  xLabel: { type: String, default: 'Дата' },
  ariaLabel: { type: String, required: true },
  legend: { type: Boolean, default: true },
})

const root = ref(null)
const w = ref(640)
const cursor = ref(null)
const animate = ref(false)
const pad = { l: 44, r: 14, t: 14, b: 28 }
let ro

onMounted(() => {
  ro = new ResizeObserver(([e]) => { w.value = Math.max(260, Math.round(e.contentRect.width)) })
  ro.observe(root.value)
  animate.value = !prefersReducedMotion()
})
onBeforeUnmount(() => ro?.disconnect())

const toNum = (x) => (typeof x === 'string' ? Date.parse(x) : x)
const xs = computed(() => [...new Set(props.series.flatMap((s) => s.points.map((p) => p.x)).concat(props.band?.points.map((p) => p.x) ?? []))].sort((a, b) => toNum(a) - toNum(b)))
const xDomain = computed(() => { const n = xs.value.map(toNum); return n.length ? [Math.min(...n), Math.max(...n)] : [0, 1] })
const yDomain = computed(() => {
  const vals = props.series.flatMap((s) => s.points.map((p) => p.y)).concat(props.band?.points.flatMap((p) => [p.lo, p.hi]) ?? []).filter((v) => v != null)
  const lo = props.yMin ?? (vals.length ? Math.min(...vals) : 0)
  const hi = props.yMax ?? (vals.length ? Math.max(...vals) : 1)
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi]
})
const sx = (x) => { const [a, b] = xDomain.value; return pad.l + (b === a ? 0.5 : (toNum(x) - a) / (b - a)) * (w.value - pad.l - pad.r) }
const sy = (y) => { const [a, b] = yDomain.value; return props.height - pad.b - ((y - a) / (b - a)) * (props.height - pad.t - pad.b) }
const yTicks = computed(() => { const [a, b] = yDomain.value; return [0, 0.25, 0.5, 0.75, 1].map((f) => a + f * (b - a)) })
const xTicks = computed(() => { const n = xs.value.length; const k = Math.min(n, w.value < 420 ? 3 : 5); return n ? Array.from({ length: k }, (_, i) => xs.value[Math.round((i * (n - 1)) / Math.max(1, k - 1))]) : [] })

function linePath(points) {
  let d = '', pen = false
  for (const p of points) {
    if (p.y == null) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`
    pen = true
  }
  return d
}
const bandPath = computed(() => {
  const pts = props.band.points
  return `M${pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.hi).toFixed(1)}`).join('L')}L${[...pts].reverse().map((p) => `${sx(p.x).toFixed(1)},${sy(p.lo).toFixed(1)}`).join('L')}Z`
})
const valueAt = (s, x) => s.points.find((p) => p.x === x)?.y ?? null
const bandAt = (x) => props.band?.points.find((p) => p.x === x)

function onPointer(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const px = e.clientX - r.left
  let best = 0, bd = Infinity
  xs.value.forEach((x, i) => { const d = Math.abs(sx(x) - px); if (d < bd) { bd = d; best = i } })
  cursor.value = best
}
function onKey(e) {
  const n = xs.value.length
  if (!n) return
  if (e.key === 'ArrowRight') cursor.value = Math.min(n - 1, (cursor.value ?? -1) + 1)
  else if (e.key === 'ArrowLeft') cursor.value = Math.max(0, (cursor.value ?? n) - 1)
  else if (e.key === 'Home') cursor.value = 0
  else if (e.key === 'End') cursor.value = n - 1
  else return
  e.preventDefault()
}
const tipStyle = computed(() => {
  const x = sx(xs.value[cursor.value])
  return x > w.value * 0.6 ? { right: `${w.value - x + 12}px` } : { left: `${x + 12}px` }
})
</script>

<style scoped>
.lc { position: relative; margin: 0; display: grid; gap: var(--s-3); width: 100%; min-width: 0; }
.lc__plot { position: relative; border-radius: 14px; outline-offset: 4px; touch-action: pan-y; }
svg { overflow: visible; font-family: var(--font-mono); font-size: 11px; }
.lc__grid line { stroke: var(--line); }
.lc__grid text { fill: var(--ink-3); }
.lc__band { opacity: 0.16; }
.lc__marker { stroke: var(--ink-3); stroke-dasharray: 3 4; }
.lc__line { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.lc__line.dashed { stroke-dasharray: 6 6; stroke-width: 2; }
.lc__line.draw:not(.dashed) { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: draw calc(var(--d-slow) * 2) var(--ease-out) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.lc__dot { stroke: var(--surface); stroke-width: 1.5; }
.lc__cursor { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
.lc__focus { fill: var(--surface); stroke-width: 3; }
.lc__tip { position: absolute; top: 6px; z-index: 2; display: grid; gap: 2px; padding: var(--s-2) var(--s-3); border-radius: 12px; background: var(--ink); color: var(--paper); font-size: var(--t-sm); pointer-events: none; white-space: nowrap; box-shadow: var(--shadow-2); }
.lc__tip i, .lc__legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; border: 2px solid transparent; }
.lc__legend { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); color: var(--ink-2); font-size: var(--t-sm); }
.lc__legend i.dashed { border-style: dashed; background: transparent; }
.lc__legend i.band { opacity: 0.35; width: 18px; }
</style>
