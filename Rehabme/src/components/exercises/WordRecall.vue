<template>
  <div class="game">
    <template v-if="phase === 'study'">
      <p class="game__prompt">Прочитайте и запомните слова</p>
      <ul class="words"><li v-for="w in targets" :key="w">{{ w }}</li></ul>
      <Btn size="lg" icon="check" @click="toRecall" :disabled="paused">Я запомнил(а)</Btn>
      <p v-if="timed" class="game__sub">Перейти можно в любой момент. Автоматически — через {{ left }} с.</p>
    </template>
    <template v-else>
      <p class="game__prompt">Отметьте слова, которые были в списке</p>
      <div class="choice-row">
        <button v-for="w in pool" :key="w" class="choice" :class="{ 'is-ok': checked && targets.includes(w), 'is-bad': checked && chosen.has(w) && !targets.includes(w) }"
          :aria-pressed="chosen.has(w)" :disabled="checked || paused" @click="toggle(w)" :style="chosen.has(w) && !checked ? 'background: var(--ink); color: var(--paper); border-color: var(--ink)' : ''">
          {{ w }}
        </button>
      </div>
      <Btn v-if="!checked" size="lg" @click="check" :disabled="!chosen.size || paused">Проверить</Btn>
      <p v-else class="game__feedback ok" role="status">Узнано {{ hits }} из {{ targets.length }} слов{{ falseAlarms ? `, лишних отметок: ${falseAlarms}` : '' }}.</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Btn from '@/components/ui/Btn.vue'

const props = defineProps({ params: Object, timed: Boolean, paused: Boolean })
const emit = defineEmits(['finish'])
const BANK = ['яблоко', 'окно', 'река', 'книга', 'стул', 'лимон', 'кошка', 'зонт', 'часы', 'мост', 'лампа', 'сад', 'ключ', 'хлеб', 'поезд', 'гора', 'чашка', 'птица', 'дверь', 'море', 'шарф', 'облако', 'ложка', 'цветок', 'письмо', 'дождь', 'сыр', 'лодка', 'карандаш', 'снег']
const shuffled = [...BANK].sort(() => Math.random() - 0.5)
const targets = shuffled.slice(0, props.params.words)
const pool = [...targets, ...shuffled.slice(props.params.words, props.params.words + props.params.distractors)].sort(() => Math.random() - 0.5)
const phase = ref('study'), chosen = ref(new Set()), checked = ref(false), left = ref(props.params.words * 4 + 6)
let start = performance.now(), recallStart = 0, tick
const hits = computed(() => [...chosen.value].filter((w) => targets.includes(w)).length)
const falseAlarms = computed(() => chosen.value.size - hits.value)

function toRecall() { phase.value = 'recall'; recallStart = performance.now(); clearInterval(tick) }
function toggle(w) { const s = new Set(chosen.value); s.has(w) ? s.delete(w) : s.add(w); chosen.value = s }
function check() { checked.value = true; setTimeout(() => emit('finish', result(true)), 1600) }
onMounted(() => { if (props.timed) tick = setInterval(() => { if (!props.paused && --left.value <= 0) toRecall() }, 1000) })
onBeforeUnmount(() => clearInterval(tick))
watch(() => props.paused, () => {})
const result = (completed) => {
  const correctRejections = pool.length - targets.length - falseAlarms.value
  return {
    completed, accuracy: (hits.value + correctRejections) / pool.length, errors: targets.length - hits.value + falseAlarms.value,
    meanRtMs: recallStart ? performance.now() - recallStart : null,
    metrics: { words: targets.length, hits: hits.value, falseAlarms: falseAlarms.value, studyMs: Math.round((recallStart || performance.now()) - start) },
  }
}
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.words { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-3); max-width: 720px; }
.words li { padding: var(--s-3) var(--s-5); border-radius: var(--r-pill); background: var(--surface); box-shadow: var(--shadow-1); font-size: var(--t-xl); font-weight: 600; }
</style>
