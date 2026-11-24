<!-- Signature hero visual: an illustrative forecast drawn as a widening range ("a range, not a promise").
     Scrub with pointer, touch or arrow keys. Clearly labelled as an illustration — not a prediction. -->
<template>
  <figure class="fan" :class="{ live: ready }">
    <div class="fan__plot" ref="plot" tabindex="0" role="slider" aria-label="Иллюстрация: как растёт неопределённость прогноза со временем"
      :aria-valuemin="1" :aria-valuemax="weeks" :aria-valuenow="cursor" :aria-valuetext="`Неделя ${cursor}: диапазон ${band(cursor).lo}–${band(cursor).hi}`"
      @pointermove="onPointer" @pointerdown="onPointer" @keydown="onKey">
      <svg viewBox="0 0 600 360" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fanfill" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".05" /><stop offset="1" stop-color="var(--accent)" stop-opacity=".32" /></linearGradient>
        </defs>
        <g class="fan__grid"><line v-for="i in 4" :key="i" x1="0" x2="600" :y1="i * 72" :y2="i * 72" /></g>
        <path class="fan__band" :d="bandPath" fill="url(#fanfill)" />
        <path class="fan__edge" :d="edge('hi')" /><path class="fan__edge" :d="edge('lo')" />
        <path class="fan__line" :d="mid" />
        <path class="fan__obs" :d="observed" />
        <line class="fan__cursor" :x1="X(cursor)" :x2="X(cursor)" y1="8" y2="352" />
        <circle :cx="X(cursor)" :cy="Y(band(cursor).mid)" r="7" class="fan__knob" />
      </svg>
      <div class="fan__read" :style="{ left: `${(X(cursor) / 600) * 100}%` }">
        <span class="label">Неделя {{ cursor }}</span>
        <strong class="num">{{ band(cursor).lo }}–{{ band(cursor).hi }}</strong>
        <span>{{ cursor <= now ? 'наблюдение' : 'возможный диапазон' }}</span>
      </div>
    </div>
    <figcaption class="fan__cap"><span class="label">Иллюстрация</span> Прогноз — это диапазон, а не обещание. Чем дальше во времени, тем он шире.</figcaption>
  </figure>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { prefersReducedMotion } from '@/lib/ui'

const weeks = 26, now = 8
const cursor = ref(14)
const ready = ref(false)
const plot = ref(null)
onMounted(() => { requestAnimationFrame(() => { ready.value = true }) ; if (prefersReducedMotion()) ready.value = true })

// Smooth illustrative curve (arbitrary units 0–100), uncertainty grows after "today".
const midAt = (w) => 30 + 52 * (1 - Math.exp(-w / 9))
const spread = (w) => (w <= now ? 2 : 2 + (w - now) * 1.15)
const band = (w) => { const m = midAt(w), s = spread(w); return { mid: m, lo: Math.round(Math.max(0, m - s)), hi: Math.round(Math.min(100, m + s)) } }
const X = (w) => ((w - 1) / (weeks - 1)) * 600
const Y = (v) => 340 - (v / 100) * 320
const pts = Array.from({ length: weeks }, (_, i) => i + 1)
const mid = computed(() => pts.filter((w) => w >= now).map((w, i) => `${i ? 'L' : 'M'}${X(w)},${Y(midAt(w))}`).join(''))
const observed = computed(() => pts.filter((w) => w <= now).map((w, i) => `${i ? 'L' : 'M'}${X(w)},${Y(midAt(w) + Math.sin(w * 1.7) * 2.5)}`).join(''))
const fut = pts.filter((w) => w >= now)
const bandPath = computed(() => `M${fut.map((w) => `${X(w)},${Y(Math.min(100, midAt(w) + spread(w)))}`).join('L')}L${[...fut].reverse().map((w) => `${X(w)},${Y(Math.max(0, midAt(w) - spread(w)))}`).join('L')}Z`)
const edge = (k) => fut.map((w, i) => `${i ? 'L' : 'M'}${X(w)},${Y(k === 'hi' ? Math.min(100, midAt(w) + spread(w)) : Math.max(0, midAt(w) - spread(w)))}`).join('')

function onPointer(e) {
  const r = plot.value.getBoundingClientRect()
  cursor.value = Math.min(weeks, Math.max(1, Math.round(((e.clientX - r.left) / r.width) * (weeks - 1)) + 1))
}
function onKey(e) {
  const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
  if (e.key === 'Home') cursor.value = 1
  else if (e.key === 'End') cursor.value = weeks
  else if (d) cursor.value = Math.min(weeks, Math.max(1, cursor.value + d))
  else return
  e.preventDefault()
}
</script>

<style scoped>
.fan { margin: 0; display: grid; gap: var(--s-4); }
.fan__plot { position: relative; aspect-ratio: 5 / 3; border-radius: var(--r-panel); background: linear-gradient(180deg, var(--night-2), var(--night)); box-shadow: inset 0 0 0 1px rgba(236, 232, 223, 0.08); cursor: ew-resize; touch-action: pan-y; }
.fan__plot:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
svg { width: 100%; height: 100%; overflow: visible; }
.fan__grid line { stroke: rgba(236, 232, 223, 0.07); }
.fan__band { opacity: 0; transition: opacity 1.2s var(--ease-out) 0.5s; }
.fan__edge { fill: none; stroke: var(--accent); stroke-opacity: 0.4; stroke-width: 1; stroke-dasharray: 3 5; }
.fan__line, .fan__obs { fill: none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 900; stroke-dashoffset: 900; transition: stroke-dashoffset 1.6s var(--ease-out); }
.fan__line { stroke: var(--accent); stroke-dasharray: 2 8; stroke-dashoffset: 0; opacity: 0; transition: opacity 1s var(--ease-out) 0.9s; }
.fan__obs { stroke: var(--on-night); }
.live .fan__band, .live .fan__line { opacity: 1; }
.live .fan__obs { stroke-dashoffset: 0; }
.fan__cursor { stroke: rgba(236, 232, 223, 0.35); stroke-dasharray: 2 4; }
.fan__knob { fill: var(--night); stroke: var(--accent); stroke-width: 3; transition: cx var(--d-fast), cy var(--d-fast); }
.fan__read { position: absolute; top: var(--s-4); transform: translateX(-50%); display: grid; justify-items: center; gap: 2px; padding: var(--s-2) var(--s-3); border-radius: 14px; background: rgba(14, 23, 22, 0.86); color: var(--on-night); font-size: var(--t-sm); pointer-events: none; white-space: nowrap; transition: left var(--d-fast) var(--ease-out); }
.fan__read .label { color: var(--on-night-2); }
.fan__read strong { font-family: var(--font-display); font-size: var(--t-xl); font-weight: 400; }
.fan__cap { color: var(--on-night-2); font-size: var(--t-sm); display: flex; gap: var(--s-3); align-items: baseline; }
.fan__cap .label { color: var(--accent); }
</style>
