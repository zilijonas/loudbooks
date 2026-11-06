// SessionPlanner: pure selection of source intervals for one prepared session (spec 01 §8).
// Minimal input shapes on purpose: the data layer maps its Book/MediaAsset/Chapter rows onto these.

export interface TimelineAsset {
  assetId: string
  /** Seconds of playable audio (priming already excluded), as the demuxer reports it. */
  duration: number
}

export interface TimelineChapter {
  id: string
  globalStart: number
  globalEnd: number
}

export interface BookTimeline {
  bookId: string
  revision: number
  /** In book order; the book timeline is their concatenation. */
  assets: TimelineAsset[]
  /** Sorted, covering the book. */
  chapters: TimelineChapter[]
}

export type SessionMode =
  | { kind: 'duration'; seconds: number }
  | { kind: 'chapterEnd'; count: 1 | 2 | 3 }
  | { kind: 'none' }

export type StopReason = 'timer' | 'chapterEnd' | 'bookEnd'

export interface SessionPart {
  assetId: string
  /** Seconds inside the asset. */
  sourceStart: number
  sourceEnd: number
  /** Media seconds inside the session file. */
  sessionStart: number
}

export interface SessionPlan {
  bookId: string
  revision: number
  mode: SessionMode
  rate: number
  globalStart: number
  globalEnd: number
  parts: SessionPart[]
  /** Seconds of source audio in the file. */
  mediaDuration: number
  /** Real listening seconds at `rate`. */
  listeningDuration: number
  stopReason: StopReason
  /** Chapter-end options that cannot be offered from this position (not enough chapters left). */
  unavailableChapterEnds: Array<1 | 2 | 3>
}

// Float sums of asset durations drift by ~1e-12; anything below a microsecond is the same instant.
const EPS = 1e-6

export const bookDuration = (timeline: BookTimeline) => timeline.assets.reduce((sum, a) => sum + a.duration, 0)

/** Index of the chapter that plays at `position`; a boundary belongs to the chapter that starts there. */
export function chapterIndexAt(timeline: BookTimeline, position: number): number {
  return timeline.chapters.findIndex((c) => position >= c.globalStart - EPS && position < c.globalEnd - EPS)
}

export function planSession(timeline: BookTimeline, position: number, mode: SessionMode, rate: number): SessionPlan {
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError(`Invalid playback rate: ${rate}`)
  if (!Number.isFinite(position)) throw new RangeError(`Invalid position: ${position}`)
  const bookEnd = bookDuration(timeline)
  const start = Math.min(Math.max(position, 0), bookEnd)
  const chapterIndex = chapterIndexAt(timeline, start)
  const unavailableChapterEnds = ([1, 2, 3] as const).filter(
    (n) => chapterIndex < 0 || chapterIndex + n - 1 >= timeline.chapters.length,
  )

  let end: number
  let stopReason: StopReason
  if (mode.kind === 'duration') {
    if (!Number.isFinite(mode.seconds) || mode.seconds <= 0) throw new RangeError(`Invalid duration: ${mode.seconds}`)
    end = start + mode.seconds * rate
    stopReason = 'timer'
  } else if (mode.kind === 'chapterEnd') {
    if (unavailableChapterEnds.includes(mode.count)) throw new RangeError(`Chapter end ${mode.count} is unavailable here`)
    end = timeline.chapters[chapterIndex + mode.count - 1]!.globalEnd
    stopReason = 'chapterEnd'
  } else {
    end = bookEnd
    stopReason = 'bookEnd'
  }
  // The end of the book wins over a longer timer or a last chapter that ends with the book.
  if (end >= bookEnd - EPS) {
    end = bookEnd
    stopReason = 'bookEnd'
  }

  const parts: SessionPart[] = []
  let assetStart = 0
  for (const asset of timeline.assets) {
    const assetEnd = assetStart + asset.duration
    const from = Math.max(start, assetStart)
    const to = Math.min(end, assetEnd)
    if (to - from > EPS) {
      parts.push({
        assetId: asset.assetId,
        sourceStart: from - assetStart,
        sourceEnd: to - assetStart,
        sessionStart: from - start,
      })
    }
    assetStart = assetEnd
  }

  const mediaDuration = end - start
  return {
    bookId: timeline.bookId,
    revision: timeline.revision,
    mode,
    rate,
    globalStart: start,
    globalEnd: end,
    parts,
    mediaDuration,
    listeningDuration: mediaDuration / rate,
    stopReason,
    unavailableChapterEnds,
  }
}
