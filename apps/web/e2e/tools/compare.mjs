#!/usr/bin/env node
// Side-by-side visual compare: a design page region | our route region, stitched into one PNG under .qa/.
// Parity is judged by looking at these images; no pixel-diff verdict.
//
// Usage (servers must already run; see e2e/tools/README in the LB-3 evidence for the memory-queue wrapper):
//   node e2e/tools/compare.mjs --name button --section "Button" --width 390 --theme dark
//   node e2e/tools/compare.mjs --name lib --design "Screens.dc.html" --design-sel "[data-screen-label=Library]" \
//        --app "#/" --app-sel "main" --width 390
// Options:
//   --design <path|url>    page under the design server (default "Component Library.dc.html")
//   --app <hash|url>       route on the app server (default "#/__gallery")
//   --section <h2 text>    crop both pages to <section> whose h2 has this exact text
//   --design-sel / --app-sel  CSS selectors to crop instead (override --section per side)
//   --width <px>  --height <px>  --theme light|dark  --browser chromium|webkit|firefox  --dpr <n>
//   --design-base / --app-base  server roots (defaults http://127.0.0.1:8123/ and http://127.0.0.1:5173/loudbooks/)
//   --out <dir>  (default .qa)   --name <file stem>
import { chromium, firefox, webkit } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: a } = parseArgs({
  options: {
    design: { type: 'string', default: 'Component Library.dc.html' },
    app: { type: 'string', default: '#/__gallery' },
    section: { type: 'string' },
    'design-sel': { type: 'string' },
    'app-sel': { type: 'string' },
    width: { type: 'string', default: '390' },
    height: { type: 'string', default: '900' },
    theme: { type: 'string', default: 'light' },
    browser: { type: 'string', default: 'chromium' },
    dpr: { type: 'string', default: '1' },
    'design-base': { type: 'string', default: 'http://127.0.0.1:8123/' },
    'app-base': { type: 'string', default: 'http://127.0.0.1:5173/loudbooks/' },
    out: { type: 'string', default: '.qa' },
    name: { type: 'string' },
  },
})

const width = Number(a.width)
const dark = a.theme === 'dark'
const url = (base, p) => (/^https?:/.test(p) ? p : new URL(p.startsWith('#') ? p : encodeURI(p), base).href)
const sectionSel = (text) => `section:has(> h2:text-is(${JSON.stringify(text)}))`
const engines = { chromium, webkit, firefox }
const name = a.name ?? `${(a.section ?? 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${width}-${a.theme}-${a.browser}`

const browser = await engines[a.browser].launch()
const errors = []
try {
  const ctx = await browser.newContext({
    viewport: { width, height: Number(a.height) },
    deviceScaleFactor: Number(a.dpr),
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce', // settle transitions so captures are never mid-animation
  })
  // Our app reads the theme preference before first paint.
  await ctx.addInitScript((t) => { try { localStorage.setItem('loudbooks:theme', t) } catch { /* ignore */ } }, a.theme)

  async function shoot(target, sel, setup) {
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`${target}: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && errors.push(`${target}: ${m.text()}`))
    try {
      await page.goto(target, { waitUntil: 'networkidle' })
      if (setup) await setup(page)
      await page.evaluate(() => document.fonts.ready)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(600)
      const el = sel ? page.locator(sel).first() : null
      return el ? await el.screenshot({ animations: 'disabled' }) : await page.screenshot({ fullPage: true, animations: 'disabled' })
    } finally {
      await page.close()
    }
  }

  const designSel = a['design-sel'] ?? (a.section ? sectionSel(a.section) : null)
  const appSel = a['app-sel'] ?? (a.section ? sectionSel(a.section) : null)
  // Design pages switch theme with their own Light/Dark radio (Component Library) when present.
  const designSetup = async (page) => {
    const radio = page.getByRole('radio', { name: dark ? 'Dark' : 'Light', exact: true }).first()
    if (await radio.count()) await radio.click()
  }
  const left = await shoot(url(a['design-base'], a.design), designSel, designSetup)
  const right = await shoot(url(a['app-base'], a.app), appSel)

  // Stitch in the browser: no image dependency.
  const page = await ctx.newPage()
  const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`
  await page.setViewportSize({ width: width * 2 + 48, height: 400 })
  await page.setContent(`<body style="margin:0;background:${dark ? '#000' : '#fff'};font:600 13px system-ui;color:#888">
    <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
      <figure style="margin:0"><figcaption>design</figcaption><img src="${b64(left)}" style="width:${width}px;display:block;outline:1px solid #f0f"></figure>
      <figure style="margin:0"><figcaption>ours · ${a.browser}</figcaption><img src="${b64(right)}" style="width:${width}px;display:block;outline:1px solid #0af"></figure>
    </div></body>`)
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
  const out = resolve(a.out)
  await mkdir(out, { recursive: true })
  const file = join(out, `${name}.png`)
  await writeFile(file, await page.screenshot({ fullPage: true }))
  await page.close()
  console.log(file)
  if (errors.length) console.log(`console errors:\n${errors.join('\n')}`)
} finally {
  await browser.close()
}
