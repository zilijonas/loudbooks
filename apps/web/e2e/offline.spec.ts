// PWA lifecycle against the PREVIEW build: offline cold launch, and a service worker update while listening.
// Persistent contexts: WebKit refuses OPFS in ephemeral ones.
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

const root = resolve(process.cwd(), '../..')
const sample = resolve(root, 'audio_samples/book-short.mp3')
const dist = resolve(process.cwd(), 'dist')
const app = 'http://localhost:4173/loudbooks/'

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

async function importBook(page: Page) {
  await page.goto(`${app}#/__harness/import`)
  await page.getByLabel('Audio files').setInputFiles([sample])
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('status')).toHaveText(/^(ready|error:)/, { timeout: 150_000 })
  expect(await page.getByTestId('status').innerText()).toBe('ready')
}

async function expectPlaying(page: Page) {
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  const ready = page.getByRole('button', { name: 'Ready — play' })
  await expect(pause.or(ready)).toBeVisible({ timeout: 60_000 })
  if (await ready.isVisible()) await ready.click()
  await expect(pause).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.paused)).toBe(false)
}

async function withProfile(browserName: 'chromium' | 'webkit' | 'firefox', playwright: PlaywrightWorkerArgs['playwright'], run: (context: BrowserContext, page: Page) => Promise<void>) {
  const profile = await mkdtemp(resolve(tmpdir(), 'loudbooks-pwa-'))
  let context: BrowserContext | undefined
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 } })
    await run(context, await context.newPage())
  } finally {
    try { await context?.setOffline(false); await context?.close() } finally { await rm(profile, { recursive: true, force: true }) }
  }
}

test('cold launch offline: library lists the stored book, plays it, every precache entry is cached', async ({ playwright, browserName }) => {
  test.skip(!existsSync(sample), 'External audio fixtures are not installed')
  test.setTimeout(150_000)
  await withProfile(browserName, playwright, async (context, page) => {
    await importBook(page)
    await page.evaluate(() => { location.hash = '#/' }) // the harness route sits outside the Shell that registers the worker
    await expect(page.getByText('Browser test').first()).toBeVisible()
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    // Every url in the build's precache manifest is in the precache cache (install completed, nothing skipped).
    const manifest = await (await fetch(`${app}sw.js`)).text()
    const urls = [...manifest.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThan(20)
    const missing = await page.evaluate(async (list) => {
      const names = (await caches.keys()).filter((n) => n.includes('precache'))
      const cache = await caches.open(names[0]!)
      const gone: string[] = []
      for (const u of list) if (!(await cache.match(new URL(u, location.origin + '/loudbooks/'), { ignoreSearch: true }))) gone.push(u) // precache keys carry ?__WB_REVISION__
      return gone
    }, urls)
    expect(missing).toEqual([])

    // Close the page, go offline, open a new one: a real cold launch of the app shell.
    await page.close()
    await context.setOffline(true)
    const cold = await context.newPage()
    const failed: string[] = []
    cold.on('requestfailed', (r) => failed.push(r.url()))
    const errors: string[] = []
    cold.on('pageerror', (e) => errors.push(String(e)))
    await cold.goto(app)
    await expect(cold.getByText('Browser test').first()).toBeVisible({ timeout: 30_000 })
    await cold.getByRole('button', { name: /^(Play|Resume) Browser test/ }).first().click()
    await expectPlaying(cold)
    expect(failed).toEqual([])
    expect(errors).toEqual([])
  })
})

test('a service worker update while listening does not reload; it applies after pausing and keeps the library', async ({ playwright, browserName }) => {
  test.skip(!existsSync(sample), 'External audio fixtures are not installed')
  test.setTimeout(150_000)
  const swPath = resolve(dist, 'sw.js')
  const backup = resolve(tmpdir(), `loudbooks-sw-${process.pid}.js`)
  await copyFile(swPath, backup)
  try {
    await withProfile(browserName, playwright, async (_context, page) => {
      await importBook(page)
      await page.getByRole('button', { name: 'Listen' }).click() // leaves the harness route: the Shell registers the worker
      await expect(page).toHaveURL(/#\/player$/)
      await expectPlaying(page)
      await page.evaluate(() => navigator.serviceWorker.ready)
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
      await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1 })

      // "Build B": a worker whose bytes differ. Prompt mode: it installs and waits.
      await writeFile(swPath, `${await readFile(backup, 'utf8')}\n// build B ${Date.now()}\n`)
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
      await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30_000 })

      await page.evaluate(() => { location.hash = '#/' })
      await expect(page.getByText('An update is ready. It installs after you stop listening, so playback isn\'t interrupted.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Restart' })).toBeDisabled()
      await page.waitForTimeout(1500)
      expect(await page.evaluate(() => ({ marker: (window as unknown as { __noReload?: number }).__noReload, paused: document.querySelector('audio')!.paused }))).toEqual({ marker: 1, paused: false })

      // Paused: nothing is being listened to, so the update can be applied.
      await page.evaluate(() => { location.hash = '#/player' })
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await page.evaluate(() => { location.hash = '#/' })
      await expect(page.getByText('An update is ready. Restart to finish installing it.')).toBeVisible()
      const restart = page.getByRole('button', { name: 'Restart' })
      await expect(restart).toBeEnabled()
      await restart.click()
      await page.waitForFunction(() => (window as unknown as { __noReload?: number }).__noReload === undefined, null, { timeout: 30_000 })
      await expect(page.getByText('Browser test').first()).toBeVisible() // Dexie metadata and OPFS audio survived the update
      expect(await page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true)
    })
  } finally {
    await copyFile(backup, swPath)
    await rm(backup, { force: true })
  }
})
