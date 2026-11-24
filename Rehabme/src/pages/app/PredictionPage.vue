<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)">
      <p class="label">Модель машинного обучения</p>
      <h1 class="title">Прогноз</h1>
      <p class="lede">Оценка возможных сроков достижения конкретных целей по клиническим шкалам — диапазоном, с объяснением неопределённости. Это не обещание и не медицинское заключение.</p>
    </header>
    <div class="cluster">
      <Btn icon="refresh" :loading="running" @click="run">{{ prediction ? 'Пересчитать' : 'Рассчитать оценку' }}</Btn>
      <span v-if="prediction" class="muted small">Рассчитано {{ fmtDate(prediction.createdAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</span>
    </div>
    <div v-if="loading" class="skeleton" style="height: 360px" />
    <StateBlock v-else-if="error" tone="error" title="Не удалось получить прогноз" :text="error"><template #actions><Btn icon="refresh" @click="run">Повторить</Btn></template></StateBlock>
    <StateBlock v-else-if="!prediction" title="Оценка ещё не рассчитывалась" text="Для расчёта нужны клинические оценки, которые вносит специалист (индекс Бартел, шкала Фугл-Мейера), и дата инсульта в профиле." icon="steps" />
    <PredictionView v-else :prediction="prediction" />
    <details class="about">
      <summary>Как работает прогноз</summary>
      <p>Отдельная модель машинного обучения оценивает, через какое время может быть достигнута цель по стандартной клинической шкале, и насколько это неопределённо. Модель не использует ваши сообщения ассистенту. Ассистент не делает прогнозов.</p>
      <p>Если данных мало или ваш профиль сильно отличается от данных обучения, модель не делает оценку. До клинической валидации прогноз показывается только в исследовательском или демонстрационном режиме.</p>
    </details>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import PredictionView from '@/components/prediction/PredictionView.vue'
import { api } from '@/lib/api'
import { fmtDate, announce } from '@/lib/ui'

const prediction = ref(null), loading = ref(true), running = ref(false), error = ref('')
onMounted(async () => { try { prediction.value = (await api.get('/predictions/latest')).prediction } catch (e) { error.value = e.message } finally { loading.value = false } })
async function run() {
  running.value = true; error.value = ''
  try { prediction.value = (await api.post('/predictions')).prediction; announce('Оценка обновлена') } catch (e) { error.value = e.message } finally { running.value = false }
}
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.small { font-size: var(--t-sm); }
.about { padding: var(--s-4); border-radius: 18px; background: var(--paper-2); }
.about summary { cursor: pointer; font-weight: 600; }
.about p { margin-top: var(--s-3); color: var(--ink-2); }
</style>
