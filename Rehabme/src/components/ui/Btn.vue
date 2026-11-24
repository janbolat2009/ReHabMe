<template>
  <component
    :is="tag"
    v-bind="linkAttrs"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'is-loading': loading, 'is-success': state === 'success', 'is-error': state === 'error', 'btn--block': block, 'btn--icon': iconOnly }]"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? disabled || loading : undefined"
    :aria-disabled="disabled || loading ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    :aria-label="iconOnly ? label : undefined"
  >
    <span class="btn__icon" v-if="loading" aria-hidden="true"><span class="spinner" /></span>
    <span class="btn__icon" v-else-if="state === 'success'" aria-hidden="true"><Icon name="check" :size="20" stroke="2.4" /></span>
    <span class="btn__icon" v-else-if="state === 'error'" aria-hidden="true"><Icon name="alert" :size="20" stroke="2.2" /></span>
    <span class="btn__icon" v-else-if="icon" aria-hidden="true"><Icon :name="icon" :size="20" stroke="2" /></span>
    <span v-if="!iconOnly" class="btn__label"><slot>{{ label }}</slot></span>
    <span class="btn__icon btn__trail" v-if="trail && !loading" aria-hidden="true"><Icon :name="trail" :size="20" stroke="2" /></span>
    <span v-if="loading" class="sr-only">Загрузка</span>
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from './Icon.vue'

const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary | accent | secondary | ghost | danger | quiet-on-night
  size: { type: String, default: 'md' }, // md | lg | sm
  to: [String, Object],
  href: String,
  type: { type: String, default: 'button' },
  icon: String,
  trail: String,
  label: String,
  loading: Boolean,
  disabled: Boolean,
  block: Boolean,
  iconOnly: Boolean,
  state: { type: String, default: null }, // null | 'success' | 'error' — transient feedback
})
const tag = computed(() => (props.to ? RouterLink : props.href ? 'a' : 'button'))
const linkAttrs = computed(() => (props.to ? { to: props.to } : props.href ? { href: props.href } : {}))
</script>

<style scoped>
.btn {
  --bg: var(--ink); --fg: var(--paper); --bd: transparent;
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.55em;
  min-height: var(--target); padding: 0 1.35em; border-radius: var(--r-pill);
  background: var(--bg); color: var(--fg); border: 1.5px solid var(--bd);
  font-weight: 600; font-size: var(--t-md); line-height: 1.1; text-decoration: none; white-space: nowrap;
  transition: transform var(--d-fast) var(--ease-out), background-color var(--d-fast), box-shadow var(--d-med) var(--ease-out), color var(--d-fast), border-color var(--d-fast);
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.btn:hover:not([aria-disabled='true']) { transform: translateY(-1px); box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--bg) 70%, transparent); text-decoration: none; }
.btn:active:not([aria-disabled='true']) { transform: translateY(0) scale(0.97); box-shadow: none; transition-duration: 60ms; }
.btn:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 3px; }
.btn[aria-disabled='true'] { opacity: 0.45; cursor: not-allowed; }
.btn.is-loading { cursor: progress; opacity: 1; }
.btn--primary:hover:not([aria-disabled='true']) { --bg: color-mix(in srgb, var(--ink) 86%, var(--accent)); }
.btn--accent { --bg: var(--accent); --fg: #1a0d08; }
.btn--accent:hover:not([aria-disabled='true']) { --bg: color-mix(in srgb, var(--accent) 88%, #fff); }
.btn--secondary { --bg: transparent; --fg: var(--ink); --bd: var(--line-strong); }
.btn--secondary:hover:not([aria-disabled='true']) { --bd: var(--ink); --bg: color-mix(in srgb, var(--ink) 5%, transparent); }
.btn--ghost { --bg: transparent; --fg: var(--ink); padding: 0 0.9em; }
.btn--ghost:hover:not([aria-disabled='true']) { --bg: color-mix(in srgb, var(--ink) 7%, transparent); box-shadow: none; }
.btn--danger { --bg: var(--danger); --fg: #fff; }
.btn--night { --bg: transparent; --fg: var(--on-night); --bd: rgba(236, 232, 223, 0.32); }
.btn--night:hover:not([aria-disabled='true']) { --bd: var(--on-night); --bg: rgba(236, 232, 223, 0.08); }
.btn.is-success { --bg: var(--teal); --fg: #fff; --bd: transparent; }
.btn.is-error { --bg: var(--danger); --fg: #fff; --bd: transparent; animation: nudge 0.36s var(--ease-out) 1; }
.btn--lg { min-height: calc(var(--target) + 8px); padding: 0 1.7em; font-size: var(--t-lg); }
.btn--sm { min-height: 44px; padding: 0 1em; font-size: var(--t-sm); }
.btn--block { width: 100%; }
.btn--icon { padding: 0; width: var(--target); }
.btn__icon { display: inline-flex; }
.btn__trail { transition: transform var(--d-fast) var(--ease-out); }
.btn:hover .btn__trail { transform: translateX(3px); }
.spinner { width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid currentColor; border-right-color: transparent; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes nudge { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@media (prefers-reduced-motion: reduce) { :root:not([data-motion='full']) .btn.is-error { animation: none; } :root:not([data-motion='full']) .spinner { animation-duration: 2.4s; } }
:root[data-motion='reduced'] .btn.is-error { animation: none; }
</style>
