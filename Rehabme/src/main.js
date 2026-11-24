import '@fontsource-variable/onest'
import '@fontsource-variable/unbounded'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/cormorant-garamond/500-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { vReveal } from './lib/ui'

document.documentElement.classList.add('js')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('reveal', vReveal)
app.config.errorHandler = (err, instance, info) => {
  // Never surface stack traces to patients; log for monitoring (see DEPLOYMENT.md → error monitoring).
  console.error('[ui-error]', info, err)
}
app.mount('#app')
