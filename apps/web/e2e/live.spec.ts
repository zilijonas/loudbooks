import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

// Post-deploy smoke against the live site and the production signaling Worker (playwright.live.config.ts).
// Uses the real UI only (the production build has no test harness) and the committed small fixtures.
const app = process.env.LIVE_URL ?? 'https://zilijonas.github.io/loudbooks/'
const files = [1, 2, 3].map((n) => resolve(process.cwd(), `../../fixtures/small/chapter-${n}.mp3`))

const webkitPages = new WeakSet<Page>()
const tap = (l: Locator) => (webkitPages.has(l.page()) ? l.dispatchEvent('click') : l.click())

async function playFromStart(page: Page) {
  await tap(page.getByRole('button', { name: /^Play from the start|^Listen/ }).first())
  await expect(page).toHaveURL(/#\/player$/)
  const ready = page.getByRole('button', { name: 'Ready — play' })
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await expect(pause.or(ready)).toBeVisible({ timeout: 60_000 })
  if (await ready.isVisible()) await tap(ready)
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5)
  await tap(pause)
}

async function addBook(page: Page, title: string) {
  await page.goto(app)
  await tap(page.getByRole('button', { name: 'Open my library' }))
  await tap(page.getByRole('button', { name: 'Add book' }).first())
  await page.getByRole('textbox', { name: 'Title Required' }).fill(title)
  await page.locator('input[type=file][multiple]').setInputFiles(files)
  await expect(page.getByRole('list', { name: 'Chapters' }).locator('input')).toHaveCount(3)
  await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
  await tap(page.getByRole('button', { name: 'Save book' }))
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 120_000 })
  return page.url()
}

test('live: add a book, play it, relaunch offline, receive a book from another device', async ({ playwright, browserName }) => {
  test.setTimeout(300_000)
  const dirs = [await mkdtemp(resolve(tmpdir(), 'loudbooks-live-a-')), await mkdtemp(resolve(tmpdir(), 'loudbooks-live-b-'))]
  const contexts: BrowserContext[] = []
  try {
    // The device under test (the project's engine) and a sender that is always Google Chrome: two peers on one
    // machine exchange UDP, and this host's firewall blocks incoming connections for the headless shell and
    // Firefox's plugin-container (see playwright.transfer.config.ts).
    const open = async (dir: string, engine: 'chromium' | typeof browserName) => {
      const ctx = await playwright[engine].launchPersistentContext(dir, { headless: true, viewport: { width: 1280, height: 900 }, channel: engine === 'chromium' ? 'chrome' : undefined })
      contexts.push(ctx)
      const page = ctx.pages()[0] ?? await ctx.newPage()
      if (engine === 'webkit') webkitPages.add(page)
      page.on('pageerror', (e) => { throw e })
      return page
    }
    const d = await open(dirs[0]!, browserName)

    await test.step('add a 3-chapter book through the UI and play it', async () => {
      await addBook(d, 'Live smoke')
      await playFromStart(d)
    })

    await test.step('relaunch offline from the service worker', async () => {
      await d.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 })
      await contexts[0]!.setOffline(true)
      const p = await contexts[0]!.newPage()
      if (browserName === 'webkit') webkitPages.add(p)
      await p.goto(app)
      await expect(p.getByText('Live smoke').first()).toBeVisible({ timeout: 30_000 })
      await p.close()
      await contexts[0]!.setOffline(false)
    })

    await test.step('receive a book from Chrome through production signaling', async () => {
      const s = await open(dirs[1]!, 'chromium')
      // Record what Copy pairing link writes (no clipboard permission prompt in headless).
      await s.addInitScript(() => {
        const w = window as unknown as { copied?: string }
        if (navigator.clipboard) navigator.clipboard.writeText = async (text: string) => { w.copied = text }
      })
      const bookUrl = await addBook(s, 'Sent book')
      await s.goto(bookUrl)
      await tap(s.getByRole('button', { name: 'Send', exact: true }))
      const dialog = s.getByRole('dialog', { name: 'Send to another device' })
      await expect(dialog.getByRole('img', { name: 'Tap Receive and scan this code.' })).toBeVisible({ timeout: 30_000 })
      await tap(dialog.getByRole('button', { name: 'Copy pairing link' }))
      await expect.poll(() => s.evaluate(() => (window as unknown as { copied?: string }).copied ?? '')).toMatch(/#\/receive\/r\//)
      const link = await s.evaluate(() => (window as unknown as { copied?: string }).copied!)
      await d.goto(app)
      await tap(d.getByRole('button', { name: /^Receive/ }).first())
      await tap(d.getByRole('button', { name: 'Paste pairing link instead' }))
      await d.getByRole('textbox', { name: 'Pairing link' }).fill(link)
      await tap(d.getByRole('button', { name: 'Connect' }))
      const codeImg = d.getByRole('img', { name: /^Pairing code/ })
      await expect(codeImg).toBeVisible({ timeout: 30_000 })
      const code = (await codeImg.getAttribute('aria-label'))!.replace(/\D/g, '')
      await dialog.getByRole('textbox', { name: 'Type the code shown on your phone' }).fill(code)
      await tap(dialog.getByRole('button', { name: 'Pair and send' }))
      await expect(d.getByRole('heading', { name: 'Your book is ready to listen offline' })).toBeVisible({ timeout: 120_000 })
      await tap(d.getByRole('button', { name: 'Open book' }))
      await expect(d.getByRole('heading', { level: 1, name: 'Sent book' })).toBeVisible()
      await playFromStart(d)
    })
  } finally {
    for (const c of contexts) await c.close().catch(() => {})
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
  }
})
