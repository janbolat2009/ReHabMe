// Session store: identity, profile, consents and accessibility preferences (applied to <html>).
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'

const A11Y_KEY = 'rehabme.a11y'
export const A11Y_DEFAULTS = {
  fontScale: 1.15, contrast: 'standard', theme: 'light', motion: 'system', largeTargets: false, oneHanded: 'off',
  disableTimeLimits: false, readAloud: false, dyslexiaSpacing: false, confirmActions: true,
}

function readLocal() {
  try { return { ...A11Y_DEFAULTS, ...JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') } } catch { return { ...A11Y_DEFAULTS } }
}

export function applyA11y(s) {
  const el = document.documentElement
  el.style.setProperty('--font-scale', String(s.fontScale))
  el.dataset.contrast = s.contrast
  el.dataset.theme = s.theme
  el.dataset.motion = s.motion
  el.dataset.targets = s.largeTargets ? 'large' : 'normal'
  el.dataset.hand = s.oneHanded
  el.dataset.spacing = s.dyslexiaSpacing ? 'wide' : 'normal'
}

export const useSession = defineStore('session', () => {
  const ready = ref(false)
  const authed = ref(false)
  const me = ref(null)
  const a11y = ref(readLocal())
  applyA11y(a11y.value)

  const role = computed(() => me.value?.role ?? null)
  const needsConsent = computed(() => !!me.value && me.value.requiredConsents.some((c) => !(me.value.consents[c]?.granted && me.value.consents[c]?.current)))
  const needsOnboarding = computed(() => !!me.value && me.value.role === 'patient' && (needsConsent.value || !me.value.hasPlan))
  const firstName = computed(() => (me.value?.displayName || '').split(' ')[0] || '')

  let initPromise = null
  function init() {
    initPromise ||= (async () => {
      auth.onChange((u) => {
        authed.value = !!u
        if (!u) me.value = null
      })
      const u = await auth.init()
      authed.value = !!u
      if (u) await refresh().catch(() => {})
      ready.value = true
    })()
    return initPromise
  }

  async function refresh() {
    me.value = await api.get('/me')
    // Server copy wins (follows the patient across devices); theme stays a per-device choice.
    if (me.value?.accessibility) setA11y({ ...me.value.accessibility, theme: a11y.value.theme }, { sync: false })
    return me.value
  }

  function setA11y(patch, { sync = true } = {}) {
    a11y.value = { ...a11y.value, ...patch }
    applyA11y(a11y.value)
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(a11y.value)) } catch { /* storage unavailable */ }
    if (sync && authed.value) {
      const server = { ...a11y.value }
      delete server.theme
      api.put('/me/accessibility', server).catch(() => {})
    }
  }

  async function login(email, password) { await auth.login(email, password); authed.value = true; await refresh() }
  async function register(email, password, name) { await auth.register(email, password, name); authed.value = true; await refresh() }
  async function logout() { await auth.logout(); authed.value = false; me.value = null }

  return { ready, authed, me, role, a11y, needsConsent, needsOnboarding, firstName, init, refresh, setA11y, login, register, logout }
})
