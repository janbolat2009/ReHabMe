<template>
  <label class="toggle">
    <span class="toggle__text">
      <span class="toggle__title">{{ label }}</span>
      <span v-if="hint" class="hint">{{ hint }}</span>
    </span>
    <button type="button" role="switch" class="toggle__sw" :aria-checked="modelValue" @click="$emit('update:modelValue', !modelValue)">
      <span class="toggle__knob"><Icon :name="modelValue ? 'check' : 'x'" :size="14" stroke="2.6" /></span>
      <span class="sr-only">{{ label }}</span>
    </button>
  </label>
</template>

<script setup>
import Icon from './Icon.vue'
defineProps({ modelValue: Boolean, label: String, hint: String })
defineEmits(['update:modelValue'])
</script>

<style scoped>
.toggle { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-3) 0; cursor: pointer; }
.toggle__text { display: grid; gap: 2px; }
.toggle__title { font-weight: 500; }
.toggle__sw { position: relative; flex: none; width: 64px; height: 38px; border-radius: var(--r-pill); border: 1.5px solid var(--line-strong); background: var(--paper-2); transition: background var(--d-fast), border-color var(--d-fast); }
.toggle__knob { position: absolute; top: 3px; left: 3px; width: 29px; height: 29px; border-radius: 50%; background: var(--surface); color: var(--ink-3); display: grid; place-items: center; box-shadow: var(--shadow-1); transition: transform var(--d-med) var(--ease-out); }
.toggle__sw[aria-checked='true'] { background: var(--teal); border-color: var(--teal); }
.toggle__sw[aria-checked='true'] .toggle__knob { transform: translateX(26px); color: var(--teal); }
</style>
