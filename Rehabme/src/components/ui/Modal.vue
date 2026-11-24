<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="scrim" @mousedown.self="!persistent && close()">
        <div ref="dialog" class="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descId" @keydown="onKey" tabindex="-1">
          <header class="dialog__head">
            <h2 :id="titleId">{{ title }}</h2>
            <button v-if="!persistent" class="dialog__x" @click="close" aria-label="Закрыть окно"><Icon name="x" /></button>
          </header>
          <div :id="descId" class="dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="dialog__actions hand-aware"><slot name="actions" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, useId } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({ open: Boolean, title: String, persistent: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const titleId = useId()
const descId = useId()
let returnFocus = null

const close = () => emit('close')
const focusables = () => [...dialog.value.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]

function onKey(e) {
  if (e.key === 'Escape' && !props.persistent) { e.stopPropagation(); close() }
  if (e.key !== 'Tab') return
  const f = focusables()
  if (!f.length) return
  const first = f[0], last = f[f.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

watch(() => props.open, async (v) => {
  if (v) {
    returnFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    await nextTick()
    ;(focusables().find((el) => !el.classList.contains('dialog__x')) ?? dialog.value)?.focus()
  } else {
    document.body.style.overflow = ''
    returnFocus?.focus?.()
  }
})
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 800; background: rgba(14, 23, 22, 0.5); backdrop-filter: blur(3px); display: grid; place-items: center; padding: var(--s-4); }
.dialog { width: min(560px, 100%); max-height: calc(100dvh - 2rem); overflow: auto; background: var(--surface); color: var(--ink); border-radius: var(--r-panel); box-shadow: var(--shadow-3); padding: clamp(var(--s-4), 3vw, var(--s-6)); display: grid; gap: var(--s-4); }
.dialog__head { display: flex; align-items: start; justify-content: space-between; gap: var(--s-4); }
.dialog__head h2 { font-size: var(--t-xl); }
.dialog__x { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 50%; border: 0; background: var(--paper-2); }
.dialog__body { color: var(--ink-2); }
.dialog__actions { display: flex; flex-wrap: wrap; gap: var(--s-3); justify-content: flex-end; }
.modal-enter-active, .modal-leave-active { transition: opacity var(--d-med) var(--ease-out); }
.modal-enter-active .dialog, .modal-leave-active .dialog { transition: transform var(--d-med) var(--ease-out); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .dialog { transform: translateY(16px) scale(0.98); }
@media (max-width: 600px) { .scrim { align-items: end; padding: 0; } .dialog { border-radius: var(--r-panel) var(--r-panel) 0 0; } }
</style>
