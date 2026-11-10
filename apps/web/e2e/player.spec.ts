// Listening sessions with real audio: timer stop + 5 s rewind once, chapter-end stop, navigation, reload restore.
// The file end is the stop: the test only moves the element's position close to the end (like an OS scrub) and
// lets the real file run out. Persistent contexts: WebKit refuses OPFS in ephemeral ones.
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { needsPlayTap } from "./play-tap";

const root = resolve(process.cwd(), '../..')
const sample = resolve(root, 'audio_samples/book-short.mp3')
const zeland = resolve(root, 'fixtures/downloads/zeland')
const app = 'http://localhost:4173/loudbooks/'

const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector('audio')!
    return { time: a.currentTime, duration: a.duration, paused: a.paused }
  })
const slider = (page: Page) => page.getByRole('slider', { name: 'Position in chapter' })
const sliderNow = async (page: Page) => Number(await slider(page).getAttribute('aria-valuenow'))

/** Play started, or the browser asked for one more tap (the play button is back after preparing): tap it. */
async function expectPlaying(page: Page) {
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  const ready = page.getByRole('button', { name: 'Play', exact: true })
  await expect(pause.or(ready)).toBeVisible({ timeout: 60_000 })
  if (await needsPlayTap(ready)) await ready.click()
  await expect(pause).toBeVisible()
  await expect.poll(async () => (await audioState(page)).paused).toBe(false)
}

/** Lets the prepared file run out on its own, from 1 s (media) before its end. */
async function runToEnd(page: Page) {
  await page.evaluate(() => { const a = document.querySelector('audio')!; a.currentTime = a.duration - 1 })
}

async function importAndListen(page: Page, files: string[]) {
  await page.goto(`${app}#/__harness/import`)
  await page.getByLabel('Audio files').setInputFiles(files)
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('status')).toHaveText(/^(ready|error:)/, { timeout: 150_000 })
  expect(await page.getByTestId('status').innerText()).toBe('ready')
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page).toHaveURL(/#\/player$/)
  await expectPlaying(page)
}

test('listening sessions stop at the file end and resume by the rules', async ({ playwright, browserName }) => {
  test.skip(!existsSync(sample) || !existsSync(zeland), 'External audio fixtures are not installed')
  test.setTimeout(300_000)
  const profile = await mkdtemp(resolve(tmpdir(), 'loudbooks-player-'))
  let context: BrowserContext | undefined
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await test.step('5-minute timer at 2x ends with the file, then resumes 5 s earlier once', async () => {
      await importAndListen(page, [sample])
      await page.getByRole('button', { name: /^Playback speed, / }).click()
      await page.locator('.lb-seg label', { hasText: 'Custom' }).click()
      await page.getByLabel('Custom speed').fill('2')
      await page.getByRole('button', { name: 'Set', exact: true }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /^Sleep timer, / }).click()
      await page.locator('button.lb-timer-opt', { hasText: /^5 minutes/ }).click()
      await expectPlaying(page)
      await expect(page.getByRole('button', { name: /of listening left/ })).toBeVisible()
      const { time, duration } = await audioState(page)
      expect(duration).toBeGreaterThan(590) // 5 min at 2x = 600 s of the book
      expect(duration).toBeLessThan(610)
      const end = (await sliderNow(page)) + (duration - time)
      await runToEnd(page)
      await expect(page.getByText('Your 5 minutes are up')).toBeVisible({ timeout: 15_000 })
      expect((await audioState(page)).paused).toBe(true)
      await page.getByRole('button', { name: 'Keep listening' }).click()
      await expect(page.getByText('Starting 5 seconds earlier so you can pick up the thread.')).toBeVisible()
      await expectPlaying(page)
      expect(Math.abs((await sliderNow(page)) - (end - 5))).toBeLessThanOrEqual(2)
      // Pause and play again: same place, no second rewind.
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      const paused = await sliderNow(page)
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await expectPlaying(page)
      expect(await sliderNow(page)).toBeGreaterThanOrEqual(paused - 0.5)
    })

    await test.step('Library <-> Player keeps the audio playing', async () => {
      const before = (await audioState(page)).time
      await page.evaluate(() => { location.hash = '#/' })
      await expect(page.getByRole('button', { name: 'Now playing: Browser test' })).toBeVisible()
      await page.waitForTimeout(1500)
      const away = await audioState(page)
      expect(away.paused).toBe(false)
      expect(away.time).toBeGreaterThan(before + 1)
      await page.getByRole('button', { name: 'Now playing: Browser test' }).click()
      await expect(page).toHaveURL(/#\/player$/)
      expect((await audioState(page)).paused).toBe(false)
    })

    await test.step('reload during playback restores the last position', async () => {
      const before = await sliderNow(page)
      await page.reload()
      await expect(slider(page)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
      const after = await sliderNow(page)
      expect(after).toBeGreaterThanOrEqual(before - 6) // last checkpoint: <= 5 s old, pagehide usually exact
      expect(after).toBeLessThanOrEqual(before + 2)
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await expectPlaying(page)
      expect(await sliderNow(page)).toBeGreaterThanOrEqual(after - 0.5) // WebKit re-reads MP3 positions with tiny float drift
    })

    await test.step('chapter-end stop resumes at the start of the next chapter', async () => {
      const chapters = (await readdir(zeland)).filter((n) => n.endsWith('.mp3')).sort().slice(0, 3).map((n) => resolve(zeland, n))
      await importAndListen(page, chapters)
      await expect(page.getByText(/^Chapter 1 of 3/)).toBeVisible()
      await page.getByRole('button', { name: /^Sleep timer, / }).click()
      await page.locator('button.lb-timer-opt', { hasText: /^One chapter/ }).click()
      await expectPlaying(page)
      await runToEnd(page)
      await expect(page.getByText('Stopped after Chapter 1')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Play Chapter 2' }).click()
      await expect(page.getByText('Starting the next chapter from the beginning.')).toBeVisible()
      await expectPlaying(page)
      await expect(page.getByText(/^Chapter 2 of 3/)).toBeVisible()
      expect(await sliderNow(page)).toBeLessThanOrEqual(3)
    })

    expect(errors).toEqual([])
  } finally {
    try { await context?.close() } finally { await rm(profile, { recursive: true, force: true }) }
  }
})
