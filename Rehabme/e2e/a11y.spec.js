// Automated WCAG 2.2 A/AA checks (axe-core). Automated checks catch ~30–50% of issues; manual audit still required.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGES = ['/', '/login', '/register', '/legal/privacy', '/legal/disclaimer', '/does-not-exist']

for (const path of PAGES) {
  test(`no serious/critical axe violations on ${path} @mobile`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    // Reveal everything and let entrance transitions finish, so contrast is measured on final colours.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in')))
    await page.waitForTimeout(1200)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} × ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test('keyboard: skip link and visible focus on landing', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Перейти к содержанию' })).toBeFocused()
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
  expect(outline).not.toBe('none')
})
