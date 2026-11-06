import { expect, test, type Page } from '@playwright/test'
import { createRequire } from 'node:module'

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

async function openGallery(page: Page, errors: string[], theme = 'light') {
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript((t) => localStorage.setItem('loudbooks:theme', t), theme)
  await page.goto('#/__gallery')
  await expect(page.getByRole('heading', { name: 'Components & states' })).toBeVisible()
}

for (const theme of ['light', 'dark']) {
  test(`gallery has no axe violations or console errors (${theme})`, async ({ page }) => {
    const errors: string[] = []
    await openGallery(page, errors, theme)
    await page.addScriptTag({ path: axePath })
    const violations = await page.evaluate(async () => {
      // @ts-expect-error axe is injected above
      const r = await window.axe.run(document, { resultTypes: ['violations'] })
      return r.violations.map((v: { id: string; nodes: { target: string[] }[] }) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    })
    expect(violations).toEqual([])
    expect(errors).toEqual([])
  })
}

test('phone sheet closes on a downward drag from its header and returns focus', async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await openGallery(page, errors)
  const trigger = page.getByRole('button', { name: 'Menu sheet' })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Book actions' })
  await expect(sheet).toBeVisible()
  const head = sheet.locator('.lb-ov-head')
  const box = (await head.boundingBox())!
  // A short drag springs back…
  await page.mouse.move(box.x + 120, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 20 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  await expect(sheet).toBeVisible()
  // …a long one dismisses, and focus goes back to the trigger.
  await page.mouse.move(box.x + 120, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 260, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(errors).toEqual([])
})

test('typed-confirm dialog keeps the action disabled until the word is typed; Escape cancels', async ({ page }) => {
  const errors: string[] = []
  await openGallery(page, errors)
  const trigger = page.getByRole('button', { name: 'Typed confirm' })
  await trigger.click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete your whole library?' })
  const confirm = dialog.getByRole('button', { name: 'Delete library' })
  await expect(confirm).toBeDisabled()
  await expect(dialog.getByRole('textbox')).toBeFocused()
  await page.keyboard.type('delete')
  await expect(confirm).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
