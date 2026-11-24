import { defineStore } from 'pinia'
import { ref } from 'vue'
import { announce } from '@/lib/ui'

let id = 0
export const useToasts = defineStore('toasts', () => {
  const items = ref([])
  function push(message, { tone = 'info', timeout = 5000 } = {}) {
    const t = { id: ++id, message, tone }
    items.value.push(t)
    announce(message)
    if (timeout) setTimeout(() => dismiss(t.id), timeout)
  }
  const dismiss = (tid) => { items.value = items.value.filter((t) => t.id !== tid) }
  return { items, push, dismiss, success: (m) => push(m, { tone: 'success' }), error: (m) => push(m, { tone: 'error', timeout: 8000 }) }
})
