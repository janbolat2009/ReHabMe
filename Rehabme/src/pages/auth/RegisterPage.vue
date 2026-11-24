<template>
  <AuthFrame kicker="Регистрация">
    <template #title>Первый шаг — <em class="serif">самый важный</em>.</template>
    <template #lede>После регистрации — короткая самооценка (около 3 минут), и вы получите программу на неделю. Аккаунт может создать и близкий человек — для вас.</template>
    <form class="stack" @submit.prevent="submit" novalidate>
      <label class="field"><span>Как к вам обращаться</span><input class="input" v-model.trim="name" autocomplete="given-name" required maxlength="80" /></label>
      <label class="field"><span>Email</span><input class="input" v-model.trim="email" type="email" autocomplete="email" required /></label>
      <label class="field"><span>Пароль</span><input class="input" v-model="password" type="password" autocomplete="new-password" required minlength="10" aria-describedby="pw-hint" />
        <span id="pw-hint" class="hint">Не короче 10 символов. Удобно использовать фразу из нескольких слов.</span></label>
      <p v-if="error" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ error }}</p>
      <Btn type="submit" size="lg" block :loading="loading" :state="state">Создать аккаунт</Btn>
      <p class="hint">Далее вы ознакомитесь с <RouterLink to="/legal/terms">соглашением</RouterLink> и <RouterLink to="/legal/privacy">политикой конфиденциальности</RouterLink> и подтвердите согласия.</p>
      <p>Уже есть аккаунт? <RouterLink to="/login">Войти</RouterLink></p>
    </form>
  </AuthFrame>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthFrame from './AuthFrame.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import { useSession } from '@/stores/session'

const s = useSession(), router = useRouter()
const name = ref(''), email = ref(''), password = ref(''), loading = ref(false), error = ref(''), state = ref(null)

async function submit() {
  error.value = ''
  if (!name.value) return (error.value = 'Укажите, как к вам обращаться')
  if (!/^\S+@\S+\.\S+$/.test(email.value)) return (error.value = 'Проверьте адрес электронной почты')
  if (password.value.length < 10) return (error.value = 'Пароль должен быть не короче 10 символов')
  loading.value = true
  try {
    await s.register(email.value, password.value, name.value)
    state.value = 'success'
    setTimeout(() => router.push('/welcome'), 250)
  } catch (e) {
    error.value = e.message
    state.value = 'error'
    setTimeout(() => (state.value = null), 1400)
  } finally {
    loading.value = false
  }
}
</script>
