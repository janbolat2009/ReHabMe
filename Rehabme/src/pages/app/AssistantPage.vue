<template>
  <div class="chat">
    <header class="chat__head">
      <div class="stack" style="--gap: var(--s-2)"><p class="label">Ассистент ReHabMe</p><h1 class="title">Спросите об упражнениях и программе</h1></div>
      <span class="chip" :class="info?.mode === 'generative' ? 'chip-accent' : 'chip-teal'"><Icon :name="info?.mode === 'generative' ? 'spark' : 'book'" :size="16" />{{ info?.mode === 'generative' ? 'Расширенный режим' : 'Проверенные материалы' }}</span>
    </header>
    <p class="note"><Icon name="info" :size="18" />Ассистент объясняет упражнения, показатели и работу платформы по проверенным материалам. Он не ставит диагнозы и не назначает лечение. При внезапной слабости, нарушении речи или асимметрии лица — звоните <a href="tel:103">103</a>.</p>

    <div class="log" ref="log" role="log" aria-live="polite" aria-label="История диалога">
      <div v-if="!messages.length" class="empty">
        <p class="muted">Например:</p>
        <div class="cluster"><button v-for="q in SUGGEST" :key="q" class="sugg" @click="send(q)">{{ q }}</button></div>
      </div>
      <TransitionGroup name="rise">
        <div v-for="m in messages" :key="m.id" class="msg" :class="[m.role, { alert: m.safetyRoute === 'emergency' || m.safety?.route === 'emergency' }]">
          <div class="bubble">
            <p v-for="(para, i) in (m.content || '').split('\n').filter(Boolean)" :key="i">{{ para }}</p>
            <div v-if="m.actions?.length" class="cluster" style="margin-top: var(--s-3)"><Btn v-for="a in m.actions" :key="a.href" :href="a.type === 'call' ? a.href : undefined" :to="a.type === 'link' ? a.href : undefined" :variant="a.type === 'call' ? 'danger' : 'secondary'" size="sm" :icon="a.type === 'call' ? 'phone' : 'arrow'">{{ a.label }}</Btn></div>
            <div v-if="m.citations?.length" class="cites"><span class="label">Источники</span>
              <span v-for="c in m.citations" :key="c.id" class="cite"><Icon name="book" :size="14" />{{ c.title }} — {{ c.section }} <span class="muted">· {{ c.source }} · v{{ c.version }}</span><span v-if="c.reviewStatus !== 'approved'" class="chip chip-warn">черновик, ожидает проверки</span></span>
            </div>
          </div>
        </div>
      </TransitionGroup>
      <div v-if="thinking" class="msg assistant"><div class="bubble typing" aria-label="Ассистент печатает"><i /><i /><i /></div></div>
    </div>

    <form class="composer" @submit.prevent="send(input)">
      <label class="sr-only" for="ask">Ваш вопрос</label>
      <textarea id="ask" v-model="input" class="textarea" rows="2" maxlength="2000" placeholder="Напишите вопрос…" @keydown.enter.exact.prevent="send(input)" />
      <div class="cluster hand-aware"><Btn type="submit" icon="arrow" :loading="thinking" :disabled="!input.trim()">Отправить</Btn><Btn v-if="messages.length" variant="ghost" size="sm" icon="trash" @click="clear">Очистить историю</Btn></div>
      <p class="hint">Переписка хранится {{ info?.retentionDays ?? 90 }} дней в зашифрованном виде. {{ info?.llmConfigured ? 'Расширенный режим включается в профиле отдельным согласием.' : '' }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import Btn from '@/components/ui/Btn.vue'
import Icon from '@/components/ui/Icon.vue'
import { api } from '@/lib/api'
import { useToasts } from '@/stores/toasts'

const toasts = useToasts()
const SUGGEST = ['Что мне сегодня делать?', 'Как повышается уровень сложности?', 'Что делать при сильной усталости?', 'Кто видит мои данные?']
const messages = ref([]), input = ref(''), thinking = ref(false), conversationId = ref(null), info = ref(null), log = ref(null)
const scroll = () => nextTick(() => { if (log.value) log.value.scrollTop = log.value.scrollHeight })

onMounted(async () => {
  try {
    const [h, i] = await Promise.all([api.get('/assistant/conversations/latest'), api.get('/assistant/info')])
    conversationId.value = h.conversationId; messages.value = h.messages; info.value = i; scroll()
  } catch (e) { toasts.error(e.message) }
})
async function send(text) {
  const q = text.trim()
  if (!q || thinking.value) return
  messages.value.push({ id: `u${Date.now()}`, role: 'user', content: q })
  input.value = ''; thinking.value = true; scroll()
  try {
    const r = await api.post('/assistant/messages', { conversationId: conversationId.value, message: q }, { timeout: 30000 })
    conversationId.value = r.conversationId
    messages.value.push(r.message)
  } catch (e) {
    messages.value.push({ id: `e${Date.now()}`, role: 'assistant', content: `Не удалось получить ответ: ${e.message} Если вопрос срочный и касается самочувствия — обратитесь к врачу или звоните 103.` })
  } finally { thinking.value = false; scroll() }
}
async function clear() {
  try { await api.del('/assistant/conversations'); messages.value = []; conversationId.value = null; toasts.success('История удалена') } catch (e) { toasts.error(e.message) }
}
</script>

<style scoped>
.chat { display: grid; gap: var(--s-4); }
.chat__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: var(--s-3); }
.title { font-family: var(--font-display); font-weight: 400; font-size: var(--t-2xl); letter-spacing: -0.03em; }
.note { display: flex; gap: var(--s-2); padding: var(--s-3) var(--s-4); border-radius: 16px; background: var(--paper-2); }
.log { display: grid; gap: var(--s-3); align-content: start; min-height: 320px; max-height: 58vh; overflow-y: auto; padding: var(--s-4); border-radius: var(--r-panel); background: var(--paper-2); }
.empty { display: grid; gap: var(--s-3); }
.sugg { min-height: 48px; padding: 0 var(--s-4); border-radius: var(--r-pill); border: 1.5px solid var(--line-strong); background: var(--surface); font-weight: 500; }
.sugg:hover { border-color: var(--ink); }
.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.bubble { max-width: min(680px, 90%); padding: var(--s-3) var(--s-4); border-radius: 20px; background: var(--surface); box-shadow: var(--shadow-1); display: grid; gap: var(--s-2); }
.msg.user .bubble { background: var(--ink); color: var(--paper); border-bottom-right-radius: 6px; }
.msg.assistant .bubble { border-bottom-left-radius: 6px; }
.msg.alert .bubble { background: var(--danger-soft); box-shadow: inset 0 0 0 2px var(--danger); }
.cites { display: grid; gap: 6px; padding-top: var(--s-2); border-top: 1px solid var(--line); font-size: var(--t-sm); }
.cite { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.typing { display: flex; gap: 6px; padding: var(--s-4); }
.typing i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); animation: dot 1.2s infinite; }
.typing i:nth-child(2) { animation-delay: 0.2s; } .typing i:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot { 50% { opacity: 0.25; } }
.composer { display: grid; gap: var(--s-3); }
</style>
