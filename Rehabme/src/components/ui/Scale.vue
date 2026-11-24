<!-- 0–10 (or custom) rating as large, labelled radio buttons: no slider fine-motor demands. -->
<template>
  <fieldset class="scale">
    <legend class="scale__legend">{{ label }}</legend>
    <div class="scale__row" role="radiogroup" :aria-label="label">
      <button
        v-for="v in values" :key="v" type="button" role="radio" :aria-checked="modelValue === v"
        :aria-label="accName(v)" class="scale__opt num" :class="{ on: modelValue === v }"
        @click="$emit('update:modelValue', v)"
      >{{ v }}</button>
    </div>
    <div class="scale__ends"><span>{{ minLabel }}</span><span>{{ maxLabel }}</span></div>
  </fieldset>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ modelValue: Number, label: String, min: { type: Number, default: 0 }, max: { type: Number, default: 10 }, minLabel: String, maxLabel: String })
defineEmits(['update:modelValue'])
const values = computed(() => Array.from({ length: props.max - props.min + 1 }, (_, i) => props.min + i))
const describe = (v) => (v === props.min ? props.minLabel : v === props.max ? props.maxLabel : '')
const accName = (v) => { const d = describe(v); return d?.startsWith(String(v)) ? d : [v, d].filter(Boolean).join(' — ') }
</script>

<style scoped>
.scale { border: 0; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.scale__legend { font-weight: 600; font-size: var(--t-lg); margin-bottom: var(--s-3); padding: 0; }
.scale__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); gap: 6px; }
.scale__opt { min-height: var(--target); border-radius: 14px; border: 1.5px solid var(--line-strong); background: var(--surface); font-weight: 600; font-size: var(--t-lg); transition: background var(--d-fast), transform var(--d-fast) var(--ease-out); }
.scale__opt:hover { border-color: var(--ink); }
.scale__opt.on { background: var(--ink); color: var(--paper); border-color: var(--ink); transform: translateY(-2px); }
.scale__ends { display: flex; justify-content: space-between; color: var(--ink-3); font-size: var(--t-sm); }
</style>
