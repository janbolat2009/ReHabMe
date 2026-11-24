<!-- Public header + footer wrapper used by landing, legal and auth pages. -->
<template>
  <div class="pub" :class="{ 'pub--night': night }">
    <header class="pub__head" :class="{ scrolled }">
      <div class="container pub__bar">
        <RouterLink to="/" aria-label="ReHabMe — главная" class="pub__logo"><Logo :night="night && !scrolled" /></RouterLink>
        <nav class="pub__nav" aria-label="Разделы сайта">
          <RouterLink to="/#platform">Платформа</RouterLink>
          <RouterLink to="/#how">Как это работает</RouterLink>
          <RouterLink to="/#technology">Технологии</RouterLink>
          <RouterLink to="/#clinicians">Специалистам</RouterLink>
        </nav>
        <div class="cluster" style="--gap: var(--s-2)">
          <template v-if="s.authed && s.me">
            <Btn :to="s.role === 'clinician' ? '/clinic' : '/app'" size="sm" trail="arrow">Мой кабинет</Btn>
          </template>
          <template v-else>
            <Btn to="/login" size="sm" :variant="night && !scrolled ? 'night' : 'secondary'">Войти</Btn>
            <Btn to="/register" size="sm" variant="accent" class="hide-sm">Начать</Btn>
          </template>
        </div>
      </div>
    </header>
    <main id="main" tabindex="-1"><slot /></main>
    <footer class="foot">
      <div class="container foot__grid">
        <div class="stack" style="--gap: var(--s-4)">
          <Logo night />
          <p class="foot__muted">Цифровая платформа реабилитации после инсульта. Исследовательская версия: не является медицинским изделием и не заменяет консультацию врача.</p>
          <p class="foot__sos"><Icon name="phone" :size="18" /> Внезапная слабость, асимметрия лица или нарушение речи — звоните <a href="tel:103">103</a> или <a href="tel:112">112</a>.</p>
        </div>
        <div class="stack" style="--gap: var(--s-2)">
          <span class="label foot__label">Документы</span>
          <RouterLink to="/legal/privacy">Политика конфиденциальности</RouterLink>
          <RouterLink to="/legal/terms">Пользовательское соглашение</RouterLink>
          <RouterLink to="/legal/disclaimer">Медицинское предупреждение</RouterLink>
        </div>
        <div class="stack" style="--gap: var(--s-2)">
          <span class="label foot__label">Связаться</span>
          <a href="mailto:support@rehabme.com">support@rehabme.com</a>
          <a href="https://t.me/rehabme" rel="noopener noreferrer" target="_blank">Telegram: @rehabme</a>
        </div>
      </div>
      <div class="container foot__base"><span>© {{ year }} ReHabMe</span><span class="label foot__label">Recovery, reimagined.</span></div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Logo from '@/components/ui/Logo.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import { useSession } from '@/stores/session'

defineProps({ night: Boolean })
const s = useSession()
const year = new Date().getFullYear()
const scrolled = ref(false)
const onScroll = () => { scrolled.value = window.scrollY > 40 }
onMounted(() => { window.addEventListener('scroll', onScroll, { passive: true }); onScroll() })
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.pub__head { position: fixed; inset: 0 0 auto 0; z-index: 60; transition: background var(--d-med), box-shadow var(--d-med), color var(--d-med); }
.pub--night .pub__head:not(.scrolled) { color: var(--on-night); }
.pub__head.scrolled { background: color-mix(in srgb, var(--paper) 90%, transparent); backdrop-filter: blur(12px); box-shadow: 0 1px 0 var(--line); color: var(--ink); }
.pub__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); min-height: 76px; }
.pub__logo { text-decoration: none; }
.pub__nav { display: flex; gap: var(--s-5); }
.pub__nav a { text-decoration: none; font-weight: 500; opacity: 0.86; position: relative; }
.pub__nav a::after { content: ''; position: absolute; left: 0; right: 100%; bottom: -6px; height: 2px; background: var(--accent); transition: right var(--d-med) var(--ease-out); }
.pub__nav a:hover { opacity: 1; }
.pub__nav a:hover::after { right: 0; }
main { outline: none; }
.foot { background: var(--night); color: var(--on-night); padding: var(--s-8) 0 var(--s-5); }
.foot a { color: var(--on-night); }
.foot__grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: var(--s-7); }
.foot__muted { color: var(--on-night-2); max-width: 46ch; }
.foot__label { color: var(--on-night-2); }
.foot__sos { display: flex; gap: var(--s-2); align-items: flex-start; color: var(--on-night); padding: var(--s-3) var(--s-4); border-radius: 16px; background: rgba(228, 87, 46, 0.14); }
.foot__base { display: flex; justify-content: space-between; margin-top: var(--s-8); padding-top: var(--s-4); border-top: 1px solid rgba(236, 232, 223, 0.12); color: var(--on-night-2); font-size: var(--t-sm); }
@media (max-width: 900px) { .pub__nav { display: none; } .foot__grid { grid-template-columns: 1fr; gap: var(--s-6); } }
@media (max-width: 520px) { .hide-sm { display: none; } }
</style>
