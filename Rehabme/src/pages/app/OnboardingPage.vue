<template>
  <div class="onb">
    <header class="onb__bar">
      <Logo />
      <div class="onb__meter" role="progressbar" :aria-valuenow="pos + 1" aria-valuemin="1" :aria-valuemax="flow.length" :aria-label="`Шаг ${pos + 1} из ${flow.length}`"><i :style="{ width: `${((pos + 1) / flow.length) * 100}%` }" /></div>
      <a href="tel:103" class="onb__sos" aria-label="Позвонить в скорую помощь, 103"><Icon name="phone" :size="18" />103</a>
    </header>
    <main id="main" class="container onb__main" tabindex="-1">
      <div v-if="loading" class="skeleton" style="height: 360px" />
      <Transition v-else name="rise" mode="out-in">
        <section :key="flow[pos]" class="stack onb__step" style="--gap: var(--s-5)">
          <!-- Consents -->
          <template v-if="flow[pos] === 'consent'">
            <p class="label">Шаг {{ pos + 1 }} · Согласия</p>
            <h1 class="h">Прежде чем начать</h1>
            <p class="lede">ReHabMe обрабатывает данные о вашем здоровье. Нам важно ваше явное согласие — его можно отозвать в профиле.</p>
            <div class="consents">
              <label v-for="c in CONSENTS" :key="c.type" class="consent" :class="{ on: consents[c.type] }">
                <input type="checkbox" v-model="consents[c.type]" />
                <span class="consent__box" aria-hidden="true"><Icon v-if="consents[c.type]" name="check" :size="18" stroke="3" /></span>
                <span class="stack" style="--gap: 4px"><b>{{ c.title }} <span v-if="c.required" class="chip chip-accent">обязательно</span><span v-else class="chip">по желанию</span></b><span class="muted">{{ c.text }} <RouterLink v-if="c.link" :to="c.link" target="_blank">Прочитать</RouterLink></span></span>
              </label>
            </div>
          </template>

          <!-- Profile -->
          <template v-else-if="flow[pos] === 'about'">
            <p class="label">Шаг {{ pos + 1 }} · О вас</p>
            <h1 class="h">Немного о вас</h1>
            <p class="lede">Все поля необязательны — но помогают точнее подобрать занятия. Можно изменить позже.</p>
            <div class="grid2">
              <label class="field"><span>Год рождения</span><input class="input" type="number" inputmode="numeric" min="1920" :max="new Date().getFullYear() - 16" v-model.number="profile.birthYear" /></label>
              <label class="field"><span>Дата инсульта (примерно)</span><input class="input" type="date" :max="today" v-model="profile.strokeDate" /></label>
            </div>
            <div class="stack" style="--gap: var(--s-2)"><span class="fl">Тип инсульта</span><Segmented v-model="profile.strokeType" label="Тип инсульта" :options="[{ value: 'ischemic', label: 'Ишемический' }, { value: 'hemorrhagic', label: 'Геморрагический' }, { value: 'unknown', label: 'Не знаю' }]" /></div>
            <div class="stack" style="--gap: var(--s-2)"><span class="fl">Какая сторона тела пострадала больше</span><Segmented v-model="profile.affectedSide" label="Пострадавшая сторона" :options="[{ value: 'left', label: 'Левая' }, { value: 'right', label: 'Правая' }, { value: 'both', label: 'Обе' }, { value: 'none', label: 'Нет' }, { value: 'unknown', label: 'Не знаю' }]" /></div>
            <div class="stack" style="--gap: var(--s-2)"><span class="fl">Ведущая рука до инсульта</span><Segmented v-model="profile.dominantHand" label="Ведущая рука" :options="[{ value: 'right', label: 'Правая' }, { value: 'left', label: 'Левая' }, { value: 'unknown', label: 'Не знаю' }]" /></div>
          </template>

          <!-- Goals -->
          <template v-else-if="flow[pos] === 'goals'">
            <p class="label">Шаг {{ pos + 1 }} · Цели</p>
            <h1 class="h">Что для вас важнее всего?</h1>
            <div class="chips" role="group" aria-label="Цели">
              <button v-for="g in GOALS" :key="g" type="button" class="goal" :aria-pressed="goals.includes(g)" @click="toggleGoal(g)"><Icon :name="goals.includes(g) ? 'check' : 'plus'" :size="18" />{{ g }}</button>
            </div>
            <div class="stack" style="--gap: var(--s-2)"><span class="fl">Сколько раз в неделю удобно заниматься?</span><Segmented v-model="profile.sessionsPerWeekGoal" label="Занятий в неделю" :options="[3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))" /></div>
            <div class="stack" style="--gap: var(--s-2)"><span class="fl">Длительность занятия</span><Segmented v-model="profile.sessionMinutesGoal" label="Минут за занятие" :options="[10, 15, 20, 30].map((n) => ({ value: n, label: `${n} мин` }))" /></div>
          </template>

          <!-- Screening question -->
          <template v-else-if="flow[pos].startsWith('q:')">
            <p class="label">Самооценка · вопрос {{ qIndex + 1 }} из {{ instrument.questions.length }}</p>
            <h1 class="h">{{ question.text }}</h1>
            <div class="answers" role="radiogroup" :aria-label="question.text">
              <button v-for="(opt, v) in instrument.scale" :key="v" type="button" role="radio" :aria-checked="answers[question.id] === v" class="answer" :class="{ on: answers[question.id] === v }" @click="answer(v)">
                <span class="answer__dot" aria-hidden="true"><i v-for="n in 4" :key="n" :class="{ f: n <= v }" /></span>{{ opt }}
              </button>
            </div>
            <p class="hint">{{ instrument.disclaimer }}</p>
          </template>

          <!-- Safety -->
          <template v-else-if="flow[pos] === 'safety'">
            <p class="label">Безопасность</p>
            <h1 class="h">Три вопроса о безопасности</h1>
            <div v-for="q in instrument.safety" :key="q.id" class="stack" style="--gap: var(--s-2)">
              <span class="fl">{{ q.text }}</span>
              <Segmented v-model="safety[q.id]" :label="q.text" :options="q.options.map((o) => ({ value: o, label: SAFETY_LABELS[o] }))" />
            </div>
            <p v-if="safety.clearance && safety.clearance !== 'yes'" class="note"><Icon name="info" :size="18" />Упражнения для рук по видео будут недоступны, пока врач не разрешит физическую нагрузку. Остальные занятия — доступны.</p>
          </template>

          <!-- Result -->
          <template v-else-if="flow[pos] === 'result'">
            <p class="label">Готово</p>
            <h1 class="h">Ваша программа на неделю</h1>
            <p class="lede">Стартовые уровни выбраны с запасом: начинать легче полезнее, чем перегрузиться. Программа подстроится по мере занятий.</p>
            <ul class="plan">
              <li v-for="(d, key) in result.plan.domains" :key="key" :style="{ '--c': `var(--d-${key})` }">
                <Icon :name="DOMAIN_ICON[key]" /><b>{{ d.label }}</b>
                <span class="lvl" :aria-label="`Уровень ${d.level} из 5`"><i v-for="n in 5" :key="n" :class="{ on: n <= d.level }" /></span>
                <span v-if="key === 'motor' && !d.physicalAllowed" class="chip chip-warn">видео — после разрешения врача</span>
              </li>
            </ul>
          </template>

          <p v-if="error" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ error }}</p>
          <div class="cluster onb__nav hand-aware">
            <Btn v-if="pos > 0 && flow[pos] !== 'result'" variant="secondary" icon="left" @click="pos--">Назад</Btn>
            <Btn v-if="flow[pos] === 'result'" size="lg" trail="arrow" to="/app">Перейти к плану</Btn>
            <Btn v-else-if="!flow[pos].startsWith('q:')" size="lg" trail="arrow" :loading="busy" :disabled="!canNext" @click="next">{{ flow[pos] === 'safety' ? 'Составить программу' : 'Далее' }}</Btn>
          </div>
        </section>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import Logo from '@/components/ui/Logo.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Segmented from '@/components/ui/Controls.vue'
import { api } from '@/lib/api'
import { useSession } from '@/stores/session'
import { DOMAIN_ICON, announce } from '@/lib/ui'

const props = defineProps({ mode: { type: String, default: 'initial' } })
const s = useSession()
const today = new Date().toISOString().slice(0, 10)
const CONSENTS = [
  { type: 'terms', required: true, title: 'Пользовательское соглашение', text: 'ReHabMe — вспомогательный сервис, а не замена врачу.', link: '/legal/terms' },
  { type: 'privacy', required: true, title: 'Политика конфиденциальности', text: 'Как мы храним и защищаем ваши данные.', link: '/legal/privacy' },
  { type: 'health_data_processing', required: true, title: 'Обработка данных о здоровье', text: 'Результаты упражнений и самочувствие нужны, чтобы строить и адаптировать программу.' },
  { type: 'research_use', required: false, title: 'Участие в исследованиях', text: 'Разрешить использовать обезличенные данные для улучшения методик. Можно отказаться.' },
]
const GOALS = ['Вспоминать слова и имена', 'Читать и не уставать', 'Писать от руки', 'Готовить самостоятельно', 'Пользоваться телефоном', 'Вернуться к работе', 'Чувствовать себя спокойнее']
const SAFETY_LABELS = { yes: 'Да', no: 'Нет', unsure: 'Не уверен(а)', mild: 'Небольшая', strong: 'Сильная' }

const loading = ref(true), busy = ref(false), error = ref(''), pos = ref(0), instrument = ref(null), result = ref(null)
const consents = reactive({ terms: false, privacy: false, health_data_processing: false, research_use: false })
const profile = reactive({ birthYear: null, strokeDate: null, strokeType: null, affectedSide: null, dominantHand: null, sessionsPerWeekGoal: 5, sessionMinutesGoal: 20 })
const goals = ref([]), answers = reactive({}), safety = reactive({ clearance: null, pain: null, seizures: null })

// The step list is fixed once at start: recomputing it after consents are saved would shift indices and skip a step.
const flow = ref(['loading'])
function buildFlow() {
  const qs = instrument.value.questions.map((q) => `q:${q.id}`)
  const pre = props.mode === 'reassess' ? [] : [...(s.needsConsent ? ['consent'] : []), 'about', 'goals']
  flow.value = [...pre, ...qs, 'safety', 'result']
}
const qIndex = computed(() => instrument.value.questions.findIndex((q) => `q:${q.id}` === flow.value[pos.value]))
const question = computed(() => instrument.value.questions[qIndex.value])
const canNext = computed(() => {
  const st = flow.value[pos.value]
  if (st === 'consent') return consents.terms && consents.privacy && consents.health_data_processing
  if (st === 'safety') return safety.clearance && safety.pain && safety.seizures
  return true
})

onMounted(async () => {
  try {
    instrument.value = await api.get('/screening/instrument')
    buildFlow()
    const p = s.me?.profile
    if (p) Object.assign(profile, Object.fromEntries(Object.entries(p).filter(([k, v]) => k in profile && v != null)))
    goals.value = p?.goals ?? []
  } catch (e) { error.value = e.message } finally { loading.value = false }
})

const toggleGoal = (g) => { goals.value = goals.value.includes(g) ? goals.value.filter((x) => x !== g) : goals.value.length < 5 ? [...goals.value, g] : goals.value }
function answer(v) {
  answers[question.value.id] = v
  setTimeout(() => { pos.value++; announce(`Вопрос ${qIndex.value + 1}`) }, 220)
}

async function next() {
  error.value = ''
  const st = flow.value[pos.value]
  busy.value = true
  try {
    if (st === 'consent') {
      await api.post('/me/consents', { consents: Object.entries(consents).map(([type, granted]) => ({ type, granted })) })
      await s.refresh()
    } else if (st === 'goals') {
      await api.put('/me/profile', { ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null && v !== '')), goals: goals.value })
    } else if (st === 'safety') {
      result.value = await api.post('/screening', { items: { ...answers }, safety: { ...safety } })
      await s.refresh()
    }
    pos.value++
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
</script>

<style scoped>
.onb { min-height: 100dvh; }
.onb__bar { display: flex; align-items: center; gap: var(--s-5); padding: var(--s-3) var(--gutter); border-bottom: 1px solid var(--line); }
.onb__meter { flex: 1; height: 8px; border-radius: 4px; background: var(--paper-2); overflow: hidden; }
.onb__meter i { display: block; height: 100%; background: var(--ink); border-radius: 4px; transition: width var(--d-med) var(--ease-out); }
.onb__sos { display: inline-flex; gap: 6px; align-items: center; padding: 0 14px; min-height: 44px; border-radius: var(--r-pill); background: var(--danger-soft); color: var(--danger); font-weight: 600; text-decoration: none; }
.onb__main { max-width: 820px; padding-top: var(--s-7); padding-bottom: var(--s-8); outline: none; }
.h { font-size: var(--t-2xl); }
.fl { font-weight: 600; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.consents { display: grid; gap: var(--s-3); }
.consent { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-4); border-radius: 20px; border: 1.5px solid var(--line-strong); background: var(--surface); cursor: pointer; }
.consent.on { border-color: var(--ink); }
.consent input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.consent:focus-within { outline: 3px solid var(--accent-ink); outline-offset: 3px; }
.consent__box { flex: none; width: 32px; height: 32px; border-radius: 10px; border: 2px solid var(--ink); display: grid; place-items: center; }
.consent.on .consent__box { background: var(--ink); color: var(--paper); }
.chips { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.goal { display: inline-flex; gap: 6px; align-items: center; min-height: var(--target); padding: 0 var(--s-4); border-radius: var(--r-pill); border: 1.5px solid var(--line-strong); background: var(--surface); font-weight: 500; }
.goal[aria-pressed='true'] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.answers { display: grid; gap: var(--s-2); }
.answer { display: flex; align-items: center; gap: var(--s-4); min-height: calc(var(--target) + 12px); padding: 0 var(--s-5); border-radius: 20px; border: 1.5px solid var(--line-strong); background: var(--surface); font-size: var(--t-lg); font-weight: 500; text-align: left; transition: border-color var(--d-fast), background var(--d-fast); }
.answer:hover { border-color: var(--ink); }
.answer.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.answer__dot { display: inline-flex; gap: 3px; }
.answer__dot i { width: 8px; height: 18px; border-radius: 3px; background: var(--line-strong); }
.answer__dot i.f { background: var(--accent); }
.note { display: flex; gap: var(--s-2); padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--warn-soft); }
.plan { list-style: none; display: grid; gap: var(--s-2); }
.plan li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); border-left: 6px solid var(--c); }
.plan li :deep(svg) { color: var(--c); }
.lvl { display: inline-flex; gap: 4px; margin-left: auto; }
.lvl i { width: 20px; height: 10px; border-radius: 5px; background: var(--line-strong); }
.lvl i.on { background: var(--c); }
.onb__nav { margin-top: var(--s-4); }
@media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
</style>
