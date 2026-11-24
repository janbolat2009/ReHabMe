// Deterministic safety layer. Runs BEFORE any retrieval or LLM call and AFTER the LLM responds.
// Rule-based on purpose: emergency handling must not depend on a probabilistic model.

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')

// Sudden neurological symptoms (BE-FAST) and other red flags. Russian + English + common Kazakh words.
const EMERGENCY_PATTERNS = [
  /внезапн\w*\s+(\S+\s+){0,3}(слабост|онемен|онемел|головокруж|головн\w+ бол|потер|не могу|нарушен|двоит|перекос|тошнот)/,
  /(перекосил|перекошен|опустил)\w*\s+(\S+\s+){0,2}(лиц|рот|угол)/,
  /(лиц|рот)\w*\s+(\S+\s+){0,2}(перекосил|перекошен|опустил)/,
  /(онемел|отнял|не (могу|может) (поднять|пошевелить))\w*\s+(\S+\s+){0,2}(рук|ног|сторон|половин)/,
  /(рук|ног)\w*\s+(\S+\s+){0,2}(онемел|отнял|не слуша|повис)/,
  /(не могу|не может|трудно|невнятн\w*)\s+(\S+\s+){0,2}(говорить|сказать|произнес|речь)\w*\s*(внезапн|вдруг|сейчас|только что)?/,
  /(речь|говорю)\s+(\S+\s+){0,2}(невнятн|спута|пропал)/,
  /(резк|сильнейш|невыносим|самая сильная)\w*\s+(\S+\s+){0,2}головн\w+\s+бол/,
  /(потерял|теряю|теряет)\w*\s+(сознани|равновеси)/,
  /(пропало|потерял|двоится|темнеет в)\w*\s+(\S+\s+){0,2}(зрени|глаз)/,
  /(бол\w*|давит|жжет)\s+(\S+\s+){0,2}(в груди|за грудин)/,
  /(судорог|приступ эпилеп)/,
  /\b(sudden(ly)?\s+(\w+\s+){0,3}(weak|numb|dizzy|confus|headache|vision|trouble speaking))/,
  /\b(face (is )?droop|slurred speech|can'?t (move|lift) my (arm|leg)|chest pain|passed out)/,
  /(кенет|кенеттен).{0,30}(әлсіз|ұйып|сөйлей алмай)/,
]
const SELF_HARM_PATTERNS = [
  /(покончить с собой|убить себя|не хочу жить|суицид|свести счеты|лучше бы (я )?умер|хочу умереть)/,
  /\b(kill myself|suicide|want to die|end my life)\b/,
]
const MEDICAL_ADVICE_PATTERNS = [
  /(доз[аыуе]|дозировк|сколько\s+(мг|миллиграмм|таблет|капсул)|по сколько (пить|принимать))/,
  /(можно ли|стоит ли|нужно ли|могу ли я)\s+(\S+\s+){0,3}(отменить|бросить|прекратить|не пить|перестать|заменить|увеличить|уменьшить)\s+(\S+\s+){0,2}(лекарств|таблет|препарат|прием|терапи|аспирин|варфарин|статин)/,
  /(какое|какой|какие)\s+(лекарств|препарат|таблетк|антидепрессант|антикоагулянт)/,
  /(назначь|выпиши|посоветуй)\w*\s+(\S+\s+){0,2}(лекарств|препарат|таблет|лечени)/,
  /(поставь|поставьте|какой у меня)\s+(\S+\s+){0,1}диагноз/,
  /(отказаться|бросить|прекратить)\s+(\S+\s+){0,2}(реабилитац|лечени|к врачу|физиотерап)/,
  /\b(what dose|how many mg|should i stop (taking|my) (medication|meds|pills)|prescribe|diagnose me)\b/,
]
const INJECTION_PATTERNS = [
  /(игнорируй|забудь|отмени)\w*\s+(\S+\s+){0,3}(инструкци|правил|указани|промпт)/,
  /(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|your)\s+(instructions|rules|prompt)/,
  /(system prompt|системн\w+ промпт|developer mode|режим разработчика|jailbreak|ты теперь|you are now|act as (a )?doctor|притворись врачом)/,
  /<\/?(system|assistant|instructions?)>/,
]

// JS `\w` is ASCII-only, so `внезапн\w*` would never match "внезапно". Recompile every pattern as a
// Unicode regex with `\w` widened to any letter/digit (regression-tested in tests/safety.test.js).
const unicode = (list) => list.map((r) => new RegExp(r.source.replace(/\\w/g, '[\\p{L}\\p{N}_]'), 'u'))
const RX = {
  emergency: unicode(EMERGENCY_PATTERNS),
  selfHarm: unicode(SELF_HARM_PATTERNS),
  medicalAdvice: unicode(MEDICAL_ADVICE_PATTERNS),
  injection: unicode(INJECTION_PATTERNS),
}

export function classifyInput(text) {
  const t = norm(text)
  const flags = {
    emergency: RX.emergency.some((r) => r.test(t)),
    selfHarm: RX.selfHarm.some((r) => r.test(t)),
    medicalAdvice: RX.medicalAdvice.some((r) => r.test(t)),
    injection: RX.injection.some((r) => r.test(t)),
  }
  let route = 'general'
  if (flags.emergency) route = 'emergency'
  else if (flags.selfHarm) route = 'self_harm'
  else if (flags.medicalAdvice) route = 'medical_advice'
  return { route, flags }
}

export const RESPONSES = {
  emergency: {
    answer:
      'Это могут быть признаки инсульта или другого неотложного состояния. Пожалуйста, прекратите занятие и немедленно вызовите скорую помощь: 103 (или 112).\n\n' +
      'Запомните время появления симптомов — это важно для врачей. Не принимайте лекарства и не ешьте до приезда скорой, если врач не сказал иначе. Если рядом есть близкий человек — позовите его.\n\n' +
      'Признаки инсульта (BE FAST): нарушение равновесия, внезапное ухудшение зрения, асимметрия лица, слабость в руке или ноге, нарушение речи — и время: звонить нужно сразу.',
    needsClinician: true,
    actions: [{ type: 'call', label: 'Позвонить 103', href: 'tel:103' }, { type: 'call', label: 'Позвонить 112', href: 'tel:112' }],
  },
  self_harm: {
    answer:
      'Мне очень жаль, что вам сейчас так тяжело. Вы не одни, и помощь существует. Если вы в опасности прямо сейчас — позвоните 112 или 103.\n\n' +
      'Пожалуйста, расскажите о своих чувствах близкому человеку или врачу. Подавленность после инсульта встречается часто и поддаётся лечению — это не ваша вина и не слабость.',
    needsClinician: true,
    actions: [{ type: 'call', label: 'Позвонить 112', href: 'tel:112' }],
  },
  medical_advice: {
    answer:
      'Я не могу назначать или отменять лекарства, подбирать дозировки, ставить диагнозы или менять лечение — это может навредить. Такие решения принимает только ваш лечащий врач, который знает вашу историю болезни.\n\n' +
      'Я могу помочь подготовить вопросы к врачу или объяснить, как устроены упражнения и ваш план в ReHabMe.',
    needsClinician: true,
    actions: [],
  },
}

// Redact direct identifiers before any text leaves our infrastructure.
export function redactPII(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d{12}\b/g, '[ИИН]')
    .replace(/(\+?\d[\d\s()-]{8,}\d)/g, '[телефон]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[карта]')
}

// Post-generation guard: block content the assistant must never produce.
const OUTPUT_BLOCKLIST = [
  /\b\d+([.,]\d+)?\s?(мг|mg|мкг|мл|ml|ед\.|units?)(?![\p{L}])/iu,
  /(рекомендую|советую|следует|нужно)\s+(\S+\s+){0,2}(отменить|прекратить|бросить|уменьшить|увеличить)\s+(\S+\s+){0,2}(прием|лекарств|препарат|дозу)/i,
  /(у вас|вероятно у вас|это)\s+(\S+\s+){0,1}(диагноз|инсульт|деменция|афазия)(?![\p{L}])/iu,
  /(вы полностью восстановитесь|гарантир|точно восстановит)/i,
]
const OUTPUT_RX = OUTPUT_BLOCKLIST.map((r) => new RegExp(r.source.replace(/\\w/g, '[\\p{L}\\p{N}_]'), 'iu'))
export function checkOutput(answer) {
  const hit = OUTPUT_RX.find((r) => r.test(answer))
  return hit ? { ok: false, reason: String(hit) } : { ok: true }
}
