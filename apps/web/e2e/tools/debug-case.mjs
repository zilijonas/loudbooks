// Scratch helper: open the dev app with seeded books, run a hash sequence and print page errors + body text.
import { chromium } from '@playwright/test'
const steps = process.argv.slice(2)
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: process.env.REDUCE ? 'reduce' : 'no-preference' })).newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message, '\n', (e.stack || '').split('\n').slice(0, 4).join('\n')))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
try {
  await page.goto('http://127.0.0.1:5173/loudbooks/#/__seed', { waitUntil: 'networkidle' })
  await page.evaluate(async () => (await import('/loudbooks/e2e/tools/seed.ts')).seed({ books: ['b1', 'b2', 'b5', 'b4', 'b6', 'b3'] }))
  for (const h of steps) { if (h.startsWith('goto:')) { await page.goto('http://127.0.0.1:5173/loudbooks/' + h.slice(5), { waitUntil: 'networkidle' }); await page.waitForTimeout(300); if (process.env.PWA) await page.evaluate(async () => (await import('/loudbooks/src/app/store.ts')).useUi.setState({ pwa: { needRefresh: false, offlineReady: true, apply() {} } })); continue } await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(Number(process.env.WAIT ?? 1200)) }
  if (process.env.EVAL) console.log('EVAL', JSON.stringify(await page.evaluate(process.env.EVAL)))
  console.log('BODY', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300))
} finally { await browser.close() }
