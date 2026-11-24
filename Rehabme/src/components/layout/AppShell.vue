<template>
  <div class="shell">
    <aside class="side no-print" aria-label="Основная навигация">
      <RouterLink :to="home" class="side__logo" aria-label="ReHabMe — на главную"><Logo /></RouterLink>
      <nav class="side__nav">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="side__link" :class="{ active: isActive(n) }" :aria-current="isActive(n) ? 'page' : undefined">
          <Icon :name="n.icon" /><span>{{ n.label }}</span>
          <span v-if="n.badge" class="badge num" :aria-label="`${n.badge} новых`">{{ n.badge }}</span>
        </RouterLink>
      </nav>
      <div class="side__foot">
        <RouterLink :to="a11yTo" class="side__link" :class="{ active: route.path === a11yTo }"><Icon name="a11y" /><span>Доступность</span></RouterLink>
        <button class="side__link" @click="logout"><Icon name="logout" /><span>Выйти</span></button>
        <a v-if="isPatient" href="tel:103" class="sos"><Icon name="phone" /><span><b>103</b> Скорая помощь</span></a>
      </div>
    </aside>

    <header class="top no-print">
      <RouterLink :to="home" aria-label="ReHabMe — на главную"><Logo /></RouterLink>
      <div class="cluster" style="--gap: 6px">
        <a v-if="isPatient" href="tel:103" class="top__sos" aria-label="Позвонить в скорую помощь, 103"><Icon name="phone" :size="20" /><b>103</b></a>
        <RouterLink :to="a11yTo" class="top__btn" aria-label="Центр доступности"><Icon name="a11y" /></RouterLink>
        <RouterLink v-if="isPatient" to="/app/notifications" class="top__btn" :aria-label="`Уведомления${unread ? `, новых: ${unread}` : ''}`">
          <Icon name="bell" /><span v-if="unread" class="dot" aria-hidden="true" />
        </RouterLink>
        <button v-if="!isPatient" class="top__btn" aria-label="Выйти" @click="logout"><Icon name="logout" /></button>
      </div>
    </header>

    <main id="main" class="main" tabindex="-1">
      <RouterView v-slot="{ Component }">
        <Transition name="route" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>

    <nav class="bottom no-print" aria-label="Основная навигация">
      <RouterLink v-for="n in mobileNav" :key="n.to" :to="n.to" class="bottom__link" :class="{ active: isActive(n) }" :aria-current="isActive(n) ? 'page' : undefined">
        <Icon :name="n.icon" :size="24" /><span>{{ n.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import Logo from '@/components/ui/Logo.vue'
import { useSession } from '@/stores/session'
import { api } from '@/lib/api'

const s = useSession()
const route = useRoute()
const router = useRouter()
const unread = ref(0)
const isPatient = computed(() => s.role === 'patient')
const home = computed(() => (isPatient.value ? '/app' : '/clinic'))
const a11yTo = computed(() => (isPatient.value ? '/app/accessibility' : '/clinic/accessibility'))

const nav = computed(() => isPatient.value
  ? [
      { to: '/app', label: 'Сегодня', icon: 'home', exact: true },
      { to: '/app/exercises', label: 'Упражнения', icon: 'activity' },
      { to: '/app/progress', label: 'Прогресс', icon: 'chart' },
      { to: '/app/prediction', label: 'Прогноз', icon: 'steps' },
      { to: '/app/plan', label: 'Моя программа', icon: 'layers' },
      { to: '/app/assistant', label: 'Ассистент', icon: 'chat' },
      { to: '/app/notifications', label: 'Уведомления', icon: 'bell', badge: unread.value || null },
      { to: '/app/profile', label: 'Профиль', icon: 'user' },
    ]
  : [{ to: '/clinic', label: 'Пациенты', icon: 'users', exact: true }])

const mobileNav = computed(() => isPatient.value
  ? [
      { to: '/app', label: 'Сегодня', icon: 'home', exact: true },
      { to: '/app/exercises', label: 'Занятия', icon: 'activity' },
      { to: '/app/progress', label: 'Прогресс', icon: 'chart' },
      { to: '/app/assistant', label: 'Ассистент', icon: 'chat' },
      { to: '/app/profile', label: 'Профиль', icon: 'user' },
    ]
  : [{ to: '/clinic', label: 'Пациенты', icon: 'users', exact: true }, { to: '/clinic/accessibility', label: 'Доступность', icon: 'a11y' }])

const isActive = (n) => (n.exact ? route.path === n.to : route.path.startsWith(n.to))

async function loadUnread() {
  if (!isPatient.value) return
  try { unread.value = (await api.get('/notifications')).filter((x) => !x.read_at).length } catch { /* non-critical */ }
}
onMounted(loadUnread)
watch(() => route.path, loadUnread)

async function logout() {
  await s.logout()
  router.push('/login')
}
</script>

<style scoped>
.shell { min-height: 100dvh; display: grid; grid-template-columns: 272px minmax(0, 1fr); }
.side { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: var(--s-5); padding: var(--s-5) var(--s-4); border-right: 1px solid var(--line); background: var(--paper); overflow-y: auto; }
.side__logo { padding: var(--s-2) var(--s-3); text-decoration: none; }
.side__nav, .side__foot { display: grid; gap: 2px; }
.side__foot { margin-top: auto; }
.side__link { display: flex; align-items: center; gap: var(--s-3); min-height: var(--target); padding: 0 var(--s-3); border-radius: 14px; color: var(--ink-2); text-decoration: none; font-weight: 500; border: 0; background: transparent; width: 100%; text-align: left; transition: background var(--d-fast), color var(--d-fast); }
.side__link:hover { background: var(--paper-2); color: var(--ink); text-decoration: none; }
.side__link.active { background: var(--ink); color: var(--paper); }
.badge { margin-left: auto; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px; background: var(--accent); color: #1a0d08; font-size: var(--t-xs); font-weight: 700; display: grid; place-items: center; }
.sos { display: flex; align-items: center; gap: var(--s-3); margin-top: var(--s-3); min-height: var(--target); padding: 0 var(--s-4); border-radius: var(--r-pill); background: var(--danger-soft); color: var(--danger); text-decoration: none; font-weight: 500; }
.sos b { font-size: var(--t-lg); margin-right: 4px; }
.top, .bottom { display: none; }
.main { min-width: 0; padding: clamp(var(--s-5), 4vw, var(--s-7)) var(--gutter) var(--s-8); outline: none; }
.main > :deep(*) { max-width: 1180px; margin-inline: auto; }

@media (max-width: 960px) {
  .shell { grid-template-columns: 1fr; }
  .side { display: none; }
  .top { display: flex; position: sticky; top: 0; z-index: 50; align-items: center; justify-content: space-between; padding: var(--s-2) var(--gutter); min-height: 64px; background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
  .top a { text-decoration: none; }
  .top .cluster { flex-wrap: nowrap; }
  .top :deep(.logo__word) { font-size: 1rem; }
  .top__btn { position: relative; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; color: var(--ink); background: transparent; border: 0; }
  .top__btn:hover { background: var(--paper-2); }
  .top__sos { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px; border-radius: var(--r-pill); background: var(--danger-soft); color: var(--danger); }
  .dot { position: absolute; top: 11px; right: 11px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--paper); }
  .bottom { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; position: fixed; inset: auto 0 0 0; z-index: 50; padding: 6px 6px calc(6px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--line); box-shadow: 0 -8px 24px -18px rgba(0, 0, 0, 0.3); }
  .bottom__link { display: grid; justify-items: center; gap: 2px; padding: 8px 2px; min-height: 60px; border-radius: 14px; color: var(--ink-3); text-decoration: none; font-size: 0.72rem; font-weight: 500; }
  .bottom__link.active { color: var(--ink); background: var(--paper-2); }
  .main { padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
}
</style>
