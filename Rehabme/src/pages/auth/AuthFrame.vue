<template>
  <PublicChrome>
    <section class="auth container">
      <div class="auth__aside">
        <p class="label">{{ kicker }}</p>
        <h1 class="display auth__title"><slot name="title" /></h1>
        <p class="lede"><slot name="lede" /></p>
      </div>
      <div class="panel auth__card"><slot /></div>
    </section>
  </PublicChrome>
</template>
<script setup>
import PublicChrome from '@/components/layout/PublicChrome.vue'
defineProps({ kicker: String })
</script>
<style scoped>
.auth { min-height: 100dvh; display: grid; grid-template-columns: 1fr minmax(320px, 480px); gap: clamp(var(--s-6), 6vw, var(--s-9)); align-items: center; padding-top: 120px; padding-bottom: var(--s-8); }
.auth__title { font-size: var(--t-3xl); margin: var(--s-4) 0; }
.auth__title :deep(em) { color: var(--accent-ink); }
.auth__card { display: grid; gap: var(--s-4); }
@media (max-width: 860px) { .auth { grid-template-columns: 1fr; padding-top: 104px; } }
</style>
