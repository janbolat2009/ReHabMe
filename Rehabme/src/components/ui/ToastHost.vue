<template>
  <div class="toasts no-print" aria-live="polite">
    <TransitionGroup name="rise">
      <div v-for="t in store.items" :key="t.id" class="toast" :class="`toast--${t.tone}`" role="status">
        <Icon :name="t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'" :size="20" />
        <span>{{ t.message }}</span>
        <button class="toast__x" @click="store.dismiss(t.id)" aria-label="Закрыть уведомление"><Icon name="x" :size="18" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToasts } from '@/stores/toasts'
import Icon from './Icon.vue'
const store = useToasts()
</script>

<style scoped>
.toasts { position: fixed; z-index: 900; inset: auto var(--s-4) var(--s-4) auto; display: grid; gap: var(--s-2); max-width: min(420px, calc(100vw - 2rem)); }
@media (max-width: 760px) { .toasts { inset: auto var(--s-3) calc(84px + var(--s-3)) var(--s-3); } }
.toast { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4); border-radius: 18px; background: var(--ink); color: var(--paper); box-shadow: var(--shadow-3); font-weight: 500; }
.toast--error { background: var(--danger); color: #fff; }
.toast--success { background: var(--teal); color: #fff; }
.toast span { flex: 1; }
.toast__x { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: transparent; border: 0; color: inherit; }
.toast__x:hover { background: rgba(255, 255, 255, 0.12); }
</style>
