<template>
  <div class="stack" style="--gap: var(--s-5)">
    <header class="row"><div class="stack" style="--gap: var(--s-2)"><p class="label">Центр уведомлений</p><h1 class="title">Уведомления</h1></div><Btn v-if="items.some((i) => !i.read_at)" variant="secondary" icon="check" @click="readAll">Отметить все прочитанными</Btn></header>
    <div v-if="loading" class="skeleton" style="height: 240px" />
    <StateBlock v-else-if="!items.length" title="Новых уведомлений нет" text="Здесь появятся изменения программы, напоминания о повторной оценке и сообщения от специалиста." icon="bell" />
    <ul v-else class="list">
      <li v-for="n in items" :key="n.id" :class="{ unread: !n.read_at }">
        <Icon :name="ICON[n.kind] ?? 'bell'" />
        <div class="stack" style="--gap: 2px"><b>{{ n.title }}</b><span class="muted">{{ n.body }}</span><span class="small muted">{{ fmtDate(n.created_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</span></div>
        <RouterLink v-if="n.link" :to="n.link" class="chip" @click="read(n)">Открыть</RouterLink>
        <span v-if="!n.read_at" class="sr-only">Не прочитано</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import StateBlock from '@/components/ui/StateBlock.vue'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/ui'
const ICON = { plan: 'layers', safety: 'alert', assessment: 'calendar', care: 'users' }
const items = ref([]), loading = ref(true)
onMounted(async () => { try { items.value = await api.get('/notifications') } finally { loading.value = false } })
async function read(n) { if (!n.read_at) { await api.post(`/notifications/${n.id}/read`).catch(() => {}); n.read_at = new Date().toISOString() } }
async function readAll() { await api.post('/notifications/read-all'); items.value = items.value.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) }
</script>

<style scoped>
.row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--s-3); }
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.small { font-size: var(--t-sm); }
.list { list-style: none; display: grid; gap: var(--s-2); }
.list li { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-4); border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-1); }
.list li > div { flex: 1; }
.list li.unread { box-shadow: inset 4px 0 0 var(--accent), var(--shadow-1); }
.list .chip { text-decoration: none; }
</style>
