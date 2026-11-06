#!/usr/bin/env node
// Motion smoothness trace: runs real interactions on the dev app (seeded with the design books) and reports, per scenario,
// the rAF frame deltas (max, frames over 50 ms), long tasks (Chromium only) and every inline-style property Motion animated.
// Anything other than transform/opacity (and the Radix/Motion bookkeeping below) is layout-animating and needs fixing.
// Needs with-servers.sh and the memory queue:  node e2e/tools/frames.mjs [--browser chromium|webkit] [--width 390]
import { chromium, webkit } from '@playwright/test'
import { parseArgs } from 'node:util'

const { values: a } = parseArgs({ options: { browser: { type: 'string', default: 'chromium' }, width: { type: 'string', default: '390' } } })
const APP = 'http://127.0.0.1:5173/loudbooks/'
const width = Number(a.width)
const browser = await { chromium, webkit }[a.browser].launch()
const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, reducedMotion: 'no-preference', deviceScaleFactor: 2 })
await ctx.addInitScript(() => {
  window.__trace = null
  window.__traceStart = () => {
    const t = { frames: [], long: [], props: {}, t0: performance.now() }
    window.__trace = t
    let last = performance.now()
    const tick = (now) => { if (window.__trace !== t) return; t.frames.push(now - last); last = now; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    try { t.po = new PerformanceObserver((l) => l.getEntries().forEach((e) => t.long.push(Math.round(e.duration)))); t.po.observe({ entryTypes: ['longtask'] }) } catch { /* WebKit has no longtask */ }
    const parse = (s) => Object.fromEntries((s || '').split(';').map((x) => x.split(/:(.*)/s)).filter((x) => x[1] !== undefined).map(([k, v]) => [k.trim(), v.trim()]))
    t.mo = new MutationObserver((ms) => ms.forEach((m) => {
      const before = parse(m.oldValue), after = parse(m.target.getAttribute('style'))
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[k] !== after[k]) t.props[k] = (t.props[k] || 0) + 1
    }))
    t.mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true })
  }
  window.__traceStop = () => {
    const t = window.__trace; window.__trace = null; t.po?.disconnect(); t.mo.disconnect()
    const f = t.frames.slice(1)
    return { frames: f.length, max: Math.round(Math.max(0, ...f)), over50: f.filter((d) => d > 50).length, over34: f.filter((d) => d > 34).length, long: t.long, props: t.props }
  }
})

const seed = async (page) => {
  await page.goto(`${APP}#/__seed`, { waitUntil: 'networkidle' })
  await page.evaluate(async () => (await import('/loudbooks/e2e/tools/seed.ts')).seed({ books: ['b1', 'b2', 'b5', 'b4', 'b6', 'b3'] }))
}
const page = await ctx.newPage()
const out = []
// Headless WebKit hit-tests <html> for some pointer clicks (see LB-9 notes): activate through the DOM there.
const tap = (loc) => (a.browser === 'webkit' ? loc.evaluate((e) => e.click()) : loc.click({ timeout: 5000 }))
async function run(name, act) {
  await page.evaluate(() => window.__traceStart())
  await act()
  await page.waitForTimeout(900)
  out.push({ name, ...(await page.evaluate(() => window.__traceStop())) })
}
const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(900) }
try {
  await seed(page)
  await go('#/')
  await run('library -> details (shared cover)', () => tap(page.locator('.lb-card-open').first()))
  await run('details -> library (back)', () => tap(page.getByRole('button', { name: 'Library', exact: true })))
  await go('#/book/b1')
  await run('details: open book sheet', () => tap(page.getByRole('button', { name: /^More actions for/ }).first()))
  await run('details: close book sheet (Escape)', () => page.keyboard.press('Escape'))
  await go('#/settings')
  await run('settings: open delete-library dialog', () => tap(page.getByRole('button', { name: 'Delete library…' })))
  await run('settings: close dialog', () => page.keyboard.press('Escape'))
  await go('#/__player/playing')
  await go('#/')
  await run('dock -> player (shared cover)', () => tap(page.locator('.lb-mini-open, .lb-playerbar-open').first()))
  await run('player: open speed sheet', () => tap(page.getByRole('button', { name: /^Playback speed/ })))
  await run('player: close speed sheet', () => page.keyboard.press('Escape'))
  await run('player: open timer sheet', () => tap(page.getByRole('button', { name: /^Sleep timer/ })))
  await run('player: close timer sheet', () => page.keyboard.press('Escape'))
  await run('player -> library (dock returns)', () => tap(page.getByRole('button', { name: 'Close player' })))
  await go('#/add')
  await run('add: pick files + chapter rows', async () => { await page.locator('.lb-dropzone input[type=file]').setInputFiles([]) })
} finally {
  await browser.close()
}
const ok = new Set(['transform', 'opacity', '--lb-dock', 'pointer-events', 'will-change', 'z-index', 'visibility', 'display', 'transform-origin', 'translate', 'scale', 'rotate'])
for (const r of out) {
  const bad = Object.keys(r.props).filter((k) => !ok.has(k))
  console.log(`${r.name.padEnd(42)} frames=${String(r.frames).padStart(3)} max=${String(r.max).padStart(3)}ms >34ms=${r.over34} >50ms=${r.over50} long=[${r.long}]${bad.length ? `  NON-COMPOSITOR: ${bad.map((k) => `${k}x${r.props[k]}`).join(', ')}` : ''}`)
}
