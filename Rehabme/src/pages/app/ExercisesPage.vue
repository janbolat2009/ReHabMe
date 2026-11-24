<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)">
      <p class="label">Библиотека · версия {{ lib?.version }}</p>
      <h1 class="title">Упражнения</h1>
      <p class="lede">Все упражнения входят в вашу программу. Здесь можно повторить любое отдельно — на вашем текущем уровне.</p>
    </header>
    <Segmented v-model="filter" label="Направление" :options="[{ value: 'all', label: 'Все' }, ...Object.entries(lib?.domains ?? {}).map(([k, d]) => ({ value: k, label: d.label }))]" />
    <div v-if="loading" class="grid-auto"><div v-for="n in 6" :key="n" class="skeleton" style="height: 220px" /></div>
    <StateBlock v-else-if="error" tone="error" title="Не удалось загрузить упражнения" :text="error"><template #actions><Btn icon="refresh" @click="load">Повторить</Btn></template></StateBlock>
    <TransitionGroup v-else tag="div" name="list" class="grid-auto" style="--min: 280px">
      <article v-for="(e, i) in shown" :key="e.id" class="ex" :style="{ '--c': `var(--d-${e.domain})`, '--i': i }">
        <div class="ex__top"><span class="ex__dom"><Icon :name="DOMAIN_ICON[e.domain]" :size="18" />{{ lib.domains[e.domain].label }}</span><span class="chip num">ур. {{ levelOf(e) }}</span></div>
        <h2 class="ex__title">{{ e.title }}</h2>
        <p class="muted">{{ e.summary }}</p>
        <div class="cluster ex__meta"><span class="chip"><Icon name="clock" :size="14" />{{ e.minutes }} мин</span><span v-if="!e.timeLimitAdjustable" class="chip">время — часть задания</span><span v-if="e.fineMotor" class="chip">точные движения</span></div>
        <div class="ex__foot">
          <Btn v-if="available(e)" size="sm" icon="play" :to="`/app/practice/${e.id}`">Выполнить</Btn>
          <span v-else class="chip chip-warn"><Icon name="lock" :size="14" />{{ lockReason(e) }}</span>
          <span class="small muted" :title="'Статус проверки: ' + e.approval.status">{{ e.approval.status === 'approved' ? 'Одобрено специалистом' : 'Ожидает клинической проверки' }}</span>
        </div>
      </article>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Segmented from '@/components/ui/Controls.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { DOMAIN_ICON } from '@/lib/ui'

const lib = ref(null), plan = ref(null), loading = ref(true), error = ref(''), filter = ref('all')
const shown = computed(() => (lib.value?.exercises ?? []).filter((e) => filter.value === 'all' || e.domain === filter.value))
const levelOf = (e) => plan.value?.domains[e.domain]?.level ?? 1
const available = (e) => { const d = plan.value?.domains[e.domain]; return d?.enabled && !plan.value.excludedExercises.includes(e.id) && !(e.physical && !d.physicalAllowed) && !(e.id === 'attention-gonogo' && d.excludeFastPaced) }
const lockReason = (e) => (e.physical ? 'после разрешения врача' : !plan.value?.domains[e.domain]?.enabled ? 'направление отключено специалистом' : 'недоступно в вашей программе')
async function load() {
  loading.value = true; error.value = ''
  try { const [l, p] = await Promise.all([api.get('/exercises'), api.get('/plan')]); lib.value = l; plan.value = p.plan } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.ex { display: grid; gap: var(--s-3); align-content: start; padding: var(--s-5); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); border-top: 5px solid var(--c); transition: transform var(--d-med) var(--ease-out), box-shadow var(--d-med) var(--ease-out); }
.ex:hover { transform: translateY(-3px); box-shadow: var(--shadow-3); }
.ex__top { display: flex; justify-content: space-between; align-items: center; }
.ex__dom { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; color: var(--ink-2); }
.ex__dom :deep(svg) { color: var(--c); }
.ex__title { font-size: var(--t-xl); }
.ex__meta { --gap: 6px; }
.ex__foot { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; justify-content: space-between; margin-top: var(--s-2); }
.small { font-size: var(--t-xs); }
</style>
