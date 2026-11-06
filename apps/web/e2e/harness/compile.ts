// Dev-only page for e2e/compiler.spec.ts: drives the real media worker against OPFS copies of fixtures.
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { planSession, type BookTimeline, type SessionMode } from '../../src/domain/session-planner'
import { compileInWorker } from '../../src/services/media/media-client'
import type { CompileProgress } from '../../src/services/media/session-compiler'

const ASSETS = ['loud-books', 'v1', 'books', 'harness', 'assets']

async function dirOf(path: string[], create = false) {
  let dir = await navigator.storage.getDirectory()
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create })
  return dir
}
async function fileAt(path: string) {
  const parts = path.split('/')
  const dir = await dirOf(parts.slice(0, -1))
  return (await dir.getFileHandle(parts.at(-1)!)).getFile()
}
const assetFile = async (assetId: string) => (await (await dirOf(ASSETS)).getFileHandle(assetId)).getFile()

export interface CompileSpec {
  sessionId: string
  timeline: BookTimeline
  position: number
  mode: SessionMode
  rate: number
  cancelAfterWriting?: boolean
}

const harness = {
  async loadAsset(assetId: string, url: string) {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`fixture ${url}: ${res.status}`)
    const handle = await (await dirOf(ASSETS, true)).getFileHandle(assetId, { create: true })
    await res.body.pipeTo(await handle.createWritable())
    const input = new Input({ source: new BlobSource(await handle.getFile()), formats: ALL_FORMATS })
    try {
      return await input.computeDuration()
    } finally {
      input.dispose()
    }
  },
  async hash(assetId: string) {
    const digest = await crypto.subtle.digest('SHA-256', await (await assetFile(assetId)).arrayBuffer())
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  },
  async compile(spec: CompileSpec) {
    const plan = planSession(spec.timeline, spec.position, spec.mode, spec.rate)
    const controller = new AbortController()
    const phases: CompileProgress[] = []
    const t0 = performance.now()
    try {
      const result = await compileInWorker(
        { sessionId: spec.sessionId, parts: plan.parts },
        {
          // Timeline asset ids are `<fixture>#<n>` so one OPFS copy can appear twice in a book (a file join).
          getFile: (assetId) => assetFile(assetId.split('#')[0]!),
          signal: controller.signal,
          onProgress: (p) => {
            phases.push(p)
            if (spec.cancelAfterWriting && p.phase === 'writing' && p.done > 0) controller.abort()
          },
        },
      )
      return { plan, result, ms: performance.now() - t0, phases, error: null }
    } catch (error) {
      const sessionLeft = await dirOf(['loud-books', 'v1', 'sessions', spec.sessionId]).then(() => true, () => false)
      return { plan, result: null, ms: performance.now() - t0, phases, error: { name: (error as Error).name, message: (error as Error).message }, sessionLeft }
    }
  },
  /** Loads the file into an <audio> element and plays one second (muted, so autoplay policy allows it). */
  async play(path: string) {
    const url = URL.createObjectURL(await fileAt(path))
    const audio = new Audio()
    audio.muted = true
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration)
        audio.onerror = () => reject(new Error(`audio error ${audio.error?.code}: ${audio.error?.message}`))
        audio.src = url
      })
      await audio.play()
      const deadline = performance.now() + 8000
      while (audio.currentTime < 1 && performance.now() < deadline) await new Promise((r) => setTimeout(r, 100))
      return { duration, played: audio.currentTime, error: audio.error?.code ?? null }
    } finally {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
  },
  /** Hands a session file to Playwright as a download. */
  async download(path: string) {
    const url = URL.createObjectURL(await fileAt(path))
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').at(-1)!
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  async reset() {
    await (await navigator.storage.getDirectory()).removeEntry('loud-books', { recursive: true }).catch(() => {})
  },
}

declare global {
  interface Window {
    harness: typeof harness
  }
}
window.harness = harness
document.getElementById('status')!.textContent = 'ready'
