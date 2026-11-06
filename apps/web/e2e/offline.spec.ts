import { expect, test } from '@playwright/test'

test('app shell loads again offline once the service worker is active', async ({ page, context }) => {
  try {
    await page.goto('./')
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()

    // `ready` resolves after install (full precache) and activation.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    await context.setOffline(true)
    await page.reload()
    await expect(heading).toBeVisible()
    await expect(page).toHaveURL(/\/loudbooks\/(#\/welcome)?$/) // first launch lands on Welcome
  } finally {
    await context.setOffline(false)
  }
})
