<template>
  <AuthFrame kicker="Восстановление доступа">
    <template #title>Восстановим пароль.</template>
    <template #lede>Мы отправим письмо со ссылкой для создания нового пароля.</template>
    <form v-if="!sent" class="stack" @submit.prevent="submit" novalidate>
      <label class="field"><span>Email</span><input class="input" v-model.trim="email" type="email" autocomplete="email" required /></label>
      <p v-if="error" class="error-text" role="alert"><Icon name="alert" :size="18" />{{ error }}</p>
      <Btn type="submit" size="lg" block :loading="loading">Отправить письмо</Btn>
      <RouterLink to="/login">Вернуться ко входу</RouterLink>
    </form>
    <div v-else class="stack" role="status">
      <h2>Проверьте почту</h2>
      <p class="muted">Если аккаунт с адресом {{ email }} существует, письмо придёт в течение нескольких минут. Проверьте папку «Спам».</p>
      <Btn to="/login" variant="secondary">Ко входу</Btn>
    </div>
  </AuthFrame>
</template>

<script setup>
import { ref } from 'vue'
import AuthFrame from './AuthFrame.vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import { auth } from '@/lib/auth'

const email = ref(''), loading = ref(false), error = ref(''), sent = ref(false)
async function submit() {
  error.value = ''
  loading.value = true
  try { await auth.resetPassword(email.value); sent.value = true } catch (e) { error.value = e.message } finally { loading.value = false }
}
</script>
