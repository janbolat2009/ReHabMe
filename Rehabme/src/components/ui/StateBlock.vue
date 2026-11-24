<!-- Empty / error / unavailable states: always say what happened and what the person can do next. -->
<template>
  <div class="state" :class="`state--${tone}`" :role="tone === 'error' ? 'alert' : undefined">
    <div class="state__icon"><Icon :name="icon || (tone === 'error' ? 'alert' : tone === 'unavailable' ? 'lock' : 'info')" :size="26" /></div>
    <div class="stack" style="--gap: var(--s-2)">
      <h3>{{ title }}</h3>
      <p v-if="text" class="muted">{{ text }}</p>
      <slot />
      <div v-if="$slots.actions" class="cluster" style="margin-top: var(--s-2)"><slot name="actions" /></div>
    </div>
  </div>
</template>

<script setup>
import Icon from './Icon.vue'
defineProps({ title: String, text: String, tone: { type: String, default: 'empty' }, icon: String })
</script>

<style scoped>
.state { display: flex; gap: var(--s-4); align-items: flex-start; padding: var(--s-5); border-radius: var(--r-panel); background: var(--paper-2); border: 1px dashed var(--line-strong); }
.state--error { background: var(--danger-soft); border: 1px solid transparent; }
.state--unavailable { background: var(--warn-soft); border: 1px solid transparent; }
.state__icon { flex: none; display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: var(--surface); color: var(--ink-2); }
.state h3 { font-size: var(--t-lg); }
</style>
