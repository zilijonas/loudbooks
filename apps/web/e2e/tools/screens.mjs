#!/usr/bin/env node
// Screen parity: each case renders a design preset (design/Loud Books App.dc.html, props set via its __dcSetProps) next to our
// route seeded with the same fixture books, stitched into .qa/screens/<case>-<width>-<theme>-<browser>.png.
// Judge by looking at the images. Servers must run (with-servers.sh); run through the memory queue.
//   node e2e/tools/screens.mjs [--only a,b] [--widths 390,1440] [--themes light,dark] [--browser chromium] [--ours-only]
import { chromium, firefox, webkit } from '@playwright/test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'

const { values: a } = parseArgs({
  options: {
    only: { type: 'string' }, widths: { type: 'string', default: '390,320,430,768,1440' }, themes: { type: 'string', default: 'light,dark' },
    browser: { type: 'string', default: 'chromium' }, axe: { type: 'boolean', default: false }, textdiff: { type: 'boolean', default: false }, out: { type: 'string', default: '.qa/screens' }, 'ours-only': { type: 'boolean', default: false },
  },
})
const DESIGN = 'http://127.0.0.1:8123/'
const APP = 'http://127.0.0.1:5173/loudbooks/'
const root = resolve(process.cwd(), '../..')
const zeland = resolve(root, 'fixtures/downloads/zeland')
const zFiles = (await readdir(zeland).catch(() => [])).filter((n) => n.endsWith('.mp3')).sort().map((n) => resolve(zeland, n))
const MANY = ['b1', 'b2', 'b5', 'b4', 'b6', 'b3']
const store = (page, patch) => page.evaluate(async (p) => (await import('/loudbooks/src/app/store.ts')).useUi.setState(p), patch)
const toast = (page, text) => page.evaluate(async (s) => (await import('/loudbooks/src/app/store.ts')).showToast(s), text)
const pwaReady = (page, needRefresh = false) => page.evaluate(async (n) => (await import('/loudbooks/src/app/store.ts')).useUi.setState({ pwa: { needRefresh: n, offlineReady: true, apply() {} } }), needRefresh)
const file = async (path, name) => ({ name, mimeType: 'audio/mpeg', buffer: await import('node:fs/promises').then((f) => f.readFile(path)) })
const demoFiles = async () => [await file(zFiles[1], 'Quiet Rooms 10 - The Attic.mp3'), await file(zFiles[2], 'Quiet Rooms 2 - The Reading Room.mp3'), await file(zFiles[0], 'Quiet Rooms 1 - The Front Door.mp3')]
const pick = async (page, files) => { await page.locator('.lb-dropzone input[type=file]').setInputFiles(files); await page.waitForFunction(() => !document.querySelector('.lb-edit-sub .lb-spin'), null, { timeout: 30_000 }) }

const toPlayer = async (p) => { await p.evaluate(() => { location.hash = '#/player' }); await p.waitForTimeout(700) }
const transferStore = (page, slice, patch) => page.evaluate(async ([slice, patch]) => {
  const { useTransfer } = await import('/loudbooks/src/features/transfer/store.ts')
  useTransfer.setState((s) => ({ [slice]: { ...s[slice], ...patch } }))
}, [slice, patch])
async function sendState(page, k) {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // The live session tries the real pairing service first; wait for it to settle, then show the preset state.
  for (let i = 0; i < 100; i++) {
    const s = await page.evaluate(async () => (await import('/loudbooks/src/features/transfer/store.ts')).useTransfer.getState().send)
    if (s.step !== 'qr' || s.link) break
    await page.waitForTimeout(100)
  }
  const bytes = await page.evaluate(async () => (await (await import('/loudbooks/src/services/db/database.ts')).db.assets.where('bookId').equals('b5').toArray()).reduce((n, a) => n + a.bytes, 0))
  const step = k === 'wrong' ? 'code' : k
  await transferStore(page, 'send', { step, link: 'https://zilijonas.github.io/loudbooks/#/receive/r/0f8fad5b-d9cb-469f-a165-70867728950e.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.mhwq1f3k', expiresAt: Date.now() + 272_000, bytesTotal: bytes, bytesDone: bytes * 0.51, fileIndex: 5, fileCount: 8, codeError: k === 'wrong' ? 'wrong' : null, triesLeft: k === 'wrong' ? 2 : 3 })
  if (k === 'wrong') await page.getByRole('textbox', { name: 'Type the code shown on your phone' }).fill('481915')
}
async function receiveState(page, k) {
  // No camera in the screenshot browser: hold the request open so the scanner shows its empty viewfinder.
  if (k === 'scanning') await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}) })
  const step = k === 'paste-error' ? 'paste' : k
  await transferStore(page, 'receive', { step, code: '482915', title: 'Moth Hours', bytesTotal: 270e6, bytesDone: 0.51 * 270e6, fileIndex: 5, fileCount: 8, bookId: 'b5', need: 270e6, free: 180e6 })
  if (k === 'paste-error') { await page.getByRole('textbox', { name: 'Pairing link' }).fill('https://example.com/book.mp3'); await page.getByRole('button', { name: 'Connect' }).click() }
}

// [name, design preset, app hash, seed, setup(page), init flags]
const CASES = [
  ['welcome', 'welcome', '#/welcome', { welcome: true }],
  ['sheet-install', 'sheet-install', '#/welcome', { welcome: true }, async (p) => store(p, { installOpen: true })],
  ['library-empty', 'library-empty', '#/', {}],
  ['library-empty-safari', 'library-empty-safari', '#/', {}, null, { safari: true }],
  ['library-one', 'library-one', '#/', { books: ['b1'] }],
  ['library-many', 'library-many', '#/', { books: MANY }],
  ['library-no-results', 'library-no-results', '#/', { books: MANY }, async (p) => p.getByRole('searchbox').fill('zebra')],
  ['library-missing', 'library-missing', '#/', { books: MANY, missing: ['b6'] }],
  ['library-new', 'library-new', '#/', { books: ['b4', 'b1', 'b2', 'b5', 'b6', 'b3'] }, async (p) => { await store(p, { newBookId: 'b4' }); await toast(p, 'Book added. Ready to listen offline.') }],
  ['library-offline', 'library-offline', '#/', { books: MANY }, async (p, ctx) => ctx.setOffline(true)],
  ['library-update', 'library-update', '#/', { books: MANY }, async (p) => pwaReady(p, true)],
  ['data-unavailable', 'data-unavailable', '#/', null, null, { noIdb: true }],
  ['add-empty', 'add-empty', '#/add', {}],
  ['add-multi', 'add-multi', '#/add', {}, async (p) => { await p.getByLabel('Title').fill('A Field Guide to Quiet Rooms'); await pick(p, await demoFiles()) }],
  ['add-reorder', 'add-reorder', '#/add', {}, async (p) => {
    await p.getByLabel('Title').fill('A Field Guide to Quiet Rooms'); await pick(p, await demoFiles())
    const box = await p.locator('.lb-grip').first().boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + 40, { steps: 4 }); await p.mouse.move(box.x + box.width / 2, box.y + 70, { steps: 4 })
  }],
  ['add-single', 'add-single', '#/add', {}, async (p) => { await p.getByLabel('Title').fill('The Orchard at the End of the Line'); await pick(p, [await file(zFiles[1], 'orchard-unabridged.m4b')]); await p.getByRole('switch').click() }],
  ['add-errors', 'add-errors', '#/add', {}, async (p) => {
    const [, b, c] = await demoFiles(); await pick(p, [b, c, { name: 'Quiet Rooms extras.flac', mimeType: 'audio/flac', buffer: Buffer.from('fLaC not really') }])
    await p.getByRole('button', { name: 'Save', exact: true }).click()
  }],
  ['add-discard', 'add-discard', '#/add', {}, async (p) => { await p.getByLabel('Title').fill('A Field Guide to Quiet Rooms'); await pick(p, await demoFiles()); await p.getByRole('button', { name: 'Cancel' }).first().click() }],
  ['edit', 'edit', '#/book/b1/edit', { books: MANY }],
  ['details', 'details', '#/book/b1', { books: MANY }],
  ['details-long', 'details-long', '#/book/b2', { books: MANY }],
  ['details-single', 'details-single', '#/book/b6', { books: MANY }],
  ['details-completed', 'details-completed', '#/book/b3', { books: MANY }],
  ['details-new', 'details-new', '#/book/b4', { books: ['b4', 'b1', 'b2', 'b5', 'b6', 'b3'] }, async (p) => { await store(p, { newBookId: 'b4' }); await toast(p, 'Book added. Ready to listen offline.') }],
  ['sheet-menu', 'sheet-menu', '#/book/b1', { books: MANY }, async (p) => p.getByRole('button', { name: 'More actions for Salt & Static' }).click()],
  ['dialog-delete', 'dialog-delete', '#/book/b2', { books: MANY }, async (p) => { await p.getByRole('button', { name: /^More actions for/ }).click(); await p.getByRole('button', { name: 'Delete book' }).click() }],
  ['settings', 'settings', '#/settings', { books: MANY, sessionBytes: 2e6 }, null, { persisted: true, standalone: true }],
  ['settings-standard', 'settings-standard', '#/settings', { books: MANY, sessionBytes: 2e6 }],
  ['settings-update', 'settings-update', '#/settings', { books: MANY, sessionBytes: 2e6 }, async (p) => pwaReady(p, true), { persisted: true, standalone: true }],
  ['dialog-clear', 'dialog-clear', '#/settings', { books: MANY, sessionBytes: 2e6 }, async (p) => { await p.getByRole('button', { name: 'Clear temporary files' }).click() }, { persisted: true, standalone: true }],
  ['dialog-delete-library', 'dialog-delete-library', '#/settings', { books: MANY }, async (p) => { await p.getByRole('button', { name: 'Delete library…' }).click(); await p.getByLabel('Type delete to confirm').fill('del') }, { persisted: true, standalone: true }],
  // Send / Receive (LB-9): the real dialog/screen, then the transfer store is set to the preset's state.
  ...['qr', 'code', 'wrong', 'connecting', 'sending', 'verifying', 'done', 'failed', 'signaling'].map((k) => [`send-${k}`, `send-${k}`, '#/book/b5', { books: MANY }, (p) => sendState(p, k)]),
  ...['intro', 'permission', 'denied', 'scanning', 'expired', 'paste', 'paste-error', 'code', 'connecting', 'receiving', 'verifying', 'success', 'disconnected', 'storage', 'duplicate', 'signaling'].map((k) => [`receive-${k}`, `receive-${k}`, '#/receive', { books: MANY }, (p) => receiveState(p, k)]),
  ['receive-safari', 'receive-safari', '#/receive', {}, null, { safari: true }],
  // Player (LB-8) and its sheets: the dev fixture route puts the player store into the design preset.
  // The fixture route sits outside the Shell; it only fills the player store, then we open the real /player route so the sidebar/dock are the real ones.
  ...['preparing', 'gesture', 'playing', 'paused', 'speed', 'chapter-timer', 'no-timer', 'rebuilding', 'ended-timer', 'ended-chapter', 'completed', 'interrupted', 'error'].map((k) => [`player-${k}`, `player-${k}`, `#/__player/${k}`, {}, toPlayer]),
  ['sheet-speed', 'sheet-speed', '#/__player/playing', {}, async (p) => { await toPlayer(p); await p.getByRole('button', { name: /^Playback speed/ }).click() }],
  ['sheet-speed-custom', 'sheet-speed-custom', '#/__player/playing', {}, async (p) => { await toPlayer(p); await p.getByRole('button', { name: /^Playback speed/ }).click(); await p.getByText('Custom', { exact: true }).click(); await p.getByLabel('Custom speed').fill('4'); await p.getByRole('button', { name: 'Set', exact: true }).click() }],
  ['sheet-timer', 'sheet-timer', '#/__player/paused', {}, async (p) => { await toPlayer(p); await p.getByRole('button', { name: /^Sleep timer/ }).click() }],
  ['sheet-timer-custom', 'sheet-timer-custom', '#/__player/paused', {}, async (p) => { await toPlayer(p); await p.getByRole('button', { name: /^Sleep timer/ }).click(); await p.getByText('Custom length', { exact: true }).click(); await p.getByRole('spinbutton', { name: 'Minutes' }).waitFor() }],
  ['sheet-chapters', 'sheet-chapters', '#/__player/paused', {}, async (p) => { await toPlayer(p); await p.getByRole('button', { name: 'Chapters', exact: true }).first().click() }],
  // library-playing / dialog-delete-playing need a real loaded book: the dev fixture's fake assets clash with the seeded books' real ones, and seeded files are empty, so
  // those states are checked in real Safari (imported audio) and by e2e/player.spec.ts instead.
  // Break-UI (ours only; no design preset).
  ['break-library', null, '#/', { books: ['long', 'q', 'huge', 'b1', 'b2', 'b5'] }],
  ['break-details-long', null, '#/book/long', { books: ['long', 'q', 'huge'] }],
  ['break-details-q', null, '#/book/q', { books: ['long', 'q', 'huge'] }],
  ['break-details-huge', null, '#/book/huge', { books: ['long', 'q', 'huge'] }],
  ['break-edit-long', null, '#/book/long/edit', { books: ['long', 'q', 'huge'] }],
]
const HEIGHT = { 320: 1500, 390: 1700, 430: 1700, 768: 1300, 1440: 1000 }
const only = a.only ? new Set(a.only.split(',')) : null
const widths = a.widths.split(',').map(Number)
const themes = a.themes.split(',')
const engines = { chromium, webkit, firefox }
const browser = await engines[a.browser].launch()
if (a.browser === 'webkit') {
  // Headless WebKit hit-tests <html> for some pointer clicks (LB-9 notes): activate through the DOM instead.
  const probe = await (await browser.newContext()).newPage()
  const proto = Object.getPrototypeOf(probe.locator('body'))
  proto.click = function () { return this.evaluate((e) => e.click()) }
  await probe.context().close()
}
const out = resolve(a.out)
await mkdir(out, { recursive: true })
const errors = []
const designPages = {}
const lastSeed = {}
async function openDesign(ctx) {
  const page = await ctx.newPage()
  await page.goto(`${DESIGN}${encodeURI('Loud Books App.dc.html')}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__dcSetProps === 'function' && window.__dcRootName?.())
  return page
}

async function shot(ctx, url, setup, wait = 500) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: console ${m.text().slice(0, 400)}`) })
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    if (setup) await setup(page)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(wait)
    return await page.screenshot({ animations: 'disabled' })
  } finally {
    await page.close()
  }
}


// Text geometry: every visible text run's box, so design and ours can be matched by text and measured (px), not just eyeballed.
const COLLECT = `(() => {
  const out = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent.replace(/\\s+/g, ' ').trim()
    if (!t) continue
    const el = n.parentElement
    if (!el || el.closest('script,style,[hidden],svg,[aria-hidden="true"]')) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    const r = document.createRange(); r.selectNodeContents(n)
    const b = r.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    out.push({ t, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 })
  }
  return out
})()`
function diffText(d, o) {
  const byText = new Map()
  for (const r of d) (byText.get(r.t) ?? byText.set(r.t, []).get(r.t)).push(r)
  const seen = new Map(); const pairs = []; let un = 0
  for (const r of o) {
    const k = seen.get(r.t) ?? 0; seen.set(r.t, k + 1)
    const m = byText.get(r.t)?.[k]
    if (m) pairs.push({ t: r.t, dx: r.x - m.x, dy: r.y - m.y, dw: r.w - m.w, dh: r.h - m.h }); else un++
  }
  const dys = pairs.map((p) => p.dy).sort((x, y) => x - y)
  const med = dys.length ? dys[Math.floor(dys.length / 2)] : 0
  // Offenders are measured against the median vertical shift, so one early offset does not flag every later line.
  const bad = pairs.filter((p) => Math.abs(p.dx) > 2 || Math.abs(p.dy - med) > 2 || Math.abs(p.dw) > 3 || Math.abs(p.dh) > 3)
  return { matched: pairs.length, unmatchedOurs: un, unmatchedDesign: d.length - pairs.length, med, bad }
}

const SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
async function newCtx(width, theme, safari) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 1000 }, colorScheme: theme, reducedMotion: 'reduce', ...(safari ? { userAgent: SAFARI_UA } : {}) })
  // Per-case flags travel in the app URL's query (?f=a,b) so one context (and its module cache) serves every case.
  await ctx.addInitScript((theme) => {
    try { localStorage.setItem('loudbooks:theme', theme) } catch { /* ignore */ }
    if (location.port !== '5173') return
    const flags = new URLSearchParams(location.search).get('f')?.split(',') ?? []
    if (flags.includes('noIdb')) indexedDB.open = () => { throw new DOMException('The user denied permission to access the database.', 'SecurityError') }
    if (flags.includes('persisted') && navigator.storage) navigator.storage.persisted = async () => true
    if (flags.includes('standalone')) { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('display-mode') ? { ...mm(q), matches: true } : mm(q)) }
  }, theme)
  return ctx
}

try {
  for (const width of widths) for (const theme of themes) {
    const ctxs = {}
    Object.keys(designPages).forEach((k) => delete designPages[k])
    Object.keys(lastSeed).forEach((k) => delete lastSeed[k])
    try {
      for (const [name, preset, hash, seed0, setup, flags = {}] of CASES) {
        // Playwright WebKit's ephemeral context refuses OPFS writes for the seeded session files: seed without them there (Clear temporary files then stays disabled).
        const seed = a.browser === 'webkit' && seed0?.sessionBytes ? { ...seed0, sessionBytes: 0 } : seed0
        if (only && !only.has(name)) continue
        const kind = flags.safari ? 'safari' : 'plain'
        const ctx = (ctxs[kind] ??= await newCtx(width, theme, flags.safari))
        const q = Object.keys(flags).filter((k) => flags[k] && k !== 'safari').join(',')
        const app = `${APP}${q ? `?f=${q}` : ''}`
        try {
          let left = null
          if (preset && !a['ours-only'] && !a.textdiff) {
            // One design page per context; presets are switched through its own prop hook.
            const dp = (designPages[kind] ??= await openDesign(ctx))
            await dp.evaluate((props) => window.__dcSetProps(window.__dcRootName(), props), { preset, theme, statusBar: false, live: false })
            await dp.waitForTimeout(650)
            left = await dp.screenshot({ animations: 'disabled' })
          }
          // Our side: seed through the dev server's own modules (once per distinct seed), then open the route.
          const seedKey = JSON.stringify(seed)
          if (seed && (seed.sessionBytes || lastSeed[kind] !== seedKey)) { // startup cleanup clears seeded sessions, so those seeds always re-run
            const page = await ctx.newPage()
            await page.goto(`${APP}#/__seed`, { waitUntil: 'networkidle' })
            await page.evaluate(async (s) => (await import('/loudbooks/e2e/tools/seed.ts')).seed(s), seed)
            await page.close()
            lastSeed[kind] = seedKey
          }
          if (a.textdiff) {
            if (!preset) continue
            // Layout parity in numbers: match text runs between design and ours and report position/size deltas.
            const dp = (designPages[kind] ??= await openDesign(ctx))
            await dp.evaluate((props) => window.__dcSetProps(window.__dcRootName(), props), { preset, theme, statusBar: false, live: false })
            await dp.waitForTimeout(650)
            const d = await dp.evaluate(COLLECT)
            const page = await ctx.newPage()
            try {
              await page.goto(`${app}${hash}`, { waitUntil: 'networkidle' })
              await page.waitForTimeout(300)
              if (!seed?.welcome && seed) await pwaReady(page)
              if (setup) await setup(page, ctx)
              await page.waitForTimeout(800)
              const r = diffText(d, await page.evaluate(COLLECT))
              console.log(`${r.bad.length ? 'DIFF' : 'ok  '} ${name}-${width} matched=${r.matched} only-ours=${r.unmatchedOurs} only-design=${r.unmatchedDesign} medianDy=${r.med.toFixed(1)}${r.bad.length ? `\n   ${r.bad.slice(0, 8).map((p) => `"${p.t.slice(0, 40)}" dx=${p.dx.toFixed(1)} dy=${p.dy.toFixed(1)} dw=${p.dw.toFixed(1)} dh=${p.dh.toFixed(1)}`).join('\n   ')}${r.bad.length > 8 ? `\n   ... +${r.bad.length - 8} more` : ''}` : ''}`)
            } finally { await page.close(); await ctx.setOffline(false) }
            continue
          }
          if (a.axe) {
            // Accessibility mode: same states, but run axe (WCAG 2.x A/AA) on our page instead of taking pictures.
            const page = await ctx.newPage()
            try {
              await page.goto(`${app}${hash}`, { waitUntil: 'networkidle' })
              await page.waitForTimeout(300)
              if (!seed?.welcome && seed) await pwaReady(page)
              if (setup) await setup(page, ctx)
              await page.waitForTimeout(900)
              await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') })
              const v = await page.evaluate(async () => (await window.axe.run({ exclude: ['.lb-cover'] }, { resultTypes: ['violations'], runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], rules: { 'label-content-name-mismatch': { enabled: false } } })).violations.map((x) => `${x.impact} ${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`))
              console.log(`${v.length ? 'VIOLATIONS' : 'ok'} ${name}-${width}-${theme}${v.length ? `\n  ${v.join('\n  ')}` : ''}`)
            } finally { await page.close(); await ctx.setOffline(false) }
            continue
          }
          const right = await shot(ctx, `${app}${hash}`, async (page) => {
            await page.waitForTimeout(300)
            if (!seed?.welcome && seed) await pwaReady(page)
            if (setup) await setup(page, ctx)
          })
          await ctx.setOffline(false)
          const page = await ctx.newPage()
          const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`
          await page.setViewportSize({ width: (left ? width * 2 + 48 : width + 32), height: 400 })
          await page.setContent(`<body style="margin:0;background:${theme === 'dark' ? '#000' : '#fff'};font:600 13px system-ui;color:#888"><div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
            ${left ? `<figure style="margin:0"><figcaption>design · ${preset}</figcaption><img src="${b64(left)}" style="width:${width}px;display:block;outline:1px solid #f0f"></figure>` : ''}
            <figure style="margin:0"><figcaption>ours · ${name} · ${a.browser}</figcaption><img src="${b64(right)}" style="width:${width}px;display:block;outline:1px solid #0af"></figure></div></body>`)
          await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
          const f = join(out, `${name}-${width}-${theme}-${a.browser}.png`)
          await writeFile(f, await page.screenshot({ fullPage: true }))
          await page.close()
          console.log(f)
        } catch (e) {
          console.log(`FAILED ${name}-${width}-${theme}: ${(process.env.DEBUG ? e.message : e.message.split('\n')[0])}`)
          await ctx.setOffline(false).catch(() => {})
        }
      }
    } finally {
      for (const c of Object.values(ctxs)) await c.close()
    }
  }
} finally {
  await browser.close()
}
if (errors.length) console.log(`page errors:\n${[...new Set(errors)].join('\n')}`)
