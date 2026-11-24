<template>
  <a class="skip-link" href="#main">Перейти к содержанию</a>
  <RouterView v-slot="{ Component, route }">
    <Transition name="route" mode="out-in">
      <component :is="Component" :key="route.matched[0]?.path" />
    </Transition>
  </RouterView>
  <ToastHost />
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
</template>

<script setup>
import ToastHost from '@/components/ui/ToastHost.vue'
import { announcement } from '@/lib/ui'
</script>
