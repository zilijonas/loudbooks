import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext } from '@playwright/test'

// Welcome → add a 3-chapter book (real import into OPFS) → reorder → save → details → rename → delete.
test('create, reorder, rename and delete a book', async ({ playwright, browserName }) => {
  test.setTimeout(180_000)
  const zeland = resolve(process.cwd(), '../../fixtures/downloads/zeland')
  test.skip(!existsSync(zeland), 'Downloaded Zeland fixtures are not installed (fixtures/README.md)')
  const files = (await readdir(zeland)).filter((n) => n.endsWith('.mp3')).sort().slice(0, 3).map((n) => resolve(zeland, n))
  // OPFS needs a persistent profile in WebKit (ephemeral contexts reject navigator.storage.getDirectory).
  const profile = await mkdtemp(resolve(tmpdir(), 'loudbooks-flow-'))
  let context: BrowserContext | undefined
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto('http://localhost:4173/loudbooks/')

    await expect(page.getByRole('heading', { level: 1, name: 'Your books. Your pace.' })).toBeVisible()
    await page.getByRole('button', { name: 'Open my library' }).click()
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()
    await page.getByRole('button', { name: 'Add book' }).click()

    await page.getByRole('textbox', { name: 'Title Required' }).fill('Zeland test')
    await page.locator('input[type=file][multiple]').setInputFiles(files)
    const rows = page.getByRole('list', { name: 'Chapters' }).locator('input')
    await expect(rows).toHaveCount(3)
    await expect(page.getByText('Checking file…')).toHaveCount(0, { timeout: 60_000 })
    const [first, second, third] = await rows.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))
    await page.getByRole('button', { name: `Move ${first} down` }).click()
    await expect(rows.first()).toHaveValue(second!)

    await page.getByRole('button', { name: 'Save book' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Zeland test' })).toBeVisible({ timeout: 120_000 })
    await expect(page).toHaveURL(/#\/book\/[\w-]+$/)
    await expect(page.getByRole('status').filter({ hasText: 'Book added. Ready to listen offline.' })).toBeVisible()
    const chapters = page.getByRole('list', { name: 'Chapters' }).getByRole('button')
    await expect(chapters).toHaveCount(3)
    await expect(chapters.nth(0)).toContainText(second!)
    await expect(chapters.nth(1)).toContainText(first!)
    await expect(chapters.nth(2)).toContainText(third!)

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'Title Required' }).fill('Zeland renamed')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Zeland renamed' })).toBeVisible()
    await expect(chapters.nth(0)).toContainText(second!)

    await page.getByRole('button', { name: 'More actions for Zeland renamed' }).click()
    await page.getByRole('button', { name: 'Delete book' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete book' }).click()
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()
    // Audio files are gone from OPFS, not just hidden.
    const left = await page.evaluate(async () => {
      const names: string[] = []
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
        for await (const [name, handle] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
          if (handle.kind === 'file') names.push(prefix + name)
          else await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`)
        }
      }
      await walk(await navigator.storage.getDirectory(), '')
      // Only book/import files: WebKit can keep other suites' session files for this origin outside the profile.
      return names.filter((n) => /\/(books|staging)\//.test(n))
    })
    expect(left).toEqual([])
  } finally {
    try { await context?.close() } finally { await rm(profile, { recursive: true, force: true }) }
  }
})
