<!-- Segmented control (radio group semantics) — used for periods, levels, settings. -->
<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <button
      v-for="(o, i) in options" :key="o.value" type="button" role="radio"
      :aria-checked="modelValue === o.value" :tabindex="modelValue === o.value || (!hasValue && i === 0) ? 0 : -1"
      class="seg__opt" :class="{ on: modelValue === o.value }"
      @click="$emit('update:modelValue', o.value)" @keydown="onKey($event, i)"
    >
      <Icon v-if="o.icon" :name="o.icon" :size="18" />
      <span>{{ o.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
const props = defineProps({ modelValue: [String, Number, Boolean], options: Array, label: String })
const emit = defineEmits(['update:modelValue'])
const hasValue = computed(() => props.options.some((o) => o.value === props.modelValue))
function onKey(e, i) {
  const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  if (!dir) return
  e.preventDefault()
  const next = (i + dir + props.options.length) % props.options.length
  emit('update:modelValue', props.options[next].value)
  e.currentTarget.parentElement.children[next].focus()
}
</script>

<style scoped>
.seg { display: inline-flex; flex-wrap: wrap; max-width: 100%; gap: 4px; padding: 4px; background: var(--paper-2); border-radius: var(--r-pill); border: 1px solid var(--line); }
.seg__opt { display: inline-flex; align-items: center; text-align: center; flex: 1 1 auto; gap: 0.4em; min-height: calc(var(--target) - 10px); padding: 0 1.05em; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--ink-2); font-weight: 500; transition: background var(--d-fast), color var(--d-fast); }
.seg__opt:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
.seg__opt.on { background: var(--ink); color: var(--paper); box-shadow: var(--shadow-1); }
</style>
