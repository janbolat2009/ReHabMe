<template>
  <div class="stack" style="--gap: var(--s-6)">
    <header class="stack" style="--gap: var(--s-2)"><p class="label">{{ s.me?.email }}</p><h1 class="title">Профиль</h1></header>
    <nav class="cluster toc" aria-label="Разделы профиля"><a href="#about">О себе</a><a href="#care">Мой специалист</a><a href="#meds">Лекарства</a><a href="#privacy">Данные и согласия</a></nav>

    <!-- About -->
    <section id="about" class="panel stack" aria-labelledby="about-h">
      <h2 id="about-h" class="h2">О себе и цели</h2>
      <div class="grid2">
        <label class="field"><span>Имя</span><input class="input" v-model.trim="form.displayName" maxlength="80" /></label>
        <label class="field"><span>Год рождения</span><input class="input" type="number" v-model.number="form.birthYear" min="1920" :max="new Date().getFullYear() - 16" /></label>
        <label class="field"><span>Дата инсульта</span><input class="input" type="date" v-model="form.strokeDate" :max="today" /></label>
        <label class="field"><span>Тип инсульта</span><select class="select" v-model="form.strokeType"><option :value="null">Не указано</option><option value="ischemic">Ишемический</option><option value="hemorrhagic">Геморрагический</option><option value="unknown">Не знаю</option></select></label>
      </div>
      <div class="stack" style="--gap: var(--s-2)"><span class="fl">Занятий в неделю (цель)</span><Segmented v-model="form.sessionsPerWeekGoal" label="Занятий в неделю" :options="[2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))" /></div>
      <div class="cluster hand-aware"><Btn :loading="saving" :state="saveState" icon="check" @click="saveProfile">Сохранить</Btn></div>
    </section>

    <!-- Care team -->
    <section id="care" class="panel stack" aria-labelledby="care-h">
      <h2 id="care-h" class="h2">Мой специалист</h2>
      <p class="muted">Чтобы врач или реабилитолог видел вашу динамику, создайте одноразовый код и передайте ему. Код действует 24 часа. Доступ можно отозвать в любой момент.</p>
      <div v-if="code" class="code" role="status"><span class="label">Код доступа</span><b class="num">{{ code.code }}</b><span class="muted small">действует до {{ fmtDate(code.expiresAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }}</span></div>
      <div class="cluster"><Btn icon="link" variant="secondary" :loading="coding" @click="makeCode">Создать код</Btn></div>
      <ul v-if="team.length" class="list">
        <li v-for="c in team" :key="c.id"><Icon name="user" /><span class="stack" style="--gap: 2px; flex: 1"><b>{{ c.clinician_name || 'Специалист' }}</b><span class="muted small">{{ c.status === 'active' ? `доступ с ${fmtDate(c.granted_at)}` : `доступ отозван ${fmtDate(c.revoked_at)}` }}</span></span>
          <Btn v-if="c.status === 'active'" size="sm" variant="secondary" @click="revoke(c)">Отозвать доступ</Btn></li>
      </ul>
    </section>

    <!-- Medications -->
    <section id="meds" class="panel stack" aria-labelledby="meds-h">
      <h2 id="meds-h" class="h2">Расписание лекарств</h2>
      <p class="muted small">Это ваш личный список-напоминание. Назначения и дозировки определяет только врач.</p>
      <ul v-if="meds.length" class="list">
        <li v-for="m in meds" :key="m.id">
          <button class="check" role="checkbox" :aria-checked="m.takenToday" :aria-label="`${m.name}, ${m.time}: ${m.takenToday ? 'принято сегодня' : 'не отмечено'}`" @click="toggleMed(m)"><Icon v-if="m.takenToday" name="check" :size="18" stroke="3" /></button>
          <span class="stack" style="--gap: 2px; flex: 1"><b :class="{ done: m.takenToday }">{{ m.name }}</b><span class="muted small num">{{ m.time }}</span></span>
          <Btn size="sm" variant="ghost" icon="trash" icon-only :label="`Удалить ${m.name}`" @click="removeMed(m)" />
        </li>
      </ul>
      <form class="cluster" @submit.prevent="addMed"><input class="input" style="flex: 2; min-width: 180px" v-model.trim="med.name" placeholder="Название" aria-label="Название лекарства" maxlength="80" /><input class="input" style="flex: 1; min-width: 120px" type="time" v-model="med.time" aria-label="Время приёма" /><Btn type="submit" icon="plus" :disabled="!med.name || !med.time">Добавить</Btn></form>
    </section>

    <!-- Privacy -->
    <section id="privacy" class="panel stack" aria-labelledby="priv-h">
      <h2 id="priv-h" class="h2">Данные и согласия</h2>
      <Toggle :model-value="!!consents.research_use?.granted" label="Использование обезличенных данных в исследованиях" hint="По желанию. Можно отозвать в любой момент." @update:model-value="setConsent('research_use', $event)" />
      <Toggle :model-value="!!consents.ai_assistant_external?.granted" label="Расширенный режим ассистента" hint="Ваши вопросы (без контактных данных) будут обрабатываться внешней языковой моделью. По умолчанию выключено." @update:model-value="setConsent('ai_assistant_external', $event)" />
      <hr />
      <div class="cluster"><Btn variant="secondary" icon="download" :loading="exporting" @click="exportData">Скачать мои данные</Btn><Btn variant="ghost" icon="logout" @click="logout">Выйти</Btn></div>
      <details class="danger"><summary>Удалить учётную запись</summary>
        <p class="muted">Будут удалены программа, результаты, оценки, переписка с ассистентом и доступы специалистов. Действие необратимо.</p>
        <label class="field"><span>Для подтверждения введите слово УДАЛИТЬ</span><input class="input" v-model.trim="confirmWord" autocomplete="off" /></label>
        <Btn variant="danger" icon="trash" :disabled="confirmWord !== 'УДАЛИТЬ'" :loading="deleting" @click="deleteAccount">Удалить навсегда</Btn>
      </details>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import Toggle from '@/components/ui/Toggle.vue'
import Segmented from '@/components/ui/Controls.vue'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'
import { useSession } from '@/stores/session'
import { useToasts } from '@/stores/toasts'
import { fmtDate } from '@/lib/ui'

const s = useSession(), toasts = useToasts(), router = useRouter()
const today = new Date().toISOString().slice(0, 10)
const p = s.me?.profile ?? {}
const form = reactive({ displayName: s.me?.displayName ?? '', birthYear: p.birthYear ?? null, strokeDate: p.strokeDate ?? null, strokeType: p.strokeType ?? null, sessionsPerWeekGoal: p.sessionsPerWeekGoal ?? 5 })
const saving = ref(false), saveState = ref(null), code = ref(null), coding = ref(false), team = ref([]), meds = ref([]), med = reactive({ name: '', time: '09:00' })
const exporting = ref(false), deleting = ref(false), confirmWord = ref('')
const consents = computed(() => s.me?.consents ?? {})

onMounted(async () => {
  const [t, m] = await Promise.allSettled([api.get('/me/care-team'), api.get('/medications')])
  team.value = t.value ?? []; meds.value = m.value ?? []
})
async function saveProfile() {
  saving.value = true
  try {
    await api.put('/me/profile', Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== null)))
    await s.refresh(); saveState.value = 'success'; toasts.success('Профиль сохранён')
  } catch (e) { saveState.value = 'error'; toasts.error(e.message) } finally { saving.value = false; setTimeout(() => (saveState.value = null), 1500) }
}
async function makeCode() { coding.value = true; try { code.value = await api.post('/me/share-codes') } catch (e) { toasts.error(e.message) } finally { coding.value = false } }
async function revoke(c) { try { await api.del(`/me/care-team/${c.id}`); team.value = await api.get('/me/care-team'); toasts.success('Доступ отозван') } catch (e) { toasts.error(e.message) } }
async function addMed() { try { await api.post('/medications', { name: med.name, time: med.time }); med.name = ''; meds.value = await api.get('/medications') } catch (e) { toasts.error(e.message) } }
async function toggleMed(m) { try { await api.post(`/medications/${m.id}/taken`, { taken: !m.takenToday }); m.takenToday = !m.takenToday } catch (e) { toasts.error(e.message) } }
async function removeMed(m) { try { await api.del(`/medications/${m.id}`); meds.value = meds.value.filter((x) => x.id !== m.id) } catch (e) { toasts.error(e.message) } }
async function setConsent(type, granted) { try { await api.post('/me/consents', { consents: [{ type, granted }] }); await s.refresh(); toasts.success(granted ? 'Согласие сохранено' : 'Согласие отозвано') } catch (e) { toasts.error(e.message) } }
async function exportData() {
  exporting.value = true
  try {
    const res = await api.raw('/me/export')
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: 'rehabme-data-export.json' })
    a.click(); URL.revokeObjectURL(url)
  } catch (e) { toasts.error(e.message) } finally { exporting.value = false }
}
async function logout() { await s.logout(); router.push('/') }
async function deleteAccount() {
  deleting.value = true
  try {
    await api.del('/me', { confirm: 'УДАЛИТЬ' })
    if (auth.provider === 'firebase') toasts.push('Данные удалены. Учётную запись входа можно удалить в настройках аккаунта.')
    await s.logout(); router.push('/')
  } catch (e) { toasts.error(e.message) } finally { deleting.value = false }
}
</script>

<style scoped>
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-3xl); letter-spacing: -0.035em; }
.h2 { font-size: var(--t-xl); }
.fl { font-weight: 600; }
.small { font-size: var(--t-sm); }
.toc a { padding: 6px 14px; border-radius: var(--r-pill); background: var(--paper-2); text-decoration: none; font-weight: 500; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
section { scroll-margin-top: 90px; }
.code { display: grid; gap: 4px; padding: var(--s-4); border-radius: 18px; background: var(--accent-soft); width: fit-content; }
.code b { font-family: var(--font-mono); font-size: var(--t-2xl); letter-spacing: 0.1em; }
.list { list-style: none; display: grid; gap: var(--s-2); }
.list li { display: flex; gap: var(--s-3); align-items: center; padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
.check { flex: none; width: 40px; height: 40px; border-radius: 12px; border: 2px solid var(--ink); background: var(--surface); display: grid; place-items: center; }
.check[aria-checked='true'] { background: var(--teal); border-color: var(--teal); color: #fff; }
.done { text-decoration: line-through; color: var(--ink-3); }
.danger { padding: var(--s-4); border-radius: 18px; background: var(--danger-soft); display: grid; gap: var(--s-3); }
.danger summary { cursor: pointer; font-weight: 600; color: var(--danger); }
@media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
</style>
