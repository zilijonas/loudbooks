// Dev-only (#/__player/<preset>): puts the player store into a design preset (player-* in Loud Books App.dc.html)
// with the design's fixture book, so the compare tool can photograph every state. Never built into production.
import { useParams } from 'react-router'
import type { TimerSetting } from '../../components/player/Playback'
import type { Book, Chapter } from '../../domain/models'
import { planSession } from '../../domain/session-planner'
import type { PlayerState } from '../../features/playback/machine'
import { usePlayerStore, type PlayerStore } from '../../features/playback/store'
import { toTimeline } from '../../features/playback/timeline'
import { PlayerPage } from './PlayerPage'

const SALT: [string, number][] = [['Arrival', 31], ['The Salt Office', 42], ['Static on the Line', 38], ['The Long Tide', 41], ['Harbour Lights', 36], ['A Letter Unsent', 44], ['Night Shift', 39], ['Undertow', 40], ['The Radio Room', 37], ['Low Water', 43], ['Signals', 38], ['Weatherglass', 41], ['The Crossing', 35], ['Afterword', 24]]

function fixture(preset: string): Partial<PlayerStore> {
  const book: Book = { id: 'b1', title: 'Salt & Static', description: '', coverAssetId: null, revision: 1, createdAt: 0, updatedAt: 0, status: preset === 'completed' ? 'completed' : 'ready' }
  let start = 0
  const chapters: Chapter[] = SALT.map(([title, m], order) => {
    const c: Chapter = { id: `c${order}`, bookId: 'b1', order, title, globalStart: start, globalEnd: start + m * 60, kind: 'imported', sourceRanges: [{ assetId: `a${order}`, sourceStart: 0, sourceEnd: m * 60 }] }
    start += m * 60
    return c
  })
  const assets = chapters.map((c, i) => ({ id: `a${i}`, bookId: 'b1', path: '', originalFilename: '', container: 'mp3', codec: 'mp3', channels: 2, sampleRate: 44100, duration: c.globalEnd - c.globalStart, bytes: 0, sha256: '' }))
  const timeline = toTimeline(book, chapters, assets)
  const rate = preset === 'speed' || preset === 'rebuilding' ? 1.5 : 1
  const timer: TimerSetting = preset === 'chapter-timer' || preset === 'ended-chapter' ? { mode: 'chapters', count: 1 } : preset === 'no-timer' ? { mode: 'off' } : { mode: 'minutes', minutes: 30 }
  // Design base: 7420 s into the book, 28:14 of a 30-minute session left (106 s heard).
  const heard = 106 * rate
  const position = preset === 'ended-chapter' ? 9120 : 7420
  const plan = planSession(timeline, position - heard, timer.mode === 'chapters' ? { kind: 'chapterEnd', count: 1 } : timer.mode === 'off' ? { kind: 'none' } : { kind: 'duration', seconds: 1800 }, rate)
  const file = { plan, sourceMap: plan.parts, duration: plan.mediaDuration, path: '', session: null }
  const status: Record<string, PlayerState> = {
    preparing: { status: 'preparing', bookId: 'b1', phase: 'reading' },
    gesture: { status: 'ready', bookId: 'b1' },
    playing: { status: 'playing', bookId: 'b1' },
    speed: { status: 'playing', bookId: 'b1' },
    'chapter-timer': { status: 'playing', bookId: 'b1' },
    rebuilding: { status: 'rebuilding', bookId: 'b1', phase: 'writing', reason: 'speed' },
    'ended-timer': { status: 'ended', bookId: 'b1', stop: 'timer' },
    'ended-chapter': { status: 'ended', bookId: 'b1', stop: 'chapterEnd' },
    completed: { status: 'idle', bookId: 'b1' },
    interrupted: { status: 'interrupted', bookId: 'b1' },
    error: { status: 'error', bookId: 'b1' },
  }
  const noFile = preset === 'preparing' || preset === 'error' || preset === 'completed'
  const time = preset === 'ended-timer' || preset === 'ended-chapter' ? plan.mediaDuration : heard
  return { book, chapters, timeline, cover: null, rate, timer, state: status[preset] ?? { status: 'paused', bookId: 'b1' }, file: noFile ? null : file, time, position, pending: preset === 'preparing' ? plan : null, restored: true }
}

export function DevPlayerFixture() {
  const { preset = 'paused' } = useParams()
  // Set before the first render so the page never shows the empty state.
  if (usePlayerStore.getState().book?.id !== 'b1') usePlayerStore.setState(fixture(preset))
  return <PlayerPage />
}
