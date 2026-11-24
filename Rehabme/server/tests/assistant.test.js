import { describe, it, expect, vi } from 'vitest'
import { createAssistant } from '../services/assistant/assistant.js'
import { tokenize } from '../services/assistant/retrieval.js'

const log = { info() {}, warn() {}, error() {} }
const baseConfig = { KB_REQUIRE_APPROVED: true, OPENAI_API_KEY: undefined, LLM_EXTERNAL_PROCESSING_APPROVED: false, LLM_MODEL: 'x' }

describe('retrieval', () => {
  it('stems Russian word forms to shared tokens', () => {
    expect(tokenize('повышается')[0]).toBe(tokenize('повышение')[0])
    expect(tokenize('упражнения')[0]).toBe(tokenize('упражнение')[0])
  })

  it('only searches approved documents when KB_REQUIRE_APPROVED=true', () => {
    const a = createAssistant({ config: baseConfig, log })
    const { results } = a.index.search('признаки инсульта BE FAST', { requireApproved: true })
    expect(results.every((r) => r.chunk.doc.reviewStatus === 'approved')).toBe(true)
    const draftAllowed = a.index.search('признаки инсульта BE FAST', { requireApproved: false })
    expect(draftAllowed.results[0].chunk.docId).toBe('stroke-warning-signs')
  })
})

describe('assistant routing', () => {
  const a = createAssistant({ config: baseConfig, log })

  it('answers emergencies with a fixed safety response and call actions, without retrieval', async () => {
    const r = await a.answer({ message: 'Внезапно онемела рука, перекосило лицо', consentExternal: true })
    expect(r.mode).toBe('safety_rule')
    expect(r.answer).toMatch(/103/)
    expect(r.actions.some((x) => x.href === 'tel:103')).toBe(true)
  })

  it('answers platform questions extractively with a citation when no LLM is configured', async () => {
    const r = await a.answer({ message: 'Как повышается уровень сложности упражнений?', consentExternal: false })
    expect(r.mode).toBe('extractive')
    expect(r.citations[0].id).toMatch(/^platform-guide#/)
    expect(r.citations[0].reviewStatus).toBe('approved')
  })

  it('abstains instead of guessing on out-of-scope questions', async () => {
    const r = await a.answer({ message: 'Какая погода будет завтра в Алматы?', consentExternal: false })
    expect(r.mode).toBe('abstain')
    expect(r.citations).toHaveLength(0)
  })

  it('answers "what to do today" from the patient plan deterministically', async () => {
    const r = await a.answer({ message: 'Что мне сегодня делать?', consentExternal: false, context: { today: { estimatedMinutes: 15, items: [{ title: 'Найди пары', done: false }, { title: 'Что дальше?', done: true }] } } })
    expect(r.mode).toBe('deterministic')
    expect(r.answer).toMatch(/Найди пары/)
  })
})

describe('LLM path with guards', () => {
  const cfg = { ...baseConfig, OPENAI_API_KEY: 'sk-test', LLM_EXTERNAL_PROCESSING_APPROVED: true }
  const mkOpenAI = (content) => ({ chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] })) } } })

  it('never calls the LLM without patient consent', async () => {
    const openai = mkOpenAI({})
    const a = createAssistant({ config: cfg, log, openai })
    await a.answer({ message: 'Как повышается уровень сложности?', consentExternal: false })
    expect(openai.chat.completions.create).not.toHaveBeenCalled()
  })

  it('redacts PII and wraps user text as data', async () => {
    const openai = mkOpenAI({ answer: 'Уровень повышается после трёх уверенных попыток.', citations: ['platform-guide#2'], needs_clinician: false, grounded: true })
    const a = createAssistant({ config: cfg, log, openai })
    const r = await a.answer({ message: 'Как повышается уровень сложности? мой email test@mail.kz', consentExternal: true })
    const sent = openai.chat.completions.create.mock.calls[0][0].messages[1].content
    expect(sent).toContain('<user_message>')
    expect(sent).not.toContain('test@mail.kz')
    expect(r.mode).toBe('generative')
  })

  it('falls back to extractive when the model cites nothing valid or the guard trips', async () => {
    const openai = mkOpenAI({ answer: 'Принимайте 100 мг аспирина.', citations: ['made-up#1'], needs_clinician: false, grounded: true })
    const a = createAssistant({ config: cfg, log, openai })
    const r = await a.answer({ message: 'Как повышается уровень сложности?', consentExternal: true })
    expect(r.mode).toBe('extractive_fallback')
    expect(r.answer).not.toMatch(/100 мг/)
  })
})
