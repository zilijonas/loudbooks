import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext } from '@playwright/test'

test('edit chapters and single-file parts', async ({ playwright, browserName }) => {
  test.setTimeout(240_000)
  const directory = resolve(process.cwd(), '../../fixtures/downloads/zeland')
  test.skip(!existsSync(directory), 'Downloaded Zeland fixtures are not installed')
  const files = (await readdir(directory)).filter(name => name.endsWith('.mp3')).sort().map(name => resolve(directory, name))
  const profile = await mkdtemp(resolve(tmpdir(), 'loudbooks-edit-'))
  let context: BrowserContext | undefined
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto('http://localhost:4173/loudbooks/')
    await page.getByRole('button', { name: 'Open my library' }).click()
    await page.getByRole('button', { name: 'Add book' }).click()
    await page.getByRole('textbox', { name: 'Title Required' }).fill('Zeland edit')
    await page.locator('input[type=file][multiple]').setInputFiles(files.slice(0, 3))
    await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Save book' }).click()
    await expect(page.getByRole('heading', { name: 'Zeland edit', level: 1 })).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.locator('input[type=file][multiple]').setInputFiles(files[3]!)
    await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
    const rows = page.getByRole('list', { name: 'Chapters' }).locator('input')
    await expect(rows).toHaveCount(4)
    const removed = await rows.nth(1).inputValue()
    await page.getByRole('button', { name: `Remove ${removed}` }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Zeland edit', level: 1 })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('list', { name: 'Chapters' }).getByRole('button')).toHaveCount(3)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Chapters' }).locator('input')).toHaveCount(3)
    await expect(page.getByRole('button', { name: `Remove ${removed}` })).toHaveCount(0)

    await page.goto('http://localhost:4173/loudbooks/#/')
    await page.getByRole('button', { name: 'Add book' }).click()
    await page.getByRole('textbox', { name: 'Title Required' }).fill('Zeland single')
    await page.locator('input[type=file][multiple]').setInputFiles(files[4]!)
    await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Save book' }).click()
    await expect(page.getByRole('heading', { name: 'Zeland single', level: 1 })).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('switch', { name: 'Show 30-minute parts' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Zeland single', level: 1 })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('list', { name: 'Parts' }).getByRole('button')).toHaveCount(2)

    await page.goto('http://localhost:4173/loudbooks/#/')
    await page.getByRole('button', { name: 'Add book' }).click()
    await page.getByRole('textbox', { name: 'Title Required' }).fill('Playing edit')
    await page.locator('input[type=file][multiple]').setInputFiles(files[0]!)
    await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Save book' }).click()
    await expect(page.getByRole('heading', { name: 'Playing edit', level: 1 })).toBeVisible({ timeout: 120_000 })
    const detailHash = new URL(page.url()).hash
    await page.getByRole('button', { name: 'Play from the start' }).click()
    await expect.poll(() => page.evaluate(() => !document.querySelector('audio')!.paused), { timeout: 60_000 }).toBe(true)
    await page.evaluate(hash => { location.hash = hash }, detailHash)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('switch', { name: 'Show 30-minute parts' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { name: 'Playing edit', level: 1 })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Your session will be prepared again' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.querySelector('audio')!.getAttribute('src'))).toBeNull()
  } finally {
    try { await context?.close() } finally { await rm(profile, { recursive: true, force: true }) }
  }
})
