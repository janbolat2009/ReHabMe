<template>
  <PublicChrome>
    <section class="container nf">
      <p class="label">Ошибка 404</p>
      <h1 class="display nf__title">Такой страницы <em class="serif">нет</em>.</h1>
      <p class="lede">Возможно, ссылка устарела. Вернитесь на главную или в личный кабинет.</p>
      <div class="cluster"><Btn to="/" icon="home">На главную</Btn><Btn to="/app" variant="secondary">В кабинет</Btn></div>
    </section>
  </PublicChrome>
</template>
<script setup>
import PublicChrome from '@/components/layout/PublicChrome.vue'
import Btn from '@/components/ui/Btn.vue'
</script>
<style scoped>
.nf { min-height: 80dvh; display: grid; align-content: center; gap: var(--s-5); padding-top: 120px; }
.nf__title { font-size: var(--t-display); }
.nf__title em { color: var(--accent-ink); }
</style>
