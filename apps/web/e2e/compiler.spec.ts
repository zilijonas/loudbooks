// SessionCompiler in a real browser: one case per distinct codec/cut risk (AGENTS.md test policy).
// Outputs are pulled back to node and checked with ffprobe/ffmpeg; each also plays in an <audio> element.
// Run: memory-queue ... -- pnpm e2e:compiler --project=<engine>
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { BookTimeline, SessionMode } from '../src/domain/session-planner'
import type { CompileSpec } from './harness/compile'

const run = promisify(execFile)
const repo = resolve(import.meta.dirname, '../../..')
const generated = join(repo, 'fixtures/generated')
const zelandDir = join(repo, 'fixtures/downloads/zeland')
const zeland = existsSync(zelandDir) ? readdirSync(zelandDir).filter((f) => /^00[1-6] /.test(f)).sort() : []
const FIXTURES: Record<string, string> = {
  'mp3-cbr': join(generated, 'mp3-cbr-64k.mp3'),
  'mp3-vbr': join(generated, 'mp3-vbr.mp3'),
  m4a: join(generated, 'm4a-aac.m4a'),
  m4b: join(generated, 'm4b-aac.m4b'),
  wav: join(generated, 'wav-pcm.wav'),
  'book-long': join(repo, 'audio_samples/book-long.mp3'),
  ...Object.fromEntries(zeland.map((f, i) => [`z${i + 1}`, join(zelandDir, f)])),
}
const TOLERANCE = 0.25
const resultsDir = join(import.meta.dirname, '../test-results')

test.skip(Object.values(FIXTURES).some((f) => !existsSync(f)) || zeland.length !== 6, 'local fixtures missing, see fixtures/README.md')
test.describe.configure({ mode: 'serial' })

let page: Page
const durations: Record<string, number> = {}
const hashesBefore: Record<string, string> = {}

/** Book of `ids` (asset ids may repeat a fixture to create a file join); chapters every `chapter` s or one per file. */
function book(ids: string[], chapter?: number): BookTimeline {
  const assets = ids.map((id, i) => ({ assetId: `${id}#${i}`, duration: durations[id]! }))
  const chapters: BookTimeline['chapters'] = []
  let offset = 0
  for (const a of assets) {
    const step = chapter ?? a.duration
    for (let s = 0; s < a.duration - 1e-6; s += step) {
      chapters.push({ id: `c${chapters.length + 1}`, globalStart: offset + s, globalEnd: offset + Math.min(s + step, a.duration) })
    }
    offset += a.duration
  }
  return { bookId: ids.join('+'), revision: 1, assets, chapters }
}

interface Case {
  name: string
  ids: string[]
  chapter?: number
  position: (t: BookTimeline) => number
  mode: SessionMode
  rate?: number
  measure?: boolean
}
const zIds = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6']
const startOf = (t: BookTimeline, index: number) => t.chapters[index]!.globalStart
const min = (m: number): SessionMode => ({ kind: 'duration', seconds: m * 60 })

const CASES: Case[] = [
  { name: 'mp3 CBR within a chapter (mid-file cut, reservoir preroll)', ids: ['mp3-cbr'], chapter: 150, position: () => 200.3, mode: min(1) },
  { name: 'mp3 VBR mid-file cut at 1.5x', ids: ['mp3-vbr'], chapter: 150, position: () => 333.3, mode: min(2), rate: 1.5 },
  { name: 'm4a spanning a file join (edit list + priming)', ids: ['m4a', 'm4a'], chapter: 150, position: (t) => t.assets[0]!.duration - 40, mode: { kind: 'duration', seconds: 90 } },
  { name: 'm4b 3 full chapters across a join', ids: ['m4b', 'm4b'], chapter: 150, position: (t) => startOf(t, 2), mode: { kind: 'chapterEnd', count: 3 } },
  { name: 'wav whole remaining book across a join (block slicing)', ids: ['wav', 'wav'], chapter: 45, position: () => 170.01, mode: { kind: 'none' } },
  { name: 'Zeland 004 -> 005 spanning chapters', ids: zIds, position: (t) => startOf(t, 4) - 60, mode: min(5) },
  { name: 'Zeland 3 full chapters (004-006)', ids: zIds, position: (t) => startOf(t, 3), mode: { kind: 'chapterEnd', count: 3 }, measure: true },
  { name: 'Zeland partial final chapter', ids: zIds, position: (t) => startOf(t, 5) + 30, mode: { kind: 'chapterEnd', count: 1 } },
  { name: 'Zeland whole remaining multi-file book (001-006)', ids: zIds, position: () => 0, mode: { kind: 'none' } },
  { name: 'book-long.mp3 30-minute cut', ids: ['book-long'], chapter: 600, position: () => 300, mode: min(30), measure: true },
]

/** Peak RSS (MB) of this engine's browser processes while `work` runs, minus the level just before. */
async function measureRss<T>(engine: string, work: () => Promise<T>): Promise<{ value: T; baseMb: number; peakMb: number }> {
  const match = engine === 'webkit' ? /ms-playwright\/webkit/ : engine === 'firefox' ? /ms-playwright\/firefox/ : /ms-playwright\/chrom/
  const sample = async () => {
    const { stdout } = await run('ps', ['-axo', 'rss=,command='], { maxBuffer: 16 << 20 })
    return stdout.split('\n').filter((l) => match.test(l)).reduce((sum, l) => sum + Number.parseInt(l.trim(), 10), 0) / 1024
  }
  const baseMb = await sample()
  let peakMb = baseMb
  let done = false
  const poll = (async () => {
    while (!done) {
      peakMb = Math.max(peakMb, await sample())
      await new Promise((r) => setTimeout(r, 100))
    }
  })()
  try {
    return { value: await work(), baseMb, peakMb }
  } finally {
    done = true
    await poll
  }
}

async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_name,sample_rate,channels', '-of', 'json', file])
  const json = JSON.parse(stdout) as { format: { format_name: string; duration: string }; streams: Array<{ codec_name: string }> }
  const decode = await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 'null', '-'])
  return { format: json.format.format_name, codec: json.streams[0]?.codec_name, duration: Number(json.format.duration), decodeErrors: decode.stderr.trim() }
}

// WebKit refuses OPFS in ephemeral contexts, so every engine gets a persistent profile (as the installed PWA has).
let context: BrowserContext
let profileDir: string
test.beforeAll(async ({ playwright, browserName, baseURL }) => {
  context = await playwright[browserName].launchPersistentContext((profileDir = mkdtempSync(join(tmpdir(), 'lb-compiler-'))), { baseURL, acceptDownloads: true })
  page = await context.newPage()
  await page.route('**/__fx/*', (route) => route.fulfill({ path: FIXTURES[decodeURIComponent(route.request().url().split('/__fx/')[1]!)]! }))
  await page.goto('')
  await expect(page.locator('#status')).toHaveText('ready')
  await page.evaluate(() => window.harness.reset())
  for (const key of Object.keys(FIXTURES)) {
    durations[key] = await page.evaluate(({ id, url }) => window.harness.loadAsset(id, url), { id: key, url: `/__fx/${encodeURIComponent(key)}` })
    hashesBefore[key] = await page.evaluate((id) => window.harness.hash(id), key)
  }
})

test.afterAll(async () => {
  await page?.evaluate(() => window.harness.reset()).catch(() => {})
  await context?.close()
  if (profileDir) rmSync(profileDir, { recursive: true, force: true })
})

for (const c of CASES) {
  test(c.name, async ({ browserName }, testInfo) => {
    const timeline = book(c.ids, c.chapter)
    const spec: CompileSpec = { sessionId: `s-${testInfo.testId}`, timeline, position: c.position(timeline), mode: c.mode, rate: c.rate ?? 1 }
    const { value: out, baseMb, peakMb } = await measureRss(browserName, () => page.evaluate((s) => window.harness.compile(s), spec))
    expect(out.error).toBeNull()
    const { plan, result } = out
    const phases = [...new Set(out.phases.map((p) => p.phase))]
    expect(phases).toEqual(['analyzing', 'reading', 'writing', 'finalizing'])
    expect(out.phases.at(-1)).toMatchObject({ phase: 'finalizing', done: out.phases.at(-1)!.total })
    if (c.rate) expect(plan.mediaDuration).toBeCloseTo(plan.listeningDuration * c.rate, 6)

    const download = page.waitForEvent('download')
    await page.evaluate((p) => window.harness.download(p), result!.outputPath)
    mkdirSync(testInfo.outputDir, { recursive: true })
    const file = join(testInfo.outputDir, `${browserName}-${result!.outputPath.split('/').at(-1)}`)
    await (await download).saveAs(file)
    const ff = await probe(file)
    const played = await page.evaluate((p) => window.harness.play(p), result!.outputPath)

    const row = {
      engine: browserName,
      case: c.name,
      parts: plan.parts.length,
      planned: +plan.mediaDuration.toFixed(3),
      written: +result!.writtenMediaDuration.toFixed(3),
      mediabunny: +result!.actualMediaDuration.toFixed(3),
      ffprobe: ff.duration,
      audioElement: +played.duration.toFixed(3),
      played: +played.played.toFixed(2),
      ms: Math.round(out.ms),
      rssDeltaMb: Math.round(peakMb - baseMb),
      bytes: out.phases.at(-1)!.bytesWritten,
      trims: result!.trims.map((t) => ({ lead: +t.leading.toFixed(4), trail: +t.trailing.toFixed(4), pre: t.prerollPackets, trim: +t.containerTrim.toFixed(4) })),
      measured: !!c.measure,
    }
    mkdirSync(resultsDir, { recursive: true })
    appendFileSync(join(resultsDir, 'compiler-results.jsonl'), `${JSON.stringify(row)}\n`)
    testInfo.annotations.push({ type: 'result', description: JSON.stringify(row) })

    expect(ff.decodeErrors).toBe('')
    expect(Math.abs(ff.duration - plan.mediaDuration)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(result!.actualMediaDuration - plan.mediaDuration)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(played.duration - plan.mediaDuration)).toBeLessThanOrEqual(TOLERANCE)
    expect(played.played).toBeGreaterThanOrEqual(1)
    expect(played.error).toBeNull()
  })
}

test('cancellation deletes the partial output', async () => {
  const timeline = book(['book-long'])
  const out = await page.evaluate((s) => window.harness.compile(s), {
    sessionId: 'cancelled', timeline, position: 0, mode: { kind: 'none' }, rate: 1, cancelAfterWriting: true,
  } satisfies CompileSpec)
  expect(out.error?.name).toBe('AbortError')
  expect(out.sessionLeft).toBe(false)
})

test('storage quota error is typed and leaves no partial file', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'quota override needs the Chrome DevTools Protocol')
  const cdp = await context.newCDPSession(page)
  const origin = new URL(page.url()).origin
  const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0)
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: usage + 2 * 1024 * 1024 })
  try {
    const out = await page.evaluate((s) => window.harness.compile(s), {
      sessionId: 'quota', timeline: book(['book-long']), position: 0, mode: min(30), rate: 1,
    } satisfies CompileSpec)
    expect(out.error?.name).toBe('QuotaExceededError')
    expect(out.sessionLeft).toBe(false)
  } finally {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin })
    await cdp.detach()
  }
})

test('source files are unchanged by compiling', async () => {
  for (const key of Object.keys(FIXTURES)) {
    expect(await page.evaluate((id) => window.harness.hash(id), key), key).toBe(hashesBefore[key])
  }
})
