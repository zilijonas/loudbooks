import { describe, expect, it } from 'vitest'
import type { PlaybackProgress } from '../src/domain/models'
import type { BookTimeline } from '../src/domain/session-planner'
import { reduce, replan, startPoint, type PlayerEvent, type PlayerState } from '../src/features/playback/machine'
import { progressAt } from '../src/features/playback/timeline'

const run = (events: PlayerEvent[], from: PlayerState = { status: 'idle', bookId: null }) => events.reduce(reduce, from)

// Two files, three chapters: 0-100 | 100-250 (file a), 250-400 (file b).
const timeline: BookTimeline = {
  bookId: 'b',
  revision: 1,
  assets: [{ assetId: 'a', duration: 250 }, { assetId: 'b', duration: 150 }],
  chapters: [{ id: 'c1', globalStart: 0, globalEnd: 100 }, { id: 'c2', globalStart: 100, globalEnd: 250 }, { id: 'c3', globalStart: 250, globalEnd: 400 }],
}

describe('player state machine', () => {
  it('runs prepare -> playing <-> paused -> ended and never plays again on its own', () => {
    const playing = run([{ type: 'prepare', bookId: 'b' }, { type: 'phase', phase: 'writing' }, { type: 'playing' }])
    expect(playing).toEqual({ status: 'playing', bookId: 'b' })
    expect(run([{ type: 'paused' }, { type: 'playing' }], playing).status).toBe('playing')
    const ended = run([{ type: 'ended', stop: 'timer' }], playing)
    expect(ended).toEqual({ status: 'ended', bookId: 'b', stop: 'timer' })
    // The element's trailing pause/playing events after the end must not resurrect the session.
    expect(run([{ type: 'paused' }, { type: 'playing' }, { type: 'interrupted' }], ended)).toBe(ended)
  })

  it('shows Ready — play when play() is refused, then plays on the tap', () => {
    const ready = run([{ type: 'prepare', bookId: 'b' }, { type: 'blocked' }])
    expect(ready.status).toBe('ready')
    expect(reduce(ready, { type: 'playing' }).status).toBe('playing')
  })

  it('keeps the rebuild pause from looking like a user pause or an interruption', () => {
    const rebuilding = run([{ type: 'prepare', bookId: 'b' }, { type: 'playing' }, { type: 'rebuild', reason: 'speed' }])
    expect(rebuilding).toMatchObject({ status: 'rebuilding', reason: 'speed' })
    expect(run([{ type: 'paused' }, { type: 'interrupted' }], rebuilding)).toBe(rebuilding)
    expect(reduce(rebuilding, { type: 'loaded' }).status).toBe('paused')
    expect(reduce(rebuilding, { type: 'cancelled', hasFile: true }).status).toBe('paused')
  })

  it('separates an unrequested pause (interrupted) and resumes from it', () => {
    const interrupted = run([{ type: 'prepare', bookId: 'b' }, { type: 'playing' }, { type: 'interrupted' }])
    expect(interrupted.status).toBe('interrupted')
    expect(reduce(interrupted, { type: 'playing' }).status).toBe('playing')
  })

  it('cancelling a first preparation goes back to idle with the book still selected', () => {
    expect(run([{ type: 'prepare', bookId: 'b' }, { type: 'cancelled', hasFile: false }])).toEqual({ status: 'idle', bookId: 'b' })
    expect(run([{ type: 'prepare', bookId: 'b' }, { type: 'failed' }]).status).toBe('error')
  })
})

describe('replanning during a session', () => {
  // 5-minute session at 2x from 0: a 600 s media file; 100 s of media heard = 50 s listened.
  const active = { mode: { kind: 'duration', seconds: 300 } as const, rate: 2, duration: 600, currentTime: 100 }

  it('speed change keeps the listening time not yet heard', () => {
    const plan = replan(timeline, active, { position: 100, rate: 1 })!
    expect(plan.listeningDuration).toBeCloseTo(250)
    expect(plan.globalEnd).toBeCloseTo(350)
  })

  it('seeking keeps the remaining budget instead of extending the session', () => {
    // 1x file of 300 s, 100 s heard: back to 50 still leaves exactly 200 s of listening.
    const plan = replan(timeline, { ...active, rate: 1, duration: 300 }, { position: 50 })!
    expect(plan.listeningDuration).toBeCloseTo(200)
    expect(plan.globalEnd).toBeCloseTo(250)
  })

  it('a new timer starts a new budget', () => {
    expect(replan(timeline, active, { position: 100, mode: { kind: 'duration', seconds: 60 } })!.listeningDuration).toBeCloseTo(60)
  })

  it('a spent budget is not replanned', () => {
    expect(replan(timeline, { ...active, currentTime: 599.5 }, { position: 300 })).toBeNull()
  })

  it('a chapter-end count shrinks to what is left after a jump', () => {
    const plan = replan(timeline, { ...active, mode: { kind: 'chapterEnd', count: 3 } }, { position: 260 })!
    expect(plan.globalEnd).toBe(400)
    expect(plan.stopReason).toBe('bookEnd')
  })
})

describe('resume rules', () => {
  const progress = (p: Partial<PlaybackProgress>): PlaybackProgress => ({ ...progressAt(timeline, 120, 'pause', false), ...p })

  it('rewinds 5 s once after a confirmed timer stop, clamped at 0', () => {
    expect(startPoint(progress({ globalOffset: 120, stopReason: 'timer', rewindPending: true }), false)).toEqual({ position: 115, notice: 'rewind' })
    expect(startPoint(progress({ globalOffset: 3, stopReason: 'timer', rewindPending: true }), false).position).toBe(0)
    // After that resume, playback checkpoints clear the flag: no second rewind.
    expect(startPoint(progress({ globalOffset: 115, stopReason: 'pause', rewindPending: false }), false)).toEqual({ position: 115, notice: null })
  })

  it('starts the next chapter after a chapter-end stop (stored as its start)', () => {
    expect(startPoint(progress({ globalOffset: 250, stopReason: 'chapterEnd' }), false)).toEqual({ position: 250, notice: 'nextChapter' })
  })

  it('restarts a finished book, and a chosen chapter wins over progress', () => {
    expect(startPoint(progress({ globalOffset: 400, stopReason: 'bookEnd' }), false).position).toBe(0)
    expect(startPoint(progress({ globalOffset: 120 }), true).position).toBe(0)
    expect(startPoint(progress({ globalOffset: 120 }), false, 250).position).toBe(250)
  })

  it('stores progress against the source file across a join', () => {
    expect(progressAt(timeline, 260, null, false)).toMatchObject({ sourceAssetId: 'b', sourceOffset: 10 })
    expect(progressAt(timeline, 400, 'bookEnd', false)).toMatchObject({ sourceAssetId: 'b', sourceOffset: 150 })
  })
})
