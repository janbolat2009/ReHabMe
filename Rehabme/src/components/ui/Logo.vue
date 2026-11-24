<template>
  <span class="logo" :class="{ 'logo--night': night }">
    <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" stroke-width="2" opacity=".25" />
      <path d="M6 24c4 0 5-9 9-9s4 13 8 13 5-17 11-17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="34" cy="11" r="3.2" fill="var(--accent)" />
    </svg>
    <span class="logo__word">ReHab<b>Me</b></span>
  </span>
</template>

<script setup>
defineProps({ night: Boolean })
</script>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 0.55rem; color: var(--ink); font-family: var(--font-display); font-size: 1.15rem; letter-spacing: -0.03em; }
.logo--night { color: var(--on-night); }
.logo__word b { font-weight: 600; }
</style>
