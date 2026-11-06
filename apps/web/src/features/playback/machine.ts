// Player state machine and the pure rules behind it (spec 01 §9, plan §6). No DOM, no storage: unit-tested.
import type { TimerSetting } from '../../components/player/Playback'
import type { PlaybackProgress } from '../../domain/models'
import { resumeFrom } from '../../domain/progress-tracker'
import { chapterIndexAt, planSession, type BookTimeline, type SessionMode, type SessionPlan, type StopReason } from '../../domain/session-planner'
import type { CompilePhase } from '../../services/media/session-compiler'

export type RebuildReason = 'speed' | 'position' | 'timer'

export type PlayerState =
  /** Nothing prepared. `bookId` is the selected book (restored after a reload), if any. */
  | { status: 'idle'; bookId: string | null }
  | { status: 'preparing'; bookId: string; phase: CompilePhase }
  | { status: 'rebuilding'; bookId: string; phase: CompilePhase; reason: RebuildReason }
  /** A file is attached in every one of these. `ready` = play() was refused and needs a tap. */
  | { status: 'ready' | 'playing' | 'paused' | 'interrupted'; bookId: string }
  /** The prepared file ended; the stop reason decides how the next Play resumes. */
  | { status: 'ended'; bookId: string; stop: StopReason }
  | { status: 'error'; bookId: string }

export type PlayerEvent =
  | { type: 'select'; bookId: string | null }
  | { type: 'prepare'; bookId: string }
  | { type: 'rebuild'; reason: RebuildReason }
  | { type: 'phase'; phase: CompilePhase }
  /** File attached without playing (restore, rebuild while paused). */
  | { type: 'loaded' }
  /** play() rejected: the browser wants a fresh gesture. */
  | { type: 'blocked' }
  | { type: 'playing' }
  /** A pause we asked for. */
  | { type: 'paused' }
  /** A pause nobody in the app asked for (call, other app, OS). */
  | { type: 'interrupted' }
  | { type: 'ended'; stop: StopReason }
  | { type: 'cancelled'; hasFile: boolean }
  | { type: 'failed' }

const busy = (s: PlayerState): s is Extract<PlayerState, { status: 'preparing' | 'rebuilding' }> => s.status === 'preparing' || s.status === 'rebuilding'
export const hasFile = (s: PlayerState) => s.status === 'ready' || s.status === 'playing' || s.status === 'paused' || s.status === 'interrupted'

/** Events that do not apply to the current state are ignored (returns the same object). */
export function reduce(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case 'select':
      return { status: 'idle', bookId: e.bookId }
    case 'prepare':
      return { status: 'preparing', bookId: e.bookId, phase: 'analyzing' }
    case 'rebuild':
      return hasFile(s) || s.status === 'rebuilding' ? { status: 'rebuilding', bookId: s.bookId!, phase: 'analyzing', reason: e.reason } : s
    case 'phase':
      return busy(s) ? { ...s, phase: e.phase } : s
    case 'loaded':
      return busy(s) || (s.status === 'idle' && s.bookId) ? { status: 'paused', bookId: s.bookId! } : s
    case 'blocked':
      return busy(s) || s.status === 'paused' || s.status === 'interrupted' ? { status: 'ready', bookId: s.bookId } : s
    case 'playing':
      return busy(s) || hasFile(s) ? { status: 'playing', bookId: s.bookId! } : s
    case 'paused':
      return s.status === 'playing' || s.status === 'ready' || s.status === 'interrupted' ? { status: 'paused', bookId: s.bookId } : s
    case 'interrupted':
      return s.status === 'playing' ? { status: 'interrupted', bookId: s.bookId } : s
    case 'ended':
      return s.status === 'playing' ? { status: 'ended', bookId: s.bookId, stop: e.stop } : s
    case 'cancelled':
      return busy(s) ? (e.hasFile ? { status: 'paused', bookId: s.bookId } : { status: 'idle', bookId: s.bookId }) : s
    case 'failed':
      return s.status === 'idle' && !s.bookId ? s : { status: 'error', bookId: s.bookId! }
  }
}

export function timerMode(t: TimerSetting): SessionMode {
  if (t.mode === 'minutes') return { kind: 'duration', seconds: t.minutes * 60 }
  if (t.mode === 'chapters') return { kind: 'chapterEnd', count: t.count }
  return { kind: 'none' }
}

/** Real listening seconds left in the prepared file: the countdown is the media position, never a timer. */
export const listeningLeft = (fileDuration: number, currentTime: number, rate: number) => Math.max(0, (fileDuration - currentTime) / rate)

// Below this, a "replacement" would be a file shorter than a frame or two: the session is simply over.
const MIN_BUDGET = 1

export interface ActiveFile {
  mode: SessionMode
  rate: number
  /** Media seconds of the attached file and the element's position in it. */
  duration: number
  currentTime: number
}

/**
 * Replacement plan for a speed/position/timer change during a session (spec 01 §9): a duration session keeps the
 * listening budget not yet heard; a new timer starts a new budget. Null when the duration budget is already spent.
 */
export function replan(timeline: BookTimeline, active: ActiveFile, change: { position: number; rate?: number; mode?: SessionMode }): SessionPlan | null {
  const rate = change.rate ?? active.rate
  let mode = change.mode ?? active.mode
  if (!change.mode && mode.kind === 'duration') {
    const left = listeningLeft(active.duration, active.currentTime, active.rate)
    if (left < MIN_BUDGET) return null
    mode = { kind: 'duration', seconds: left }
  }
  return planSession(timeline, change.position, fitChapterMode(timeline, change.position, mode), rate)
}

/** A chapter-end count that no longer fits after a jump shrinks to the furthest chapter end still available. */
export function fitChapterMode(timeline: BookTimeline, position: number, mode: SessionMode): SessionMode {
  if (mode.kind !== 'chapterEnd') return mode
  const index = chapterIndexAt(timeline, position)
  if (index < 0) return { kind: 'none' }
  const left = timeline.chapters.length - index
  return { kind: 'chapterEnd', count: Math.min(mode.count, left) as 1 | 2 | 3 }
}

export interface StartPoint {
  position: number
  notice: 'rewind' | 'nextChapter' | null
}

/** Where a new session starts from the stored progress (spec 01 §9 resume rules). */
export function startPoint(progress: PlaybackProgress | undefined, completed: boolean, chapterStart?: number): StartPoint {
  if (chapterStart !== undefined) return { position: chapterStart, notice: null }
  if (!progress || completed || progress.stopReason === 'bookEnd') return { position: 0, notice: null }
  const { position } = resumeFrom({ position: progress.globalOffset, rewindPending: progress.rewindPending, completed: false })
  return { position, notice: progress.rewindPending ? 'rewind' : progress.stopReason === 'chapterEnd' ? 'nextChapter' : null }
}
