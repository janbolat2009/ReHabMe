<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)"><p class="label">Настройки сохраняются автоматически</p><h1 class="title">Центр доступности</h1>
      <p class="lede">Настройте интерфейс под себя. Изменения применяются сразу и сохраняются на всех ваших устройствах.</p></header>
    <div class="layout">
      <div class="stack" style="--gap: var(--s-5)">
        <section class="panel stack" aria-labelledby="see-h"><h2 id="see-h" class="h2"><Icon name="eye" />Зрение</h2>
          <div class="stack" style="--gap: var(--s-2)"><span class="fl" id="fs-l">Размер текста: {{ Math.round(a.fontScale * 100) }}%</span>
            <div class="cluster"><Btn variant="secondary" icon="minus" icon-only label="Уменьшить текст" @click="font(-0.1)" :disabled="a.fontScale <= 1" /><input class="range" type="range" min="1" max="1.6" step="0.05" :value="a.fontScale" aria-labelledby="fs-l" @input="set({ fontScale: Number($event.target.value) })" /><Btn variant="secondary" icon="plus" icon-only label="Увеличить текст" @click="font(0.1)" :disabled="a.fontScale >= 1.6" /></div></div>
          <div class="stack" style="--gap: var(--s-2)"><span class="fl">Контраст</span><Segmented :model-value="a.contrast" label="Контраст" :options="[{ value: 'standard', label: 'Обычный' }, { value: 'high', label: 'Высокий' }]" @update:model-value="set({ contrast: $event })" /></div>
          <div class="stack" style="--gap: var(--s-2)"><span class="fl">Тема</span><Segmented :model-value="a.theme" label="Тема" :options="[{ value: 'light', label: 'Светлая', icon: 'sun' }, { value: 'dark', label: 'Тёмная', icon: 'moon' }]" @update:model-value="set({ theme: $event })" /></div>
          <Toggle :model-value="a.dyslexiaSpacing" label="Увеличенные интервалы в тексте" hint="Больше расстояние между строками, буквами и словами" @update:model-value="set({ dyslexiaSpacing: $event })" />
        </section>
        <section class="panel stack" aria-labelledby="move-h"><h2 id="move-h" class="h2"><Icon name="hand" />Движение и управление</h2>
          <Toggle :model-value="a.largeTargets" label="Крупные кнопки" hint="Все кнопки и поля становятся выше" @update:model-value="set({ largeTargets: $event })" />
          <div class="stack" style="--gap: var(--s-2)"><span class="fl">Управление одной рукой</span><Segmented :model-value="a.oneHanded" label="Управление одной рукой" :options="[{ value: 'off', label: 'Выкл.' }, { value: 'left', label: 'Левой' }, { value: 'right', label: 'Правой' }]" @update:model-value="set({ oneHanded: $event })" /><span class="hint">Главные кнопки переносятся ближе к выбранной руке.</span></div>
          <div class="stack" style="--gap: var(--s-2)"><span class="fl">Анимации</span><Segmented :model-value="a.motion" label="Анимации" :options="[{ value: 'system', label: 'Как в системе' }, { value: 'reduced', label: 'Минимум' }, { value: 'full', label: 'Все' }]" @update:model-value="set({ motion: $event })" /></div>
        </section>
        <section class="panel stack" aria-labelledby="think-h"><h2 id="think-h" class="h2"><Icon name="brain" />Внимание и память</h2>
          <Toggle :model-value="a.disableTimeLimits" label="Отключить ограничения по времени" hint="Где время не является частью задания, можно заниматься в своём темпе" @update:model-value="set({ disableTimeLimits: $event })" />
          <Toggle :model-value="a.readAloud" label="Читать инструкции вслух" :hint="speech.supported ? 'Озвучивание работает в браузере, без отправки данных' : 'Ваш браузер не поддерживает озвучивание'" @update:model-value="set({ readAloud: $event })" />
          <Toggle :model-value="a.confirmActions" label="Подтверждать завершение упражнения" hint="Защита от случайного нажатия" @update:model-value="set({ confirmActions: $event })" />
          <Btn v-if="speech.supported" variant="secondary" icon="sound" @click="speech.speak('Так будут звучать инструкции к упражнениям. Можно прослушать их в любой момент.')">Проверить озвучивание</Btn>
        </section>
        <Btn variant="ghost" icon="refresh" @click="reset">Вернуть настройки по умолчанию</Btn>
      </div>
      <aside class="preview panel" aria-label="Предпросмотр">
        <span class="label">Предпросмотр</span>
        <h3>Найди пары</h3>
        <p class="muted">Откройте карточку, затем вторую. Найдите все пары.</p>
        <div class="pv-grid"><span class="tile-pv" v-for="n in 6" :key="n" :class="{ open: n === 2 }"><Icon v-if="n === 2" name="heart" /></span></div>
        <Btn block icon="play">Начать</Btn>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Toggle from '@/components/ui/Toggle.vue'
import Segmented from '@/components/ui/Controls.vue'
import { useSession, A11Y_DEFAULTS } from '@/stores/session'
import { speech, announce } from '@/lib/ui'

const s = useSession()
const a = computed(() => s.a11y)
const set = (patch) => { s.setA11y(patch); announce('Настройка сохранена') }
const font = (d) => set({ fontScale: Math.min(1.6, Math.max(1, Math.round((a.value.fontScale + d) * 100) / 100)) })
const reset = () => set({ ...A11Y_DEFAULTS })
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.h2 { font-size: var(--t-xl); display: flex; gap: var(--s-2); align-items: center; }
.fl { font-weight: 600; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--s-5); align-items: start; }
.range { flex: 1; min-width: 160px; height: var(--target); accent-color: var(--ink); }
.preview { position: sticky; top: var(--s-5); display: grid; gap: var(--s-3); }
.pv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile-pv { aspect-ratio: 1; border-radius: 14px; background: var(--ink); display: grid; place-items: center; }
.tile-pv.open { background: var(--surface); box-shadow: inset 0 0 0 2px var(--teal); color: var(--teal); }
@media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); } .preview { position: static; } }
</style>
