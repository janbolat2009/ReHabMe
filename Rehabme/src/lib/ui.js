// Small UI utilities: scroll-reveal directive, read-aloud, formatting, screen-reader announcements.
import { ref } from 'vue'

export const prefersReducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced' ||
  (document.documentElement.dataset.motion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

let observer = null
export const vReveal = {
  mounted(el, binding) {
    el.setAttribute('data-reveal', '')
    if (binding.value != null) el.style.setProperty('--i', binding.value)
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) { el.classList.add('is-in'); return }
    observer ||= new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); observer.unobserve(e.target) }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    observer.observe(el)
  },
  unmounted(el) { observer?.unobserve(el) },
}

// Read-aloud for instructions (Web Speech API; local in the browser, no data leaves the device).
export const speech = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  speak(text) {
    if (!this.supported) return false
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'ru-RU'
    u.rate = 0.9
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ru'))
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
    return true
  },
  stop() { if (this.supported) window.speechSynthesis.cancel() },
}

export const announcement = ref('')
export function announce(msg) {
  announcement.value = ''
  requestAnimationFrame(() => { announcement.value = msg })
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
export const fmtDate = (d, opts = { day: 'numeric', month: 'long' }) => (d ? new Date(d).toLocaleDateString('ru-RU', opts) : '—')
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '')
export const pct = (v, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
export const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
}
export const DOMAIN_ICON = { memory: 'brain', attention: 'eye', cognition: 'puzzle', motor: 'hand', speech: 'mic', wellbeing: 'heart' }
