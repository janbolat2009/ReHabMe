<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)"><p class="label">Кабинет специалиста</p><h1 class="title">Пациенты</h1>
      <p class="lede">Доступ к данным пациента появляется только после того, как он передаст вам одноразовый код. Все обращения записываются в журнал аудита.</p></header>
    <form class="panel claim" @submit.prevent="claim">
      <label class="field" style="flex: 1"><span>Код от пациента</span><input class="input mono" v-model="code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off" @input="code = code.toUpperCase()" /></label>
      <Btn type="submit" icon="plus" :loading="claiming" :disabled="code.length < 9">Добавить пациента</Btn>
    </form>
    <div v-if="loading" class="skeleton" style="height: 240px" />
    <StateBlock v-else-if="!rows.length" title="Пока нет пациентов" text="Попросите пациента открыть «Профиль → Мой специалист» и создать код доступа." icon="users" />
    <table v-else class="tbl">
      <caption class="sr-only">Список пациентов</caption>
      <thead><tr><th>Пациент</th><th>Последнее занятие</th><th>Занятий за 14 дней</th><th>Сигналы</th><th><span class="sr-only">Действия</span></th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td><b>{{ r.display_name || 'Без имени' }}</b><br /><span class="muted small">в списке с {{ fmtDate(r.granted_at) }}</span></td>
          <td>{{ r.last_session ? fmtDate(r.last_session) : '—' }}</td>
          <td class="num">{{ r.sessions_14d }}</td>
          <td><div class="cluster" style="--gap: 6px">
            <span v-if="r.alert === 'discomfort'" class="chip chip-danger"><Icon name="alert" :size="14" />дискомфорт ≥ 7</span>
            <span v-if="r.pending_reviews" class="chip chip-warn"><Icon name="flag" :size="14" />{{ r.pending_reviews }} на проверку</span>
            <span v-if="!r.sessions_14d" class="chip"><Icon name="clock" :size="14" />нет занятий</span>
          </div></td>
          <td><Btn size="sm" trail="arrow" :to="`/clinic/patients/${r.id}`">Открыть</Btn></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { useToasts } from '@/stores/toasts'
import { fmtDate } from '@/lib/ui'
const toasts = useToasts(), router = useRouter()
const rows = ref([]), loading = ref(true), code = ref(''), claiming = ref(false)
const load = async () => { try { rows.value = await api.get('/clinician/patients') } catch (e) { toasts.error(e.message) } finally { loading.value = false } }
async function claim() {
  claiming.value = true
  try { const r = await api.post('/clinician/patients/claim', { code: code.value }); toasts.success('Пациент добавлен'); router.push(`/clinic/patients/${r.patientId}`) }
  catch (e) { toasts.error(e.message) } finally { claiming.value = false }
}
onMounted(load)
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.claim { display: flex; flex-wrap: wrap; gap: var(--s-4); align-items: flex-end; }
.mono { font-family: var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
.small { font-size: var(--t-sm); }
.tbl { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: var(--r-panel); overflow: hidden; box-shadow: var(--shadow-2); }
.tbl th, .tbl td { text-align: left; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); vertical-align: middle; }
.tbl th { color: var(--ink-3); font-weight: 500; font-size: var(--t-sm); }
@media (max-width: 760px) { .tbl thead { display: none; } .tbl tr { display: grid; padding: var(--s-3); border-bottom: 1px solid var(--line); } .tbl td { border: 0; padding: 4px 0; } }
</style>
