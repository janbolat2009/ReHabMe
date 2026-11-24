<template>
  <AuthFrame kicker="Вход">
    <template #title>С возвращением.</template>
    <template #lede>Войдите, чтобы продолжить программу. Если вы специалист — используйте рабочий email, подтверждённый администратором.</template>
    <form class="stack" @submit.prevent="submit" novalidate>
      <label class="field"><span>Email</span><input class="input" v-model.trim="email" type="email" autocomplete="email" required :aria-invalid="!!error" /></label>
      <label class="field"><span>Пароль</span>
        <div class="pw"><input class="input" v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password" required :aria-invalid="!!error" />
          <button type="button" class="pw__toggle" @click="show = !show" :aria-pressed="show">{{ show ? 'Скрыть' : 'Показать' }}</button></div>
      </label>
      <p v-if="error" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ error }}</p>
      <Btn type="submit" size="lg" block :loading="loading" :state="state">Войти</Btn>
      <div class="cluster" style="justify-content: space-between">
        <RouterLink to="/reset-password">Забыли пароль?</RouterLink>
        <RouterLink to="/register">Создать аккаунт</RouterLink>
      </div>
      <p v-if="isLocal" class="hint">Демо-среда: вход без Firebase. Тестовые аккаунты создаются командой <code>npm run db:seed:dev</code>.</p>
    </form>
  </AuthFrame>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AuthFrame from './AuthFrame.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import { useSession } from '@/stores/session'
import { auth } from '@/lib/auth'
import { homeFor } from '@/router'

const s = useSession(), router = useRouter(), route = useRoute()
const email = ref(''), password = ref(''), show = ref(false), loading = ref(false), error = ref(''), state = ref(null)
const isLocal = auth.provider === 'local'

async function submit() {
  error.value = ''
  if (!email.value || !password.value) { error.value = 'Введите email и пароль'; return }
  loading.value = true
  try {
    await s.login(email.value, password.value)
    state.value = 'success'
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : homeFor(s)
    setTimeout(() => router.push(next), 250)
  } catch (e) {
    error.value = e.message
    state.value = 'error'
    setTimeout(() => (state.value = null), 1400)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.pw { position: relative; }
.pw__toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); min-height: 40px; padding: 0 12px; border-radius: 12px; border: 0; background: var(--paper-2); font-size: var(--t-sm); font-weight: 500; }
</style>
