// Direct transfer between two browser contexts through a local `wrangler dev` signaling Worker
// (playwright.transfer.config.ts). A imports two books; B receives them over WebRTC via the paste-link route.
// Covers: wrong code 3x locks the room, a 3-file book and a 30 MB book arrive with identical bytes and play,
// cancel mid-transfer then pair again, duplicate prompt (Keep both).
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const root = resolve(process.cwd(), '../..')
const long = resolve(root, 'audio_samples/book-long.mp3')
const zeland = resolve(root, 'fixtures/downloads/zeland')
const app = 'http://localhost:4173/loudbooks/'
const sha = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')

async function importBook(page: Page, files: string[]) {
  await page.goto(`${app}#/__harness/import`)
  await page.getByLabel('Audio files').setInputFiles(files)
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('status')).toHaveText(/^(ready|error:)/, { timeout: 150_000 })
  expect(await page.getByTestId('status').innerText()).toBe('ready')
}

const bookCount = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('loud-books-v1'); q.onsuccess = () => r(q.result) })
  const n = await new Promise<number>((r) => { const q = db.transaction('books').objectStore('books').count(); q.onsuccess = () => r(q.result) })
  db.close()
  return n
})

const newestBook = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('loud-books-v1'); q.onsuccess = () => r(q.result) })
  const all: { id: string; createdAt: number }[] = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result) })
  db.close()
  return all.sort((x, y) => y.createdAt - x.createdAt)[0]!.id
})

/** SHA-256 of every audio file in this origin's OPFS library, and whether transfer staging is empty. */
const opfs = (page: Page) => page.evaluate(async () => {
  const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
  const files: { path: string; sha: string }[] = []
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`)
      else files.push({ path: prefix + name, sha: hex(await crypto.subtle.digest('SHA-256', await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer())) })
    }
  }
  await walk(await (await (await navigator.storage.getDirectory()).getDirectoryHandle('loud-books')).getDirectoryHandle('v1'), '')
  return files
})

/** A opens Send for the book shown at `bookUrl`, B pastes the link. Returns the code B shows. */
async function pair(a: Page, b: Page, bookUrl: string, again = false) {
  await a.goto(bookUrl)
  const send = a.getByRole('button', { name: 'Send', exact: true })
  await expect(send).toHaveCount(1) // the previous details page has finished its exit
  await send.click()
  const dialog = a.getByRole('dialog', { name: 'Send to another device' })
  await expect(dialog.getByRole('img', { name: 'Tap Receive and scan this code.' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Copy pairing link' }).click()
  const link = await a.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/^http:\/\/localhost:4173\/loudbooks\/#\/receive\/r\//)
  if (again) {
    // After a lost connection: Pair again goes to the camera. This browser has none, so it lands on the
    // camera-off state, whose primary action is the paste route.
    await b.getByRole('button', { name: 'Pair again' }).click()
    await b.getByRole('button', { name: 'Continue' }).click()
    await expect(b.getByRole('heading', { name: 'Camera access is off' })).toBeVisible()
  } else {
    await b.goto(`${app}#/`)
    await b.getByRole('button', { name: /^Receive/ }).first().click()
  }
  await b.getByRole('button', { name: 'Paste pairing link instead' }).click()
  await b.getByRole('textbox', { name: 'Pairing link' }).fill(link)
  await b.getByRole('button', { name: 'Connect' }).click()
  const code = b.getByRole('img', { name: /^Pairing code/ })
  await expect(code).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByRole('textbox', { name: 'Type the code shown on your phone' })).toBeVisible()
  return { dialog, code: (await code.getAttribute('aria-label'))!.replace(/\D/g, '') }
}

test('send books between two devices: wrong code lock, full transfer, cancel and pair again', async ({ playwright, browserName }) => {
  test.setTimeout(600_000)
  test.skip(!existsSync(long) || !existsSync(zeland), 'External audio fixtures are not installed')
  const three = (await readdir(zeland)).filter((n) => n.endsWith('.mp3')).sort().slice(0, 3).map((n) => resolve(zeland, n))
  const dirs = [await mkdtemp(resolve(tmpdir(), 'loudbooks-tx-a-')), await mkdtemp(resolve(tmpdir(), 'loudbooks-tx-b-'))]
  const contexts: BrowserContext[] = []
  try {
    const open = async (dir: string, width: number, name: string) => {
      const ctx = await playwright[browserName].launchPersistentContext(dir, { headless: true, viewport: { width, height: 900 }, channel: test.info().project.use.channel })
      contexts.push(ctx)
      const page = ctx.pages()[0] ?? await ctx.newPage()
      page.on('pageerror', (e) => { throw e })
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log(`[${name}] ${m.text()}`) })
      return page
    }
    const a = await open(dirs[0]!, 1280, 'A')
    const b = await open(dirs[1]!, 390, 'B')
    if (browserName === 'chromium') await contexts[0]!.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' })
    // Test-only "slow disk" on the sender so a 30 MB transfer lasts long enough to cancel in the middle.
    await a.addInitScript(() => {
      const read = Blob.prototype.arrayBuffer
      Blob.prototype.arrayBuffer = async function (this: Blob) {
        if ((window as { slowRead?: boolean }).slowRead) await new Promise((r) => setTimeout(r, 250))
        return read.call(this)
      }
    })
    await b.goto(app)
    await b.getByRole('button', { name: 'Open my library' }).click()

    await importBook(a, three)
    const zelandUrl = `${app}#/book/${await newestBook(a)}`
    await importBook(a, [long])
    const longUrl = `${app}#/book/${await newestBook(a)}`

    await test.step('wrong code three times locks the room', async () => {
      const { dialog, code } = await pair(a, b, zelandUrl)
      const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
      const input = dialog.getByRole('textbox', { name: 'Type the code shown on your phone' })
      const go = dialog.getByRole('button', { name: 'Pair and send' })
      await input.fill(wrong); await go.click()
      await expect(dialog.getByRole('alert')).toHaveText("That code doesn't match. 2 tries left.")
      await input.fill(wrong); await go.click()
      await expect(dialog.getByRole('alert')).toHaveText("That code doesn't match. 1 try left.")
      await input.fill(wrong); await go.click()
      await expect(dialog.getByRole('alert')).toHaveText('Too many tries. Close this and choose Send again for a new code.')
      await expect(go).toBeDisabled()
      await expect(b.getByRole('heading', { name: 'This code has expired' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Close' }).click()
    })

    await test.step('3-file book arrives verified and plays', async () => {
      const { dialog, code } = await pair(a, b, zelandUrl)
      await dialog.getByRole('textbox', { name: 'Type the code shown on your phone' }).fill(code)
      await dialog.getByRole('button', { name: 'Pair and send' }).click()
      await expect(b.getByRole('heading', { name: 'Your book is ready to listen offline' })).toBeVisible({ timeout: 120_000 })
      await expect(dialog.getByRole('heading', { name: 'Sent' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Done' }).click()
      const want = await Promise.all(three.map(sha))
      const got = (await opfs(b)).map((f) => f.sha)
      for (const h of want) expect(got).toContain(h)
      await b.getByRole('button', { name: 'Open book' }).click()
      await expect(b.getByRole('heading', { level: 1, name: 'Browser test' })).toBeVisible()
      await expect(b.getByRole('list', { name: 'Chapters' }).getByRole('button')).toHaveCount(3)
      await b.getByRole('button', { name: /^Play from the start|^Listen/ }).first().click()
      await expect(b).toHaveURL(/#\/player$/)
      const ready = b.getByRole('button', { name: 'Ready — play' })
      const pause = b.getByRole('button', { name: 'Pause', exact: true })
      await expect(pause.or(ready)).toBeVisible({ timeout: 60_000 })
      if (await ready.isVisible()) await ready.click()
      await expect.poll(() => b.evaluate(() => document.querySelector('audio')!.currentTime), { timeout: 20_000 }).toBeGreaterThan(0.5)
      await pause.click()
    })

    await test.step('cancel mid-transfer, pair again, duplicate prompt, 30 MB arrives verified', async () => {
      await a.evaluate(() => { (window as { slowRead?: boolean }).slowRead = true })
      let { dialog, code } = await pair(a, b, longUrl)
      await dialog.getByRole('textbox', { name: 'Type the code shown on your phone' }).fill(code)
      await dialog.getByRole('button', { name: 'Pair and send' }).click()
      // Same title as the first book: B asks first.
      await expect(b.getByRole('heading', { name: 'You already have this book' })).toBeVisible({ timeout: 60_000 })
      await b.getByRole('button', { name: 'Keep both' }).click()
      await expect(b.getByRole('heading', { name: 'Receiving Browser test' })).toBeVisible()
      await expect.poll(async () => Number(await b.getByRole('progressbar').getAttribute('aria-valuenow')), { timeout: 60_000 }).toBeGreaterThan(5)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await a.getByRole('alertdialog').getByRole('button', { name: 'Stop sending' }).click()
      await expect(dialog).toBeHidden()
      await expect(b.getByRole('heading', { name: 'Connection lost' })).toBeVisible({ timeout: 30_000 })
      // Nothing half-received reached the library.
      expect(await bookCount(b)).toBe(1)

      await a.evaluate(() => { (window as { slowRead?: boolean }).slowRead = false });
      ({ dialog, code } = await pair(a, b, longUrl, true))
      await dialog.getByRole('textbox', { name: 'Type the code shown on your phone' }).fill(code)
      await dialog.getByRole('button', { name: 'Pair and send' }).click()
      await b.getByRole('button', { name: 'Keep both' }).click()
      await expect(b.getByRole('heading', { name: 'Your book is ready to listen offline' })).toBeVisible({ timeout: 180_000 })
      await expect(dialog.getByRole('heading', { name: 'Sent' })).toBeVisible()
      const files = await opfs(b)
      expect(files.map((f) => f.sha)).toContain(await sha(long))
      // Transfer staging is gone once the book is committed.
      expect(files.filter((f) => f.path.startsWith('staging/') && /^staging\/[^/]+\/\d+$/.test(f.path))).toEqual([])
      await b.getByRole('status').getByRole('button', { name: 'Back to library' }).click()
      await expect(b.getByRole('listitem').filter({ hasText: 'Browser test' })).toHaveCount(2)
    })
  } finally {
    for (const c of contexts) await c.close().catch(() => {})
    for (const d of dirs) await rm(d, { recursive: true, force: true })
  }
})
