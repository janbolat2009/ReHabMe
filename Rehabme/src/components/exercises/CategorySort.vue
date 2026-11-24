<template>
  <div class="game">
    <p class="game__prompt">К какой группе относится?</p>
    <p class="game__sub">{{ idx + 1 }} из {{ items.length }}</p>
    <Transition name="rise" mode="out-in"><div :key="idx" class="item">{{ items[idx]?.w }}</div></Transition>
    <div class="choice-row">
      <button v-for="c in cats" :key="c" class="choice" :class="{ 'is-ok': answered && c === items[idx].c, 'is-bad': answered && c === picked && c !== items[idx].c }" :disabled="answered || paused" @click="pick(c)">{{ c }}</button>
    </div>
    <p class="game__feedback" :class="picked === items[idx]?.c ? 'ok' : 'bad'" role="status">{{ answered ? (picked === items[idx].c ? 'Верно!' : `Это — ${items[idx].c.toLowerCase()}`) : '' }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const BANK = {
  Фрукты: ['яблоко', 'груша', 'банан', 'слива', 'апельсин', 'персик', 'вишня'],
  Животные: ['кошка', 'лошадь', 'заяц', 'корова', 'собака', 'медведь', 'лиса'],
  Одежда: ['рубашка', 'шарф', 'куртка', 'носки', 'платье', 'шапка', 'брюки'],
  Транспорт: ['автобус', 'поезд', 'велосипед', 'трамвай', 'самолёт', 'лодка', 'такси'],
}
const cats = Object.keys(BANK).sort(() => Math.random() - 0.5).slice(0, props.params.categories)
const items = cats.flatMap((c) => BANK[c].map((w) => ({ w, c }))).sort(() => Math.random() - 0.5).slice(0, props.params.items)
const idx = ref(0), answered = ref(false), picked = ref(null)
let correct = 0, shownAt = performance.now()
const rts = []
function pick(c) {
  picked.value = c; answered.value = true
  rts.push(performance.now() - shownAt)
  if (c === items[idx.value].c) correct++
  emit('progress', { done: idx.value + 1, total: items.length })
  setTimeout(() => {
    if (idx.value + 1 >= items.length) return emit('finish', result(true))
    idx.value++; answered.value = false; picked.value = null; shownAt = performance.now()
  }, c === items[idx.value].c ? 700 : 1800)
}
const result = (completed) => {
  const n = rts.length
  return { completed, accuracy: n ? correct / n : 0, errors: n - correct, meanRtMs: n ? rts.reduce((a, b) => a + b, 0) / n : null, metrics: { categories: cats.length, items: n } }
}
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.item { padding: var(--s-5) var(--s-7); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); font-size: var(--t-2xl); font-weight: 600; }
</style>
