// Full patient journey on a fresh account, with the ML service intentionally unavailable.
import { test, expect } from '@playwright/test'

const email = `e2e+${Date.now()}@rehabme.test`
const password = 'e2e-test-password-1'

test.describe.serial('patient journey', () => {
  test('registration → consents → screening → personalised plan', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Реабилитация')
    await page.getByRole('link', { name: 'Начать восстановление' }).click()

    await page.getByLabel('Как к вам обращаться').fill('Тест')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Пароль').fill(password)
    await page.getByRole('button', { name: 'Создать аккаунт' }).click()

    // Consents: "Далее" stays disabled until the three required consents are given.
    await expect(page.getByRole('heading', { name: 'Прежде чем начать' })).toBeVisible()
    const next = page.getByRole('button', { name: 'Далее' })
    await expect(next).toBeDisabled()
    for (const t of ['Пользовательское соглашение', 'Политика конфиденциальности', 'Обработка данных о здоровье']) await page.locator('label.consent', { hasText: t }).click()
    await next.click()

    await expect(page.getByRole('heading', { name: 'Немного о вас' })).toBeVisible()
    await page.getByRole('radio', { name: 'Ишемический' }).click()
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByRole('heading', { name: 'Что для вас важнее всего?' })).toBeVisible()
    await page.getByRole('button', { name: 'Пользоваться телефоном' }).click()
    await page.getByRole('button', { name: 'Далее' }).click()

    // 9 self-report questions, one per screen.
    for (let i = 0; i < 9; i++) {
      await expect(page.getByText(`вопрос ${i + 1} из 9`)).toBeVisible()
      await page.getByRole('radio', { name: i % 2 ? 'Немного трудно' : 'Умеренно трудно' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Три вопроса о безопасности' })).toBeVisible()
    const groups = page.getByRole('radiogroup')
    await groups.nth(0).getByRole('radio', { name: 'Нет' }).click() // no physician clearance yet
    await groups.nth(1).getByRole('radio', { name: 'Нет' }).click()
    await groups.nth(2).getByRole('radio', { name: 'Нет' }).click()
    await page.getByRole('button', { name: 'Составить программу' }).click()

    await expect(page.getByRole('heading', { name: 'Ваша программа на неделю' })).toBeVisible()
    await expect(page.getByText('видео — после разрешения врача')).toBeVisible()
    await page.getByRole('link', { name: 'Перейти к плану' }).click()
    await expect(page.getByRole('heading', { name: 'План на сегодня' })).toBeVisible()
    await expect(page.getByText('Упражнение по видео')).toHaveCount(0) // safety rule held physical exercises
  })

  test('exercise session → saved result → progress analytics', async ({ page }) => {
    await login(page)
    await page.goto('/app/practice/cognition-sort')
    await page.getByRole('radio', { name: '3', exact: true }).click()
    await page.getByRole('button', { name: 'Начать', exact: true }).click()
    await page.getByRole('button', { name: 'Начать', exact: true }).click() // exercise intro → play
    // Answer every item (feedback pauses are deliberately calm: 0.7–1.8 s per item).
    const done = page.getByRole('heading', { name: /Упражнение (выполнено|остановлено)/ })
    for (let i = 0; i < 160 && !(await done.isVisible()); i++) {
      const choices = page.locator('.choice:not([disabled])')
      if (await choices.count()) await choices.first().click().catch(() => {})
      await page.waitForTimeout(250)
    }
    await expect(page.getByRole('heading', { name: 'Упражнение выполнено' })).toBeVisible()
    await expect(page.getByText('Точность', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Дальше' }).click()
    await page.getByRole('radiogroup', { name: 'Усталость' }).getByRole('radio', { name: /^4/ }).click()
    await page.getByRole('radiogroup', { name: 'Боль или дискомфорт' }).getByRole('radio', { name: /^0/ }).click()
    await page.getByRole('button', { name: 'Сохранить и завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Занятие завершено' })).toBeVisible()

    await page.goto('/app/progress')
    await expect(page.getByRole('heading', { name: /Регулярность/ })).toBeVisible()
    await expect(page.locator('.kpi').first()).toContainText('1')
    await expect(page.getByText('Мышление').first()).toBeVisible()
    await expect(page.getByText('Клинических оценок пока нет')).toBeVisible()
  })

  test('assistant routes emergencies to 103 and answers from verified sources', async ({ page }) => {
    await login(page)
    await page.goto('/app/assistant')
    await page.getByLabel('Ваш вопрос').fill('У меня внезапно онемела рука и перекосило лицо')
    await page.getByRole('button', { name: 'Отправить' }).click()
    await expect(page.getByRole('link', { name: 'Позвонить 103' })).toBeVisible()
    await page.getByLabel('Ваш вопрос').fill('Как повышается уровень сложности?')
    await page.getByRole('button', { name: 'Отправить' }).click()
    await expect(page.getByText('Источники').last()).toBeVisible()
  })

  test('prediction degrades honestly when the ML service is down', async ({ page }) => {
    await login(page)
    await page.goto('/app/prediction')
    await page.getByRole('button', { name: /Рассчитать|Пересчитать/ }).click()
    await expect(page.getByRole('heading', { name: 'Прогноз сейчас недоступен' })).toBeVisible()
  })

  test('accessibility settings apply immediately', async ({ page }) => {
    await login(page)
    await page.goto('/app/accessibility')
    await page.getByRole('radio', { name: 'Высокий' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high')
    await page.getByRole('switch', { name: 'Крупные кнопки' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-targets', 'large')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

async function login(page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page).toHaveURL(/\/app/)
}
