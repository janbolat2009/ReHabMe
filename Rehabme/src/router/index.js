import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/stores/session'

const routes = [
  // Public
  { path: '/', name: 'landing', component: () => import('@/pages/public/LandingPage.vue'), meta: { title: 'Цифровая реабилитация после инсульта', public: true } },
  { path: '/legal/:doc(privacy|terms|disclaimer)', name: 'legal', component: () => import('@/pages/public/LegalPage.vue'), props: true, meta: { title: 'Документы', public: true } },
  { path: '/login', name: 'login', component: () => import('@/pages/auth/LoginPage.vue'), meta: { title: 'Вход', public: true, guestOnly: true } },
  { path: '/register', name: 'register', component: () => import('@/pages/auth/RegisterPage.vue'), meta: { title: 'Регистрация', public: true, guestOnly: true } },
  { path: '/reset-password', name: 'reset', component: () => import('@/pages/auth/ResetPasswordPage.vue'), meta: { title: 'Восстановление пароля', public: true } },

  // Patient onboarding & focused flows (no navigation chrome → fewer distractions)
  { path: '/welcome', name: 'onboarding', component: () => import('@/pages/app/OnboardingPage.vue'), meta: { title: 'Знакомство', role: 'patient' } },
  { path: '/app/assessment', name: 'assessment', component: () => import('@/pages/app/OnboardingPage.vue'), props: { mode: 'reassess' }, meta: { title: 'Повторная оценка', role: 'patient' } },
  { path: '/app/session', name: 'session', component: () => import('@/pages/app/SessionPage.vue'), meta: { title: 'Занятие', role: 'patient' } },
  { path: '/app/practice/:exerciseId', name: 'practice', component: () => import('@/pages/app/SessionPage.vue'), props: true, meta: { title: 'Упражнение', role: 'patient' } },

  // Patient app
  {
    path: '/app',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { role: 'patient' },
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/app/DashboardPage.vue'), meta: { title: 'Сегодня' } },
      { path: 'exercises', name: 'exercises', component: () => import('@/pages/app/ExercisesPage.vue'), meta: { title: 'Упражнения' } },
      { path: 'progress', name: 'progress', component: () => import('@/pages/app/ProgressPage.vue'), meta: { title: 'Прогресс' } },
      { path: 'prediction', name: 'prediction', component: () => import('@/pages/app/PredictionPage.vue'), meta: { title: 'Прогноз' } },
      { path: 'plan', name: 'plan', component: () => import('@/pages/app/PlanPage.vue'), meta: { title: 'Моя программа' } },
      { path: 'assistant', name: 'assistant', component: () => import('@/pages/app/AssistantPage.vue'), meta: { title: 'Ассистент' } },
      { path: 'notifications', name: 'notifications', component: () => import('@/pages/app/NotificationsPage.vue'), meta: { title: 'Уведомления' } },
      { path: 'accessibility', name: 'accessibility', component: () => import('@/pages/app/AccessibilityPage.vue'), meta: { title: 'Центр доступности' } },
      { path: 'profile', name: 'profile', component: () => import('@/pages/app/ProfilePage.vue'), meta: { title: 'Профиль' } },
    ],
  },

  // Clinician app
  {
    path: '/clinic',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { role: 'clinician' },
    children: [
      { path: '', name: 'clinic', component: () => import('@/pages/clinician/PatientsPage.vue'), meta: { title: 'Пациенты' } },
      { path: 'patients/:id', name: 'clinic-patient', component: () => import('@/pages/clinician/PatientPage.vue'), props: true, meta: { title: 'Карта пациента' } },
      { path: 'accessibility', name: 'clinic-accessibility', component: () => import('@/pages/app/AccessibilityPage.vue'), meta: { title: 'Центр доступности' } },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue'), meta: { title: 'Страница не найдена', public: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 80 }
    return { top: 0 }
  },
})

export const homeFor = (s) => (s.role === 'clinician' ? '/clinic' : s.needsOnboarding ? '/welcome' : '/app')

router.beforeEach(async (to) => {
  const s = useSession()
  await s.init()
  if (to.meta.public) {
    if (to.meta.guestOnly && s.authed && s.me) return homeFor(s)
    return true
  }
  if (!s.authed) return { name: 'login', query: { next: to.fullPath } }
  if (!s.me) await s.refresh().catch(() => null)
  if (!s.me) return { name: 'login' }
  const needRole = [...to.matched].reverse().find((r) => r.meta.role)?.meta.role
  if (needRole && needRole !== s.role) return homeFor(s)
  if (s.role === 'patient' && s.needsOnboarding && to.name !== 'onboarding') return { name: 'onboarding' }
  if (to.name === 'onboarding' && s.role === 'patient' && !s.needsOnboarding) return '/app'
  return true
})

// Accessible route changes: update the title and move focus to the main heading.
router.afterEach((to, from) => {
  document.title = `${to.meta.title ?? 'ReHabMe'} · ReHabMe`
  // Initial load: leave focus at the document start so the skip link is the first Tab stop.
  if (!from.matched.length || to.path === from.path) return
  setTimeout(() => {
    const h = document.querySelector('main h1')
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }) }
  }, 80)
})

export default router
