<!-- Guided content (video / audio / reflection). Preserves the original ReHabMe media library. -->
<template>
  <div class="game">
    <template v-if="exercise.id === 'motor-video'">
      <video class="media" :src="src" controls playsinline preload="metadata" @error="mediaError = true">Ваш браузер не поддерживает видео.</video>
      <p class="game__sub">Сначала посмотрите видео целиком, затем повторите движения в своём темпе. Видео не включается само.</p>
    </template>
    <template v-else-if="exercise.id === 'speech-repeat'">
      <audio class="audio" :src="src" controls preload="metadata" @error="mediaError = true">Ваш браузер не поддерживает аудио.</audio>
      <p class="game__sub">Прослушайте запись и повторите вслух. Можно слушать сколько угодно раз.</p>
    </template>
    <template v-else>
      <p class="game__prompt">{{ PROMPTS[params.prompt] }}</p>
      <div class="choice-row" role="radiogroup" aria-label="Настроение">
        <button v-for="m in MOODS" :key="m.v" class="choice mood" role="radio" :aria-checked="mood === m.v" :class="{ 'is-ok': mood === m.v }" @click="mood = m.v"><Icon :name="m.icon" />{{ m.l }}</button>
      </div>
      <p class="game__sub">Ответ сохраняется только как отметка настроения — без текста.</p>
    </template>
    <StateBlock v-if="mediaError" tone="error" title="Не удалось загрузить материал" text="Проверьте интернет и попробуйте позже. Упражнение можно пропустить." />
    <Scale v-if="exercise.kind === 'guided' && exercise.id !== 'wellbeing-checkin'" v-model="ease" :min="1" :max="5" label="Насколько легко было выполнить?" min-label="Очень трудно" max-label="Легко" />
    <Btn size="lg" icon="check" :disabled="!canFinish || paused" @click="finish">Готово</Btn>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Scale from '@/components/ui/Scale.vue'
import StateBlock from '@/components/ui/StateBlock.vue'

const props = defineProps({ exercise: Object, params: Object, paused: Boolean })
const emit = defineEmits(['finish'])
const PROMPTS = { gratitude: 'Вспомните одну вещь, которая сегодня порадовала. Как вы себя чувствуете?', visualize: 'Закройте глаза на минуту и вспомните приятный момент. Как настроение сейчас?', hobby: 'Чем бы вы хотели сегодня заняться для удовольствия? Как настроение?' }
const MOODS = [{ v: 1, l: 'Тяжело', icon: 'moon' }, { v: 2, l: 'Так себе', icon: 'clock' }, { v: 3, l: 'Нормально', icon: 'check' }, { v: 4, l: 'Хорошо', icon: 'sun' }, { v: 5, l: 'Отлично', icon: 'heart' }]
const media = props.params.media ?? []
const dayIndex = Math.floor(Date.now() / 864e5)
const src = media.length ? media[dayIndex % media.length] : ''
const ease = ref(null), mood = ref(null), mediaError = ref(false), start = performance.now()
const canFinish = computed(() => (props.exercise.id === 'wellbeing-checkin' ? mood.value != null : ease.value != null || mediaError.value))
const result = (completed) => ({ completed, accuracy: null, errors: null, meanRtMs: null, metrics: { ease: ease.value, mood: mood.value, media: src || null, mediaError: mediaError.value } })
function finish() { emit('finish', { ...result(!mediaError.value), durationOverrideMs: performance.now() - start }) }
defineExpose({ partial: () => result(false) })
</script>

<style scoped>
.media { width: min(100%, 760px); max-height: 60vh; border-radius: var(--r-panel); background: #000; }
.audio { width: min(100%, 520px); }
.mood { display: grid; justify-items: center; gap: 4px; font-size: var(--t-md); padding: var(--s-3); }
</style>
