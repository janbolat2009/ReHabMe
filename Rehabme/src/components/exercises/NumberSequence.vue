<template>
  <div class="game">
    <p class="game__prompt">Какое число будет следующим?</p>
    <div class="game__meter" aria-hidden="true"><i v-for="r in ROUNDS" :key="r" :class="{ done: r <= round }" /></div>
    <p class="series num" :aria-label="`Ряд: ${q.items.join(', ')}, далее неизвестное число`">
      <span v-for="(n, i) in q.items" :key="i">{{ n }}</span><span class="series__q">?</span>
    </p>
    <div class="choice-row">
      <button v-for="o in q.options" :key="o" class="choice num" :class="{ 'is-ok': answered && o === q.answer, 'is-bad': answered && o === picked && o !== q.answer }" :disabled="answered || paused" @click="pick(o)">{{ o }}</button>
    </div>
    <p class="game__feedback" :class="picked === q.answer ? 'ok' : 'bad'" role="status">{{ answered ? (picked === q.answer ? 'Верно!' : `Правильный ответ: ${q.answer}. ${q.hint}`) : '' }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const ROUNDS = 6
const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const RULES = {
  add1: { gen: (s, i) => s + i, hint: 'Каждое следующее больше на 1.' },
  add2: { gen: (s, i) => s + 2 * i, hint: 'Каждое следующее больше на 2.' },
  add3: { gen: (s, i) => s + 3 * i, hint: 'Каждое следующее больше на 3.' },
  add4: { gen: (s, i) => s + 4 * i, hint: 'Каждое следующее больше на 4.' },
  add5: { gen: (s, i) => s + 5 * i, hint: 'Каждое следующее больше на 5.' },
  sub1: { gen: (s, i) => s + 20 - i, hint: 'Каждое следующее меньше на 1.' },
  sub2: { gen: (s, i) => s + 30 - 2 * i, hint: 'Каждое следующее меньше на 2.' },
  sub3: { gen: (s, i) => s + 40 - 3 * i, hint: 'Каждое следующее меньше на 3.' },
  mul2: { gen: (s, i) => (s % 3 + 1) * 2 ** i, hint: 'Каждое следующее в 2 раза больше.' },
  mul3: { gen: (s, i) => (s % 2 + 1) * 3 ** i, hint: 'Каждое следующее в 3 раза больше.' },
  alt: { gen: (s, i) => s + (i % 2 ? 5 : 0) + Math.floor(i / 2) * 2, hint: 'Чередуются два ряда.' },
  grow: { gen: (s, i) => s + (i * (i + 1)) / 2, hint: 'Разница каждый раз растёт на 1.' },
}
function make() {
  const key = props.params.rules[R(0, props.params.rules.length - 1)]
  const rule = RULES[key], s = R(1, 9), n = props.params.items
  const all = Array.from({ length: n + 1 }, (_, i) => rule.gen(s, i))
  const answer = all[n]
  const opts = new Set([answer])
  while (opts.size < 4) opts.add(answer + [-3, -2, -1, 1, 2, 3, 4, 5][R(0, 7)])
  return { items: all.slice(0, n), answer, options: [...opts].sort(() => Math.random() - 0.5), hint: rule.hint }
}
const q = ref(make()), round = ref(0), answered = ref(false), picked = ref(null)
let correct = 0, shownAt = performance.now()
const rts = []
function pick(o) {
  picked.value = o; answered.value = true
  rts.push(performance.now() - shownAt)
  if (o === q.value.answer) correct++
  round.value++
  emit('progress', { done: round.value, total: ROUNDS })
  setTimeout(() => {
    if (round.value >= ROUNDS) return emit('finish', result(true))
    q.value = make(); answered.value = false; picked.value = null; shownAt = performance.now()
  }, o === q.value.answer ? 900 : 2600)
}
const result = (completed) => ({ completed, accuracy: round.value ? correct / round.value : 0, errors: round.value - correct, meanRtMs: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null, metrics: { rounds: round.value } })
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.series { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-3); font-family: var(--font-display); font-size: var(--t-2xl); }
.series span { min-width: 2.2em; padding: var(--s-2) var(--s-3); text-align: center; border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); }
.series__q { background: var(--accent-soft) !important; color: var(--accent-ink); }
</style>
