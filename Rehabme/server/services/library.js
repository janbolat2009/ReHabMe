// Controlled exercise library. Changes go through code review (= change control) and bump LIBRARY_VERSION.
// Every item carries an approval record; "pending_clinical_review" items must be signed off by a
// rehabilitation specialist before the clinical release gate (see CLINICAL_VALIDATION_PLAN.md).
// The engine never invents exercises — it only selects from this list.

export const LIBRARY_VERSION = '2026.11.1'

export const DOMAINS = {
  memory: { label: 'Память', color: 'memory' },
  attention: { label: 'Внимание', color: 'attention' },
  cognition: { label: 'Мышление', color: 'cognition' },
  motor: { label: 'Моторика', color: 'motor' },
  speech: { label: 'Речь', color: 'speech' },
  wellbeing: { label: 'Эмоциональное состояние', color: 'wellbeing' },
}

const pending = { status: 'pending_clinical_review', reviewedBy: null, reviewedAt: null }

// Available media files (only those that exist in /public/assets as browser-playable formats).
const MOTOR_VIDEOS = {
  easy: [1, 2, 3, 5, 6].map((n) => `/assets/motorica/easy/easy${n}.mp4`),
  medium: [1, 2, 3, 4, 6].map((n) => `/assets/motorica/medium/medium${n}.mp4`),
  hard: [1, 2, 3, 5, 6].map((n) => `/assets/motorica/hard/hard${n}.mp4`),
}
const SPEECH_AUDIO = {
  easy: [1, 2, 3, 4, 5, 6].map((n) => `/assets/speech/easy/day${n}.ogg`),
  medium: [1, 2, 3, 4, 5, 6, 7].map((n) => `/assets/speech/medium/day${n}.ogg`),
  hard: [1, 2, 3, 4, 5, 6, 7].map((n) => `/assets/speech/hard/day${n}.ogg`),
}
const tier = (level) => (level <= 2 ? 'easy' : level === 3 ? 'medium' : 'hard')

export const EXERCISES = [
  {
    id: 'memory-pairs', domain: 'memory', kind: 'interactive', minutes: 4,
    title: 'Найди пары', summary: 'Зрительная память: откройте карточки и найдите одинаковые.',
    instructions: ['Нажмите на карточку, чтобы перевернуть её.', 'Затем откройте вторую. Если картинки совпали — пара остаётся открытой.', 'Найдите все пары. Спешить не нужно.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { pairs: 3 }, 2: { pairs: 4 }, 3: { pairs: 6 }, 4: { pairs: 8 }, 5: { pairs: 10 } },
    approval: pending,
  },
  {
    id: 'memory-sequence', domain: 'memory', kind: 'interactive', minutes: 4,
    title: 'Повтори последовательность', summary: 'Кратковременная память: запомните порядок, в котором загораются плитки.',
    instructions: ['Плитки загорятся по очереди.', 'Когда появится надпись «Ваш ход», нажмите плитки в том же порядке.', 'Каждый раунд последовательность может стать длиннее.'],
    timeLimitAdjustable: false, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { span: 2, rounds: 4, stepMs: 1100 }, 2: { span: 3, rounds: 5, stepMs: 1000 }, 3: { span: 4, rounds: 5, stepMs: 900 }, 4: { span: 5, rounds: 6, stepMs: 850 }, 5: { span: 6, rounds: 6, stepMs: 800 } },
    approval: pending,
  },
  {
    id: 'memory-words', domain: 'memory', kind: 'interactive', minutes: 5,
    title: 'Запомни слова', summary: 'Словесная память: запомните список слов, затем узнайте их среди других.',
    instructions: ['Прочитайте слова. Можно прочитать вслух.', 'Нажмите «Я запомнил(а)», когда будете готовы.', 'Затем отметьте только те слова, которые были в списке.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { words: 3, distractors: 3 }, 2: { words: 5, distractors: 4 }, 3: { words: 7, distractors: 5 }, 4: { words: 9, distractors: 6 }, 5: { words: 12, distractors: 8 } },
    approval: pending,
  },
  {
    id: 'attention-search', domain: 'attention', kind: 'interactive', minutes: 4,
    title: 'Найди все цели', summary: 'Зрительное внимание: найдите все заданные фигуры среди похожих.',
    instructions: ['Вверху показана фигура, которую нужно найти.', 'Нажмите на каждую такую фигуру на поле.', 'Когда найдёте все — нажмите «Готово».'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { grid: 3, targets: 2, similar: false }, 2: { grid: 4, targets: 3, similar: false }, 3: { grid: 5, targets: 4, similar: true }, 4: { grid: 6, targets: 5, similar: true }, 5: { grid: 7, targets: 6, similar: true } },
    approval: pending,
  },
  {
    id: 'attention-gonogo', domain: 'attention', kind: 'interactive', minutes: 3,
    title: 'Реагируй на зелёный', summary: 'Скорость реакции и контроль импульсов: нажимайте только на зелёный круг.',
    instructions: ['В центре будут появляться круги.', 'Нажмите кнопку (или пробел), только если круг зелёный и в нём галочка.', 'Если круг серый с крестиком — ничего не нажимайте.'],
    // Reaction time is the measured construct, so timing cannot be removed; pace is slow at low levels.
    timeLimitAdjustable: false, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { trials: 12, stimulusMs: 2200, goRatio: 0.75 }, 2: { trials: 16, stimulusMs: 1800, goRatio: 0.7 }, 3: { trials: 20, stimulusMs: 1500, goRatio: 0.7 }, 4: { trials: 24, stimulusMs: 1200, goRatio: 0.65 }, 5: { trials: 28, stimulusMs: 1000, goRatio: 0.65 } },
    approval: pending,
  },
  {
    id: 'cognition-sequence', domain: 'cognition', kind: 'interactive', minutes: 4,
    title: 'Что дальше?', summary: 'Логика: определите закономерность и выберите следующий элемент.',
    instructions: ['Посмотрите на ряд чисел.', 'Найдите правило, по которому он построен.', 'Выберите число, которое должно стоять следующим.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { items: 5, rules: ['add1', 'add2'] }, 2: { items: 6, rules: ['add2', 'add3', 'sub1'] }, 3: { items: 6, rules: ['add3', 'add5', 'sub2', 'mul2'] }, 4: { items: 7, rules: ['mul2', 'alt', 'add4', 'sub3'] }, 5: { items: 8, rules: ['alt', 'grow', 'mul2', 'mul3'] } },
    approval: pending,
  },
  {
    id: 'cognition-sort', domain: 'cognition', kind: 'interactive', minutes: 4,
    title: 'Разложи по группам', summary: 'Классификация: отнесите каждый предмет к нужной группе.',
    instructions: ['Посмотрите на предмет в центре.', 'Нажмите на группу, к которой он относится.', 'Перетаскивать ничего не нужно — только нажатия.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { categories: 2, items: 8 }, 2: { categories: 2, items: 10 }, 3: { categories: 3, items: 12 }, 4: { categories: 3, items: 15 }, 5: { categories: 4, items: 18 } },
    approval: pending,
  },
  {
    id: 'motor-targets', domain: 'motor', kind: 'interactive', minutes: 3,
    title: 'Точные касания', summary: 'Точность движений руки: нажимайте на круги, которые появляются на экране.',
    instructions: ['На поле появится круг.', 'Наведите и нажмите на него — появится следующий.', 'Двигайтесь спокойно: важна точность, а не скорость.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: true,
    levels: { 1: { targets: 8, size: 112 }, 2: { targets: 10, size: 92 }, 3: { targets: 12, size: 76 }, 4: { targets: 14, size: 62 }, 5: { targets: 16, size: 52 } },
    approval: pending,
  },
  {
    id: 'motor-tracking', domain: 'motor', kind: 'interactive', minutes: 3,
    title: 'Следуй за кругом', summary: 'Плавность и координация: удерживайте указатель внутри медленно движущегося круга.',
    instructions: ['Круг будет медленно двигаться по полю.', 'Ведите мышь или палец так, чтобы указатель оставался внутри круга.', 'Без мыши: используйте стрелки на клавиатуре.'],
    timeLimitAdjustable: false, inputs: ['pointer', 'keyboard'], fineMotor: true,
    levels: { 1: { seconds: 30, radius: 70, speed: 0.45 }, 2: { seconds: 40, radius: 60, speed: 0.6 }, 3: { seconds: 45, radius: 52, speed: 0.75 }, 4: { seconds: 50, radius: 44, speed: 0.9 }, 5: { seconds: 60, radius: 38, speed: 1.05 } },
    approval: pending,
  },
  {
    id: 'motor-video', domain: 'motor', kind: 'guided', minutes: 8, physical: true,
    title: 'Упражнение по видео', summary: 'Физическое упражнение для рук: повторяйте движения за инструктором.',
    instructions: ['Сядьте устойчиво, на стул со спинкой.', 'Посмотрите видео целиком, затем повторите движения в своём темпе.', 'При боли, головокружении или онемении — остановитесь.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: Object.fromEntries([1, 2, 3, 4, 5].map((l) => [l, { media: MOTOR_VIDEOS[tier(l)] }])),
    approval: pending,
  },
  {
    id: 'speech-repeat', domain: 'speech', kind: 'guided', minutes: 6,
    title: 'Слушай и повторяй', summary: 'Речь: прослушайте запись и повторите вслух.',
    instructions: ['Нажмите «Воспроизвести».', 'Повторите услышанное вслух. Можно прослушать несколько раз.', 'Отметьте, насколько легко было повторить.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: Object.fromEntries([1, 2, 3, 4, 5].map((l) => [l, { media: SPEECH_AUDIO[tier(l)] }])),
    approval: pending,
  },
  {
    id: 'wellbeing-checkin', domain: 'wellbeing', kind: 'guided', minutes: 4,
    title: 'Дневник состояния', summary: 'Короткая рефлексия: настроение, энергия и то, что сегодня получилось.',
    instructions: ['Ответьте на несколько вопросов о сегодняшнем дне.', 'Здесь нет правильных ответов.', 'Если вам тяжело на душе несколько дней подряд — расскажите об этом врачу или близким.'],
    timeLimitAdjustable: true, inputs: ['pointer', 'keyboard'], fineMotor: false,
    levels: { 1: { prompt: 'gratitude' }, 2: { prompt: 'gratitude' }, 3: { prompt: 'visualize' }, 4: { prompt: 'visualize' }, 5: { prompt: 'hobby' } },
    approval: pending,
  },
]

export const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]))

export function publicExercise(e) {
  return {
    id: e.id, domain: e.domain, kind: e.kind, minutes: e.minutes, title: e.title, summary: e.summary,
    instructions: e.instructions, timeLimitAdjustable: e.timeLimitAdjustable, inputs: e.inputs,
    fineMotor: e.fineMotor, physical: !!e.physical, levels: e.levels, approval: e.approval,
  }
}
