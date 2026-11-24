<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)"><p class="label">Персонализация</p><h1 class="title">Моя программа</h1>
      <p class="lede">Уровни меняются по понятным правилам и только в пределах, разрешённых специалистом. Ниже — текущие настройки и история изменений.</p></header>
    <div v-if="loading" class="skeleton" style="height: 320px" />
    <StateBlock v-else-if="error" tone="error" title="Не удалось загрузить программу" :text="error" />
    <template v-else-if="plan">
      <div class="cluster"><span class="chip">Версия {{ plan.version }}</span><span class="chip">{{ plan.sessionsPerWeek }} занятий в неделю</span><span class="chip">до {{ plan.maxSessionMinutes }} мин</span><span class="chip">обновлено {{ fmtDate(plan.createdAt) }} · {{ WHO[plan.createdByRole] }}</span></div>
      <ul class="doms">
        <li v-for="(d, key) in plan.domains" :key="key" :style="{ '--c': `var(--d-${key})` }" :class="{ off: !d.enabled }">
          <span class="dom__name"><Icon :name="DOMAIN_ICON[key]" />{{ d.label }}</span>
          <span class="lvl" :aria-label="`Уровень ${d.level} из 5, разрешено от ${d.minLevel} до ${d.maxLevel}`">
            <i v-for="n in 5" :key="n" :class="{ on: n <= d.level, allowed: n >= d.minLevel && n <= d.maxLevel }" />
          </span>
          <span class="muted small">уровень {{ d.level }} · разрешено {{ d.minLevel }}–{{ d.maxLevel }}</span>
          <span v-if="!d.enabled" class="chip">отключено специалистом</span>
          <span v-if="key === 'motor' && !d.physicalAllowed" class="chip chip-warn">видео-упражнения ждут разрешения врача</span>
        </li>
      </ul>
      <section class="stack"><h2 class="h2">Правила адаптации</h2>
        <ul class="rules"><li><Icon name="arrow" />Повышение уровня: 3 последних результата с точностью от 85%, без сильной усталости (≤ 6) и дискомфорта (≤ 3).</li><li><Icon name="arrow" />Снижение уровня: средняя точность ниже 50%.</li><li><Icon name="shield" />После занятия с сильным дискомфортом (≥ 7) уровень не повышается, предлагается связаться с врачом.</li><li><Icon name="users" />Выход за разрешённые пределы — только после решения специалиста.</li></ul></section>
      <section class="stack"><h2 class="h2">История изменений</h2>
        <ol class="hist"><li v-for="h in history" :key="h.version"><b>v{{ h.version }}</b><span>{{ REASON[h.reason?.split(':')[0]] ?? h.reason ?? '—' }}</span><span class="muted small">{{ WHO[h.created_by_role] }} · {{ fmtDate(h.created_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</span></li></ol></section>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { fmtDate, DOMAIN_ICON } from '@/lib/ui'
const WHO = { system: 'автоматически', clinician: 'специалистом', patient: 'вами' }
const REASON = { initial_screening: 'Первичная самооценка', reassessment: 'Повторная самооценка', adaptive_difficulty: 'Адаптация по результатам', approved_recommendation: 'Специалист одобрил рекомендацию', rejected_recommendation: 'Специалист отменил изменение', demo_seed: 'Демо-программа' }
const plan = ref(null), history = ref([]), loading = ref(true), error = ref('')
onMounted(async () => { try { const r = await api.get('/plan'); plan.value = r.plan; history.value = r.history ?? [] } catch (e) { error.value = e.message } finally { loading.value = false } })
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.h2 { font-size: var(--t-xl); }
.small { font-size: var(--t-sm); }
.doms { list-style: none; display: grid; gap: var(--s-2); }
.doms li { display: grid; grid-template-columns: 220px auto 1fr; gap: var(--s-4); align-items: center; padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); border-left: 6px solid var(--c); }
.doms li.off { opacity: 0.6; }
.dom__name { display: inline-flex; gap: var(--s-2); align-items: center; font-weight: 600; }
.dom__name :deep(svg) { color: var(--c); }
.lvl { display: inline-flex; gap: 5px; }
.lvl i { width: 28px; height: 12px; border-radius: 6px; background: var(--paper-2); }
.lvl i.allowed { background: var(--line-strong); }
.lvl i.on { background: var(--c); }
.rules { list-style: none; display: grid; gap: var(--s-3); }
.rules li { display: flex; gap: var(--s-3); align-items: flex-start; }
.hist { list-style: none; display: grid; gap: var(--s-2); }
.hist li { display: flex; flex-wrap: wrap; gap: var(--s-3); padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
@media (max-width: 760px) { .doms li { grid-template-columns: 1fr; } }
</style>
