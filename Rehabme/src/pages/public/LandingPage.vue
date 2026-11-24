<template>
  <PublicChrome night>
    <!-- 01 · Hero -->
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__copy">
          <p class="label hero__kicker">01 / Цифровая реабилитация после инсульта</p>
          <h1 class="display hero__title">
            <span class="mask is-in" style="--i:0"><span>Реабилитация,</span></span>
            <span class="mask is-in" style="--i:1"><span>которая <em class="serif">подстраивается</em></span></span>
            <span class="mask is-in" style="--i:2"><span>под вас.</span></span>
          </h1>
          <p class="hero__lede" v-reveal="3">ReHabMe — персональный план упражнений на память, внимание, мышление и моторику, наблюдение за динамикой и связь со специалистом. Дома, в своём темпе.</p>
          <div class="cluster hero__cta" v-reveal="4">
            <Btn to="/register" variant="accent" size="lg" trail="arrow">Начать восстановление</Btn>
            <Btn href="#platform" variant="night" size="lg">Посмотреть платформу</Btn>
          </div>
          <RouterLink to="#clinicians" class="hero__pro" v-reveal="5">Для специалистов и реабилитационных центров <Icon name="right" :size="18" /></RouterLink>
        </div>
        <div class="hero__viz" v-reveal="2"><HeroFan /></div>
      </div>
      <div class="container hero__strip" aria-label="Ключевые принципы">
        <span><Icon name="shield" :size="18" /> Данные под вашим контролем</span>
        <span><Icon name="a11y" :size="18" /> Доступность по WCAG 2.2 AA</span>
        <span><Icon name="users" :size="18" /> Решения — вместе со специалистом</span>
        <span><Icon name="book" :size="18" /> Честно о том, что доказано</span>
      </div>
    </section>

    <!-- 02 · Problem -->
    <section class="sec" aria-labelledby="problem-h">
      <div class="container split">
        <div>
          <p class="label">02 / Проблема</p>
          <h2 id="problem-h" class="sec__title" v-reveal>Восстановление продолжается <em class="serif">после выписки</em> — а поддержка часто заканчивается.</h2>
        </div>
        <ol class="problems">
          <li v-for="(p, i) in problems" :key="p.t" v-reveal="i"><span class="num problems__n">{{ String(i + 1).padStart(2, '0') }}</span><div><h3>{{ p.t }}</h3><p class="muted">{{ p.d }}</p></div></li>
        </ol>
      </div>
    </section>

    <!-- 03 · Solution -->
    <section class="sec sec--tint" id="platform" aria-labelledby="solution-h">
      <div class="container">
        <p class="label">03 / Решение</p>
        <h2 id="solution-h" class="sec__title" v-reveal>Одна платформа: <em class="serif">план, практика, наблюдение</em> и специалист рядом.</h2>
        <div class="solution">
          <article v-for="(s, i) in solutions" :key="s.t" class="solution__item" v-reveal="i">
            <Icon :name="s.icon" :size="28" />
            <h3>{{ s.t }}</h3>
            <p class="muted">{{ s.d }}</p>
            <span class="label">Решает: {{ s.solves }}</span>
          </article>
        </div>
      </div>
    </section>

    <!-- 04 · How it works -->
    <section class="sec" id="how" aria-labelledby="how-h">
      <div class="container">
        <p class="label">04 / Как это работает</p>
        <h2 id="how-h" class="sec__title" v-reveal>Пять шагов, которые <em class="serif">повторяются</em> каждую неделю.</h2>
        <div class="how">
          <div class="how__tabs" role="tablist" aria-label="Шаги">
            <button v-for="(st, i) in steps" :key="st.t" role="tab" :id="`step-${i}`" :aria-selected="step === i" :aria-controls="`steppanel-${i}`" :tabindex="step === i ? 0 : -1"
              class="how__tab" :class="{ on: step === i }" @click="step = i" @keydown="tabKey($event, i)">
              <span class="num how__n">{{ i + 1 }}</span><span>{{ st.t }}</span>
            </button>
          </div>
          <Transition name="fade" mode="out-in">
            <div :key="step" class="how__panel panel" role="tabpanel" :id="`steppanel-${step}`" :aria-labelledby="`step-${step}`">
              <div class="stack">
                <p class="label">Шаг {{ step + 1 }} из 5</p>
                <h3 class="how__h">{{ steps[step].t }}</h3>
                <p class="lede">{{ steps[step].d }}</p>
              </div>
              <div class="mock" aria-hidden="true">
                <template v-if="step === 0"><div class="mock__q">Насколько трудно сосредоточиться на одном деле?</div><div class="mock__opts"><span>Совсем не</span><span class="on">Немного</span><span>Умеренно</span><span>Очень</span></div></template>
                <template v-else-if="step === 1"><div v-for="d in planPreview" :key="d.l" class="mock__row"><span>{{ d.l }}</span><span class="mock__lvl"><i v-for="n in 5" :key="n" :class="{ on: n <= d.v }" /></span></div></template>
                <template v-else-if="step === 2"><div class="mock__cards"><span v-for="n in 6" :key="n" :class="{ open: n === 2 || n === 5 }">{{ n === 2 || n === 5 ? '◆' : '' }}</span></div><div class="mock__bar"><i style="width: 62%" /></div></template>
                <template v-else-if="step === 3"><svg viewBox="0 0 260 90"><path d="M5 75 L45 66 L85 70 L125 50 L165 44 L205 30 L255 22" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round" /></svg><div class="mock__legend"><span>Точность</span><span>за 30 дней</span></div></template>
                <template v-else><div class="mock__row"><span>Память</span><span class="chip chip-teal">2 → 3</span></div><div class="mock__row"><span>Моторика</span><span class="chip chip-warn">ждёт врача</span></div><p class="mock__why">Почему: 3 занятия подряд с точностью ≥ 85%</p></template>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <!-- 05 · Technology -->
    <section class="sec sec--night" id="technology" aria-labelledby="tech-h">
      <div class="container">
        <p class="label label--night">05 / Технологии</p>
        <h2 id="tech-h" class="sec__title" v-reveal>Технологии помогают. <em class="serif">Решения</em> остаются за людьми.</h2>
        <div class="tech">
          <article v-for="(t, i) in tech" :key="t.t" class="tech__item" v-reveal="i">
            <div class="cluster" style="justify-content: space-between"><Icon :name="t.icon" :size="26" /><span class="tech__status" :class="t.tone">{{ t.status }}</span></div>
            <h3>{{ t.t }}</h3>
            <p>{{ t.d }}</p>
          </article>
        </div>
        <div class="evidence" v-reveal>
          <div><p class="label label--night">Что уже работает</p><ul><li v-for="x in works" :key="x"><Icon name="check" :size="18" />{{ x }}</li></ul></div>
          <div><p class="label label--night">Что требует клинической проверки</p><ul><li v-for="x in pending" :key="x"><Icon name="clock" :size="18" />{{ x }}</li></ul></div>
        </div>
      </div>
    </section>

    <!-- 06 · Modules -->
    <section class="sec" aria-labelledby="mod-h">
      <div class="container">
        <p class="label">06 / Направления</p>
        <h2 id="mod-h" class="sec__title" v-reveal>Пять направлений — <em class="serif">одна программа</em>.</h2>
        <div class="modules">
          <div class="modules__list" role="tablist" aria-label="Направления реабилитации">
            <button v-for="(m, i) in modules" :key="m.t" role="tab" :aria-selected="mod === i" :tabindex="mod === i ? 0 : -1" class="modules__btn" :class="{ on: mod === i }" @click="mod = i" @keydown="modKey($event, i)" :style="{ '--c': m.c }">
              <Icon :name="m.icon" /><span>{{ m.t }}</span>
            </button>
          </div>
          <Transition name="fade" mode="out-in">
            <div :key="mod" class="modules__panel" role="tabpanel" :style="{ '--c': modules[mod].c }">
              <h3>{{ modules[mod].t }}</h3>
              <p class="lede">{{ modules[mod].d }}</p>
              <ul class="modules__ex"><li v-for="e in modules[mod].ex" :key="e"><Icon name="right" :size="18" />{{ e }}</li></ul>
            </div>
          </Transition>
        </div>
      </div>
    </section>

    <!-- 07 · Analytics -->
    <section class="sec sec--tint" aria-labelledby="an-h">
      <div class="container split split--wide">
        <div class="stack">
          <p class="label">07 / Аналитика</p>
          <h2 id="an-h" class="sec__title" v-reveal>Видно, <em class="serif">что меняется</em> — и что это значит.</h2>
          <p class="lede">Регулярность, результаты упражнений и клинические шкалы показаны отдельно. Мы не сводим всё в один «процент восстановления» — такого показателя не существует.</p>
          <div><Segmented v-model="period" :options="[{ value: 30, label: '30 дней' }, { value: 90, label: '90 дней' }]" label="Период демо-графика" /></div>
        </div>
        <div class="panel" v-reveal>
          <div class="cluster" style="justify-content: space-between; margin-bottom: var(--s-3)"><strong>Точность в упражнениях</strong><span class="chip chip-warn">Демо-данные</span></div>
          <LineChart :series="demoSeries" :height="240" :y-min="0.4" :y-max="1" :y-format="(v) => Math.round(v * 100) + '%'" :x-format="(x) => `д.${x}`" x-label="День" aria-label="Демонстрационный график точности в упражнениях по направлениям" />
        </div>
      </div>
    </section>

    <!-- 08 · Clinicians -->
    <section class="sec" id="clinicians" aria-labelledby="pro-h">
      <div class="container split">
        <div class="stack">
          <p class="label">08 / Для специалистов</p>
          <h2 id="pro-h" class="sec__title" v-reveal>Удалённое наблюдение <em class="serif">без лишней</em> работы.</h2>
          <p class="lede">Пациент сам даёт доступ одноразовым кодом и может отозвать его в любой момент. Все обращения к данным записываются в журнал аудита.</p>
          <div class="cluster"><Btn href="mailto:support@rehabme.com?subject=ReHabMe%20для%20специалистов" icon="chat">Подключить центр</Btn></div>
        </div>
        <ul class="pro">
          <li v-for="(f, i) in pro" :key="f" v-reveal="i"><Icon name="check" :size="20" />{{ f }}</li>
        </ul>
      </div>
    </section>

    <!-- 09 · Final CTA -->
    <section class="cta">
      <div class="container cta__in">
        <h2 class="display cta__title" v-reveal>Начните <em class="serif">сегодня</em>.</h2>
        <p class="cta__lede" v-reveal="1">Первичная самооценка займёт около трёх минут. Затем вы получите программу на неделю.</p>
        <div class="cluster" v-reveal="2"><Btn to="/register" variant="accent" size="lg" trail="arrow">Создать аккаунт</Btn><Btn to="/login" variant="night" size="lg">У меня есть аккаунт</Btn></div>
        <p class="cta__note">ReHabMe не заменяет лечение и не предназначен для неотложной помощи. Перед началом занятий проконсультируйтесь с врачом.</p>
      </div>
    </section>
  </PublicChrome>
</template>

<script setup>
import { ref, computed } from 'vue'
import PublicChrome from '@/components/layout/PublicChrome.vue'
import HeroFan from '@/components/charts/HeroFan.vue'
import LineChart from '@/components/charts/LineChart.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Segmented from '@/components/ui/Controls.vue'

const problems = [
  { t: 'Ограниченный доступ к специалистам', d: 'Реабилитологов не хватает, а ездить на занятия далеко и тяжело — особенно в первые месяцы.' },
  { t: 'Регулярная реабилитация стоит дорого', d: 'Длительные курсы с личными занятиями доступны не всем семьям.' },
  { t: 'Нет персональной домашней программы', d: 'Выписка заканчивается общими рекомендациями, которые трудно применить самостоятельно.' },
  { t: 'Прогресс сложно отследить', d: 'Без измерений и пациенту, и врачу трудно понять, что меняется и что стоит скорректировать.' },
  { t: 'Трудно заниматься регулярно', d: 'Усталость, настроение и отсутствие обратной связи мешают сохранить привычку.' },
]
const solutions = [
  { icon: 'layers', t: 'Персональный план', d: 'Программа строится по результатам самооценки и ограничениям, заданным специалистом.', solves: 'нет домашней программы' },
  { icon: 'activity', t: 'Интерактивные упражнения', d: 'Память, внимание, мышление, моторика, речь — короткие задания с понятными инструкциями.', solves: 'регулярность' },
  { icon: 'chart', t: 'Наблюдение за динамикой', d: 'Точность, время реакции и регулярность — отдельно, без непрозрачных «баллов восстановления».', solves: 'сложно отследить прогресс' },
  { icon: 'users', t: 'Специалист на связи', d: 'Врач видит динамику удалённо и подтверждает существенные изменения программы.', solves: 'доступ к специалистам' },
]
const steps = [
  { t: 'Первичная оценка', d: 'Несколько вопросов о памяти, внимании, моторике и самочувствии, плюс вопросы о безопасности. Около трёх минут.' },
  { t: 'Персональный план', d: 'Система выбирает упражнения из одобренной библиотеки и консервативный стартовый уровень. Физические упражнения — только после разрешения врача.' },
  { t: 'Ежедневные занятия', d: '15–25 минут в день. Пауза и завершение доступны всегда. Ограничения по времени можно отключить.' },
  { t: 'Отслеживание динамики', d: 'Результаты сохраняются автоматически. Вы видите регулярность и результаты упражнений по каждому направлению.' },
  { t: 'Адаптация программы', d: 'Если задания даются легко — сложность растёт, если трудно — снижается. В пределах, разрешённых специалистом, и с объяснением причин.' },
]
const planPreview = [{ l: 'Память', v: 2 }, { l: 'Внимание', v: 3 }, { l: 'Моторика', v: 1 }, { l: 'Мышление', v: 2 }]
const tech = [
  { icon: 'layers', t: 'Движок персонализации', d: 'Прозрачные клинические правила и аналитика выполнения. Каждое изменение плана сопровождается причиной и может быть отменено специалистом.', status: 'Работает', tone: 'ok' },
  { icon: 'steps', t: 'Модель прогнозирования', d: 'Машинное обучение оценивает возможные сроки достижения целей по клиническим шкалам — диапазоном, с неопределённостью. Если данных мало или случай нетипичный, модель не делает прогноз.', status: 'Исследование', tone: 'research' },
  { icon: 'chat', t: 'Ассистент', d: 'Объясняет упражнения и показатели по проверенным материалам со ссылками на источники. Не ставит диагнозы и не назначает лечение; при тревожных симптомах направляет к скорой помощи.', status: 'Работает', tone: 'ok' },
]
const works = ['Персональный план и адаптация сложности', 'Сохранение и анализ результатов упражнений', 'Доступ специалиста по согласию пациента', 'Распознавание тревожных симптомов в чате']
const pending = ['Точность прогноза на реальных клинических данных', 'Влияние упражнений на восстановление функций', 'Утверждение библиотеки упражнений реабилитологами', 'Регистрация как медицинского изделия (если потребуется)']
const modules = [
  { t: 'Моторика', icon: 'hand', c: 'var(--d-motor)', d: 'Точность и плавность движений руки, координация «глаз — рука».', ex: ['Точные касания — цели разного размера', 'Следуй за кругом — плавное ведение', 'Упражнения для рук по видео (после разрешения врача)'] },
  { t: 'Мышление', icon: 'puzzle', c: 'var(--d-cognition)', d: 'Логика, классификация и решение задач.', ex: ['Что дальше? — закономерности в числовых рядах', 'Разложи по группам — классификация без перетаскивания'] },
  { t: 'Память', icon: 'brain', c: 'var(--d-memory)', d: 'Зрительная, словесная и кратковременная память.', ex: ['Найди пары — зрительная память', 'Повтори последовательность', 'Запомни слова — узнавание'] },
  { t: 'Внимание', icon: 'eye', c: 'var(--d-attention)', d: 'Зрительный поиск, концентрация, скорость реакции.', ex: ['Найди все цели — зрительный поиск', 'Реагируй на зелёный — контроль импульсов'] },
  { t: 'Координация', icon: 'target', c: 'var(--d-motor)', d: 'Согласование движения и зрения в спокойном темпе.', ex: ['Ведение указателя за медленной целью', 'Управление клавиатурой — без мыши'] },
]
const pro = ['Список пациентов с сигналами: дискомфорт, пропуски, рекомендации на проверку', 'Внесение клинических шкал: Бартел, Фугл-Мейер, MoCA, mRS, NIHSS', 'Настройка программы: направления, уровни, допустимые пределы', 'Проверка, утверждение или отклонение рекомендаций системы', 'Просмотр прогноза с объяснением факторов и отметкой «оспорено»', 'Печатный отчёт для консультации']

const step = ref(0)
const mod = ref(0)
const period = ref(30)
function roving(e, i, len, set) {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  if (!d) return
  e.preventDefault()
  const n = (i + d + len) % len
  set(n)
  e.currentTarget.parentElement.children[n].focus()
}
const tabKey = (e, i) => roving(e, i, steps.length, (n) => (step.value = n))
const modKey = (e, i) => roving(e, i, modules.length, (n) => (mod.value = n))

// Deterministic demo data (labelled "Демо-данные" in the UI).
const demoSeries = computed(() => {
  const n = period.value
  const mk = (base, gain, phase) => Array.from({ length: Math.ceil(n / 3) }, (_, i) => ({ x: i * 3 + 1, y: Math.min(0.97, base + gain * (1 - Math.exp(-(i * 3) / (n / 2.2))) + Math.sin(i * 1.3 + phase) * 0.025) }))
  return [
    { id: 'm', label: 'Память', color: 'var(--d-memory)', points: mk(0.56, 0.24, 0), dots: false },
    { id: 'a', label: 'Внимание', color: 'var(--d-attention)', points: mk(0.62, 0.18, 1), dots: false },
    { id: 'mo', label: 'Моторика', color: 'var(--d-motor)', points: mk(0.48, 0.2, 2), dots: false },
  ]
})
</script>

<style scoped>
.hero { background: radial-gradient(1200px 600px at 85% 10%, rgba(228, 87, 46, 0.14), transparent 60%), var(--night); color: var(--on-night); padding: calc(76px + var(--s-8)) 0 var(--s-6); overflow: hidden; }
.hero__grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: clamp(var(--s-6), 5vw, var(--s-8)); align-items: center; }
.hero__kicker { color: var(--accent); }
/* Unbounded is wide (~0.72em/char): sized so the longest word ("Реабилитация,") always fits its masked line. */
.hero__title { font-size: clamp(2.1rem, 0.4rem + 4.3vw, 4.6rem); margin: var(--s-5) 0; }
.hero__title em { color: var(--accent); font-size: 1.08em; }
.hero__lede { font-size: var(--t-lg); color: var(--on-night-2); max-width: 52ch; }
.hero__cta { margin-top: var(--s-6); }
.hero__pro { display: inline-flex; align-items: center; gap: 6px; margin-top: var(--s-5); color: var(--on-night); font-weight: 500; }
.hero__strip { display: flex; flex-wrap: wrap; gap: var(--s-3) var(--s-6); margin-top: var(--s-8); padding-top: var(--s-5); border-top: 1px solid rgba(236, 232, 223, 0.12); color: var(--on-night-2); font-size: var(--t-sm); }
.hero__strip span { display: inline-flex; gap: 8px; align-items: center; }

.sec { padding: clamp(var(--s-8), 9vw, var(--s-9)) 0; }
.sec--tint { background: var(--paper-2); }
.sec--night { background: var(--night); color: var(--on-night); }
.label--night { color: var(--on-night-2); }
.sec__title { hyphens: auto; overflow-wrap: break-word; font-family: var(--font-display); font-weight: 400; letter-spacing: -0.035em; font-size: var(--t-3xl); line-height: 1.04; margin: var(--s-4) 0 var(--s-6); max-width: 22ch; }
.sec__title em { color: var(--accent-ink); font-size: 1.1em; }
.sec--night .sec__title em { color: var(--accent); }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(var(--s-6), 6vw, var(--s-9)); align-items: start; }
.split--wide { grid-template-columns: 0.8fr 1.2fr; align-items: center; }

.problems { list-style: none; display: grid; }
.problems li { display: grid; grid-template-columns: 56px 1fr; gap: var(--s-4); padding: var(--s-5) 0; border-top: 1px solid var(--line); }
.problems li:last-child { border-bottom: 1px solid var(--line); }
.problems__n { font-family: var(--font-mono); color: var(--accent-ink); padding-top: 4px; }
.problems h3 { font-size: var(--t-lg); margin-bottom: var(--s-1); }

.solution { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-6); }
.solution__item { display: grid; gap: var(--s-3); align-content: start; padding-top: var(--s-5); border-top: 2px solid var(--ink); }
.solution__item h3 { font-size: var(--t-lg); }
.solution__item .label { color: var(--accent-ink); }

.how { display: grid; grid-template-columns: 320px 1fr; gap: var(--s-6); }
.how > *, .modules > *, .split > *, .hero__grid > * { min-width: 0; }
.how__tabs { display: grid; gap: var(--s-2); align-content: start; }
.how__tab { display: flex; align-items: center; gap: var(--s-3); min-height: 64px; padding: 0 var(--s-4); border-radius: 18px; border: 1.5px solid var(--line); background: transparent; text-align: left; font-weight: 500; transition: background var(--d-fast), border-color var(--d-fast); }
.how__tab:hover { border-color: var(--ink-3); }
.how__tab.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.how__n { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--paper-2); color: var(--ink); font-family: var(--font-mono); flex: none; }
.how__tab.on .how__n { background: var(--accent); color: #1a0d08; }
.how__panel { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-6); align-items: center; min-height: 320px; }
.how__h { font-size: var(--t-2xl); }
.mock { background: var(--paper); border-radius: 20px; padding: var(--s-5); display: grid; gap: var(--s-3); box-shadow: inset 0 0 0 1px var(--line); }
.mock__q { font-weight: 600; }
.mock__opts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.mock__opts span { padding: 12px; border-radius: 12px; border: 1.5px solid var(--line-strong); text-align: center; font-size: var(--t-sm); }
.mock__opts .on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.mock__row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.mock__lvl { display: flex; gap: 4px; }
.mock__lvl i { width: 18px; height: 8px; border-radius: 4px; background: var(--line-strong); }
.mock__lvl i.on { background: var(--teal); }
.mock__cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mock__cards span { aspect-ratio: 1; border-radius: 12px; background: var(--ink); display: grid; place-items: center; color: var(--accent); font-size: 1.4rem; }
.mock__cards span.open { background: var(--surface); box-shadow: inset 0 0 0 2px var(--accent); }
.mock__bar { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
.mock__bar i { display: block; height: 100%; background: var(--teal); }
.mock__legend { display: flex; justify-content: space-between; font-size: var(--t-sm); color: var(--ink-3); }
.mock__why { font-size: var(--t-sm); color: var(--ink-3); }

.tech { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-5); }
.tech__item { display: grid; gap: var(--s-3); align-content: start; padding: var(--s-5); border-radius: var(--r-panel); background: var(--night-2); box-shadow: inset 0 0 0 1px rgba(236, 232, 223, 0.08); }
.tech__item p { color: var(--on-night-2); }
.tech__status { font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.08em; padding: 4px 10px; border-radius: var(--r-pill); }
.tech__status.ok { background: rgba(95, 194, 174, 0.16); color: #7fe0cc; }
.tech__status.research { background: rgba(240, 192, 96, 0.16); color: #f0c060; }
.evidence { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-6); margin-top: var(--s-7); padding-top: var(--s-6); border-top: 1px solid rgba(236, 232, 223, 0.12); }
.evidence ul { list-style: none; display: grid; gap: var(--s-3); margin-top: var(--s-3); }
.evidence li { display: flex; gap: var(--s-3); align-items: flex-start; }

.modules { display: grid; grid-template-columns: 340px 1fr; gap: var(--s-6); }
.modules__list { display: grid; gap: var(--s-2); align-content: start; }
.modules__btn { display: flex; align-items: center; gap: var(--s-3); min-height: 64px; padding: 0 var(--s-4); border-radius: 18px; border: 1.5px solid var(--line); background: transparent; text-align: left; font-weight: 600; font-size: var(--t-lg); }
.modules__btn :deep(svg) { color: var(--c); }
.modules__btn.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 9%, transparent); }
.modules__panel { padding: var(--s-6); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); border-top: 6px solid var(--c); display: grid; gap: var(--s-4); align-content: start; }
.modules__panel h3 { font-size: var(--t-2xl); }
.modules__ex { list-style: none; display: grid; gap: var(--s-3); }
.modules__ex li { display: flex; gap: var(--s-2); align-items: center; padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }

.pro { list-style: none; display: grid; }
.pro li { display: flex; gap: var(--s-3); padding: var(--s-4) 0; border-bottom: 1px solid var(--line); align-items: flex-start; }
.pro li :deep(svg) { color: var(--teal); flex: none; margin-top: 3px; }

.cta { background: var(--night); color: var(--on-night); padding: clamp(var(--s-8), 10vw, 9rem) 0; }
.cta__in { display: grid; gap: var(--s-5); justify-items: start; }
.cta__title { font-size: var(--t-display); }
.cta__title em { color: var(--accent); }
.cta__lede { font-size: var(--t-lg); color: var(--on-night-2); max-width: 48ch; }
.cta__note { color: var(--on-night-2); font-size: var(--t-sm); max-width: 60ch; margin-top: var(--s-5); }

@media (max-width: 1080px) {
  .hero__grid, .split, .split--wide, .how, .modules, .evidence { grid-template-columns: 1fr; }
  .solution { grid-template-columns: repeat(2, 1fr); }
  .tech { grid-template-columns: 1fr; }
  .how__panel { grid-template-columns: 1fr; }
  .how__tabs { grid-auto-flow: column; grid-auto-columns: minmax(180px, 1fr); overflow-x: auto; padding-bottom: 4px; }
}
@media (max-width: 600px) { .solution { grid-template-columns: 1fr; } .hero { padding-top: calc(76px + var(--s-6)); } }
</style>
