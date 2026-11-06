// Lock-screen / OS media controls (spec 01 §9). Feature-checked: everything is a no-op without navigator.mediaSession.
import { artOf } from '../../components/books/cover'

const session = typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null

export interface MediaSessionHandlers {
  play(): void
  pause(): void
  seekBy(seconds: number): void
}

export function setMediaHandlers(h: MediaSessionHandlers) {
  if (!session) return
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try { session.setActionHandler(action, handler) } catch { /* action unsupported by this browser */ }
  }
  set('play', () => h.play())
  set('pause', () => h.pause())
  set('seekbackward', (d) => h.seekBy(-(d.seekOffset ?? 30)))
  set('seekforward', (d) => h.seekBy(d.seekOffset ?? 15))
  // V1 lock-screen contract: no track switching, no stop-point changes.
  for (const a of ['previoustrack', 'nexttrack', 'seekto'] as MediaSessionAction[]) set(a, null)
}

let artUrl: string | null = null

/** Title + artwork: the stored cover, or the generated cover drawn to a PNG. */
export async function setMediaMetadata(title: string, cover: Blob | null) {
  if (!session || typeof MediaMetadata === 'undefined') return
  const blob = cover ?? (await generatedArt(title))
  if (artUrl) URL.revokeObjectURL(artUrl)
  artUrl = blob ? URL.createObjectURL(blob) : null
  session.metadata = new MediaMetadata({ title, artwork: artUrl ? [{ src: artUrl, sizes: '512x512', type: blob!.type || 'image/png' }] : [] })
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState) {
  if (session) session.playbackState = state
}

export function setMediaPosition(duration: number, position: number, playbackRate: number) {
  if (!session?.setPositionState || !Number.isFinite(duration) || duration <= 0) return
  try { session.setPositionState({ duration, position: Math.min(Math.max(0, position), duration), playbackRate }) } catch { /* transient invalid state */ }
}

// The square lock-screen version of the generated cover: palette, accent bar and title, as in artOf.
async function generatedArt(title: string): Promise<Blob | null> {
  const art = artOf(title.trim() || 'Untitled')
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const g = canvas.getContext('2d')
  if (!g) return null
  g.fillStyle = art.bg
  g.fillRect(0, 0, 512, 512)
  g.fillStyle = art.accent
  g.fillRect(48, 48, 104, 20)
  g.fillStyle = art.fg
  g.font = '800 64px "Bricolage Grotesque", sans-serif'
  const words = art.display.split(/\s+/)
  const lines: string[] = []
  for (const w of words) {
    const last = lines.at(-1)
    if (last && g.measureText(`${last} ${w}`).width <= 416) lines[lines.length - 1] = `${last} ${w}`
    else lines.push(w)
  }
  lines.slice(0, 5).forEach((line, i) => g.fillText(line, 48, 160 + i * 72, 416))
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
