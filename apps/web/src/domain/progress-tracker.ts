// ProgressTracker: session media time <-> book position, and resume rules (spec 01 §9).
import { bookDuration, type BookTimeline, type SessionPart, type StopReason } from './session-planner'

const REWIND_AFTER_TIMER = 5
// A compiled file ends on a packet boundary, up to one frame (<0.1 s) around the planned chapter end.
const BOUNDARY_TOLERANCE = 0.5

function assetOffset(timeline: BookTimeline, assetId: string): { offset: number; duration: number } {
  let offset = 0
  for (const a of timeline.assets) {
    if (a.assetId === assetId) return { offset, duration: a.duration }
    offset += a.duration
  }
  throw new Error(`Asset ${assetId} is not in book ${timeline.bookId}`)
}

/**
 * Global book position heard at `sessionTime` (seconds of media in the session file, i.e. audio.currentTime).
 * `sourceMap` is the compiler's actual map: packet-boundary sourceStart (may be negative for codec priming at a
 * file join) and the exact sessionStart, so no error accumulates across joins.
 */
export function sessionToGlobal(timeline: BookTimeline, sourceMap: SessionPart[], sessionTime: number): number {
  if (sourceMap.length === 0) throw new Error('Empty source map')
  let part = sourceMap[0]!
  for (const p of sourceMap) if (p.sessionStart <= sessionTime) part = p
  const source = part.sourceStart + Math.max(0, sessionTime - part.sessionStart)
  const { offset, duration } = assetOffset(timeline, part.assetId)
  return offset + Math.min(Math.max(source, 0), Math.min(part.sourceEnd, duration))
}

/** Session media time for a global position, or null when the position is not inside the prepared file. */
export function globalToSession(timeline: BookTimeline, sourceMap: SessionPart[], position: number): number | null {
  for (const p of sourceMap) {
    const { offset } = assetOffset(timeline, p.assetId)
    const source = position - offset
    if (source >= p.sourceStart && source <= p.sourceEnd) return p.sessionStart + (source - p.sourceStart)
  }
  return null
}

export type StopKind = StopReason | 'pause'

export interface ResumeState {
  /** Global position to resume from. */
  position: number
  /** A confirmed timer stop leaves one pending 5 s rewind for the next resume. */
  rewindPending: boolean
  completed: boolean
}

/** Progress to store when playback stops at global `position` for `reason`. */
export function stopState(timeline: BookTimeline, reason: StopKind, position: number): ResumeState {
  const bookEnd = bookDuration(timeline)
  if (reason === 'bookEnd' || position >= bookEnd - BOUNDARY_TOLERANCE / 10) {
    return { position: bookEnd, rewindPending: false, completed: true }
  }
  if (reason === 'chapterEnd') {
    const next = timeline.chapters.find((c) => c.globalStart >= position - BOUNDARY_TOLERANCE)
    return { position: next ? next.globalStart : position, rewindPending: false, completed: false }
  }
  return { position, rewindPending: reason === 'timer', completed: false }
}

/** Where the next session starts; the timer rewind applies once and is then cleared. */
export function resumeFrom(state: ResumeState): ResumeState {
  if (!state.rewindPending) return state
  return { ...state, position: Math.max(0, state.position - REWIND_AFTER_TIMER), rewindPending: false }
}
