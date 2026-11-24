<!-- Focused session flow: check-in → exercises (with breaks) → check-out → summary. No navigation chrome. -->
<template>
  <div class="sess">
    <header class="sess__bar no-print">
      <RouterLink to="/app" class="sess__back"><Icon name="left" />К плану</RouterLink>
      <div class="sess__progress" v-if="items.length && step === 'run'" aria-hidden="true"><i v-for="(it, i) in items" :key="i" :class="{ done: i < idx, now: i === idx }" /></div>
      <a href="tel:103" class="sess__sos" aria-label="Позвонить в скорую помощь, 103"><Icon name="phone" :size="18" />103</a>
    </header>
    <main id="main" class="container sess__main" tabindex="-1">
      <div v-if="loading" class="stack"><div class="skeleton" style="height: 48px; width: 50%" /><div class="skeleton" style="height: 320px" /></div>
      <StateBlock v-else-if="loadError" tone="error" title="Не удалось начать занятие" :text="loadError"><template #actions><Btn @click="load" icon="refresh">Повторить</Btn><Btn variant="secondary" to="/app">К плану</Btn></template></StateBlock>

      <!-- Check-in -->
      <section v-else-if="step === 'checkin'" class="stack narrow" style="--gap: var(--s-5)">
        <p class="label">{{ single ? 'Отдельное упражнение' : `Занятие · ${items.length} ${plural(items.length, 'упражнение', 'упражнения', 'упражнений')} · ~${minutes} мин` }}</p>
        <h1 class="h1">Как вы себя чувствуете перед началом?</h1>
        <Scale v-model="fatigueBefore" label="Усталость сейчас" min-label="0 — бодрость" max-label="10 — сильная усталость" />
        <p v-if="fatigueBefore >= 8" class="note note--warn"><Icon name="info" :size="18" />Сильная усталость. Возможно, сегодня лучше сделать одно короткое упражнение или отдохнуть.</p>
        <p class="note"><Icon name="alert" :size="18" />При внезапной слабости, онемении, нарушении речи или асимметрии лица — не занимайтесь, звоните 103.</p>
        <div class="cluster hand-aware"><Btn size="lg" trail="arrow" :loading="starting" :disabled="fatigueBefore == null" @click="begin">Начать</Btn><Btn variant="ghost" to="/app">Не сейчас</Btn></div>
      </section>

      <!-- Exercises -->
      <section v-else-if="step === 'run'">
        <ExerciseRunner :key="idx" :exercise="current.ex" :level="current.level" :domain-label="domainLabel(current.ex.domain)" :submit="submitResult" :skippable="!single" @done="next" @skip="next" />
      </section>

      <!-- Break between exercises -->
      <section v-else-if="step === 'break'" class="stack narrow center" style="--gap: var(--s-5)">
        <div class="breath" aria-hidden="true" />
        <p class="label">Перерыв · {{ idx }} из {{ items.length }}</p>
        <h1 class="h1">Небольшая пауза</h1>
        <p class="lede">Сделайте пару спокойных вдохов. Следующее — «{{ current.ex.title }}». Продолжайте, когда будете готовы.</p>
        <div class="cluster" style="justify-content: center"><Btn size="lg" trail="arrow" @click="step = 'run'">Продолжить</Btn><Btn variant="secondary" icon="stop" @click="finishEarly">Закончить на сегодня</Btn></div>
      </section>

      <!-- Check-out -->
      <section v-else-if="step === 'checkout'" class="stack narrow" style="--gap: var(--s-5)">
        <p class="label">Почти готово</p>
        <h1 class="h1">Как вы себя чувствуете после занятия?</h1>
        <Scale v-model="fatigueAfter" label="Усталость" min-label="0 — бодрость" max-label="10 — сильная" />
        <Scale v-model="discomfort" label="Боль или дискомфорт" min-label="0 — нет" max-label="10 — сильный" />
        <fieldset v-if="stopped" class="stack" style="border: 0; padding: 0; margin: 0">
          <legend class="h3">Почему остановились? (необязательно)</legend>
          <Segmented v-model="stopReason" label="Причина остановки" :options="REASONS" />
        </fieldset>
        <p v-if="discomfort >= 7" class="note note--danger" role="alert"><Icon name="alert" :size="18" />Сильный дискомфорт. Отдохните и сообщите врачу. Программа не будет повышать сложность. Если симптомы внезапные — звоните 103.</p>
        <p v-if="completeError" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ completeError }}</p>
        <div class="cluster hand-aware"><Btn size="lg" :loading="completing" :disabled="fatigueAfter == null || discomfort == null" @click="complete">Сохранить и завершить</Btn></div>
      </section>

      <!-- Summary -->
      <section v-else-if="step === 'done'" class="stack narrow center" style="--gap: var(--s-5)">
        <div class="done-mark" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" /><path d="M36 62l16 16 34-36" /></svg></div>
        <h1 class="h1">{{ stopped ? 'Занятие сохранено' : 'Занятие завершено' }}</h1>
        <p class="lede">{{ stopped ? 'Вы остановились вовремя — это правильно. Продолжим, когда будете готовы.' : `Выполнено упражнений: ${doneCount}. Спасибо, что занимаетесь регулярно.` }}</p>
        <ul v-if="outcome?.levelChanges?.length" class="changes">
          <li v-for="c in outcome.levelChanges" :key="c.domain"><Icon :name="DOMAIN_ICON[c.domain]" /><span>{{ domainLabel(c.domain) }}: уровень {{ c.from }} → <b>{{ c.to }}</b></span><span class="muted">{{ c.to > c.from ? 'стабильно высокая точность' : 'задания давались трудно' }}</span></li>
        </ul>
        <div class="cluster" style="justify-content: center"><Btn size="lg" to="/app">К плану на сегодня</Btn><Btn variant="secondary" to="/app/progress" icon="chart">Посмотреть прогресс</Btn></div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import ExerciseRunner from '@/components/exercises/ExerciseRunner.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Scale from '@/components/ui/Scale.vue'
import Segmented from '@/components/ui/Controls.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { DOMAIN_ICON, plural, announce } from '@/lib/ui'

const props = defineProps({ exerciseId: String })
const router = useRouter()
const single = computed(() => !!props.exerciseId)
const REASONS = [{ value: 'tired', label: 'Устал(а)' }, { value: 'discomfort', label: 'Дискомфорт' }, { value: 'too_hard', label: 'Слишком сложно' }, { value: 'no_time', label: 'Нет времени' }, { value: 'other', label: 'Другое' }]

const loading = ref(true), loadError = ref(''), step = ref('checkin'), items = ref([]), idx = ref(0), library = ref(null)
const sessionId = ref(null), fatigueBefore = ref(null), fatigueAfter = ref(null), discomfort = ref(null), stopReason = ref(null)
const starting = ref(false), completing = ref(false), completeError = ref(''), stopped = ref(false), outcome = ref(null), doneCount = ref(0)
const current = computed(() => items.value[idx.value])
const minutes = computed(() => items.value.reduce((a, i) => a + i.ex.minutes, 0))
const domainLabel = (d) => library.value?.domains[d]?.label ?? d

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const [lib, plan] = await Promise.all([api.get('/exercises'), api.get('/plan')])
    library.value = lib
    const byId = Object.fromEntries(lib.exercises.map((e) => [e.id, e]))
    if (!plan.plan) return router.replace('/welcome')
    if (single.value) {
      const ex = byId[props.exerciseId]
      if (!ex) throw new Error('Упражнение не найдено')
      items.value = [{ ex, level: plan.plan.domains[ex.domain]?.level ?? 1 }]
    } else {
      const t = await api.get('/today')
      const todo = t.today.items.filter((i) => !i.done)
      items.value = (todo.length ? todo : t.today.items).map((i) => ({ ex: byId[i.exerciseId], level: i.level }))
    }
  } catch (e) { loadError.value = e.message } finally { loading.value = false }
}
onMounted(load)

async function begin() {
  starting.value = true
  try { sessionId.value = (await api.post('/sessions', { fatigueBefore: fatigueBefore.value })).sessionId; step.value = 'run' }
  catch (e) { loadError.value = e.message } finally { starting.value = false }
}
const submitResult = (r) => api.post(`/sessions/${sessionId.value}/results`, r).then((x) => { if (r.completed) doneCount.value++; return x })
function next() {
  if (idx.value + 1 >= items.value.length) { step.value = 'checkout'; return }
  idx.value++
  step.value = 'break'
}
function finishEarly() { stopped.value = true; step.value = 'checkout' }
async function complete() {
  completing.value = true; completeError.value = ''
  try {
    const st = stopped.value || doneCount.value < items.value.length ? 'stopped' : 'completed'
    stopped.value = st === 'stopped'
    outcome.value = await api.post(`/sessions/${sessionId.value}/complete`, { status: st, fatigueAfter: fatigueAfter.value, discomfort: discomfort.value, stopReason: stopReason.value })
    step.value = 'done'
    announce('Занятие сохранено')
  } catch (e) { completeError.value = e.message } finally { completing.value = false }
}
</script>

<style scoped>
.sess { min-height: 100dvh; background: var(--paper); }
.sess__bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-2) var(--gutter); min-height: 64px; background: color-mix(in srgb, var(--paper) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
.sess__back { display: inline-flex; align-items: center; gap: 4px; font-weight: 500; text-decoration: none; min-height: 48px; padding: 0 var(--s-3); border-radius: var(--r-pill); }
.sess__back:hover { background: var(--paper-2); }
.sess__progress { display: flex; gap: 6px; flex: 1; max-width: 320px; }
.sess__progress i { flex: 1; height: 6px; border-radius: 3px; background: var(--line-strong); }
.sess__progress i.done { background: var(--teal); }
.sess__progress i.now { background: var(--ink); }
.sess__sos { display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; min-height: 44px; border-radius: var(--r-pill); background: var(--danger-soft); color: var(--danger); font-weight: 600; text-decoration: none; }
.sess__main { padding-top: var(--s-6); padding-bottom: var(--s-8); outline: none; }
.narrow { max-width: 720px; margin-inline: auto; }
.center { text-align: center; justify-items: center; }
.h1 { font-size: var(--t-2xl); }
.h3 { font-size: var(--t-lg); font-weight: 600; }
.note { display: flex; gap: var(--s-2); align-items: flex-start; padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--paper-2); }
.note--warn { background: var(--warn-soft); }
.note--danger { background: var(--danger-soft); color: var(--danger); }
.breath { width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, var(--teal-soft), transparent 70%); border: 2px solid var(--teal); animation: breathe 8s var(--ease-in-out) infinite; }
@keyframes breathe { 50% { transform: scale(1.25); } }
@media (prefers-reduced-motion: reduce) { :root:not([data-motion='full']) .breath { animation: none; } }
:root[data-motion='reduced'] .breath { animation: none; }
.done-mark svg { width: 120px; height: 120px; fill: none; stroke: var(--teal); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.done-mark circle { stroke-dasharray: 340; stroke-dashoffset: 340; animation: draw 1.1s var(--ease-out) forwards; }
.done-mark path { stroke-dasharray: 80; stroke-dashoffset: 80; animation: draw 0.7s var(--ease-out) 0.6s forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.changes { list-style: none; display: grid; gap: var(--s-2); width: 100%; text-align: left; }
.changes li { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-1); }
</style>
