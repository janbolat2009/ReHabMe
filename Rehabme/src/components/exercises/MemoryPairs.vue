<template>
  <div class="game">
    <p class="game__prompt">Найдите все пары одинаковых карточек</p>
    <p class="game__sub" aria-live="polite">Найдено пар: {{ found }} из {{ params.pairs }}</p>
    <div class="game__grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }">
      <button v-for="(c, i) in cards" :key="i" class="tile" :class="{ 'is-back': !c.open && !c.done, 'is-ok': c.done }"
        :disabled="paused || c.done || c.open || busy" :aria-label="c.open || c.done ? `Карточка ${i + 1}: ${c.label}${c.done ? ', пара найдена' : ''}` : `Карточка ${i + 1}, закрыта`" @click="flip(i)">
        <Icon v-if="c.open || c.done" :name="c.icon" :size="34" stroke="2.2" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'

const props = defineProps({ params: Object, paused: Boolean })
const emit = defineEmits(['finish', 'progress'])
const FACES = [['heart', 'сердце'], ['sun', 'солнце'], ['moon', 'луна'], ['flag', 'флаг'], ['book', 'книга'], ['bell', 'колокольчик'], ['eye', 'глаз'], ['hand', 'ладонь'], ['mic', 'микрофон'], ['puzzle', 'пазл'], ['target', 'мишень'], ['pill', 'таблетка']]
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
const cards = ref(shuffle(FACES.slice(0, props.params.pairs).flatMap(([icon, label]) => [{ icon, label }, { icon, label }])).map((c) => ({ ...c, open: false, done: false })))
const cols = computed(() => (cards.value.length <= 6 ? 3 : cards.value.length <= 12 ? 4 : 5))
const found = ref(0), attempts = ref(0), errors = ref(0), busy = ref(false)
const turnTimes = []
let first = null, turnStart = performance.now()

function flip(i) {
  const c = cards.value[i]
  c.open = true
  if (first === null) { first = i; return }
  attempts.value++
  turnTimes.push(performance.now() - turnStart)
  const a = cards.value[first]
  if (a.icon === c.icon) {
    a.done = c.done = true
    found.value++
    first = null
    turnStart = performance.now()
    emit('progress', { done: found.value, total: props.params.pairs })
    if (found.value === props.params.pairs) emit('finish', result(true))
  } else {
    errors.value++
    busy.value = true
    setTimeout(() => { a.open = c.open = false; first = null; busy.value = false; turnStart = performance.now() }, 1100)
  }
}
const result = (completed) => ({
  completed, accuracy: attempts.value ? found.value / attempts.value : 0, errors: errors.value,
  meanRtMs: turnTimes.length ? turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length : null,
  metrics: { pairs: props.params.pairs, found: found.value, attempts: attempts.value },
})
defineExpose({ partial: () => result(false) })
</script>
