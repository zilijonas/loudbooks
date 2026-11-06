import { planSession, type BookTimeline, type SessionMode } from '../src/domain/session-planner'
import { globalToSession, resumeFrom, sessionToGlobal, stopState } from '../src/domain/progress-tracker'

// Three files (1000 s, 2000 s, 500 s = 3500 s); four chapters, one crossing the a|b file join.
const book: BookTimeline = {
  bookId: 'b',
  revision: 3,
  assets: [
    { assetId: 'a', duration: 1000 },
    { assetId: 'b', duration: 2000 },
    { assetId: 'c', duration: 500 },
  ],
  chapters: [
    { id: 'c1', globalStart: 0, globalEnd: 600 },
    { id: 'c2', globalStart: 600, globalEnd: 1800 },
    { id: 'c3', globalStart: 1800, globalEnd: 3000 },
    { id: 'c4', globalStart: 3000, globalEnd: 3500 },
  ],
}
const min = (m: number): SessionMode => ({ kind: 'duration', seconds: m * 60 })

describe('planSession', () => {
  it.each([
    // [label, position, mode, rate, globalEnd, stopReason]
    ['5 min at 1x', 100, min(5), 1, 400, 'timer'],
    ['15 min at 0.75x', 100, min(15), 0.75, 775, 'timer'],
    ['15 min at 1.25x', 100, min(15), 1.25, 1225, 'timer'],
    ['30 min at 1.5x', 100, min(30), 1.5, 2800, 'timer'],
    ['custom 7 s at custom 2.2x', 100, { kind: 'duration', seconds: 7 }, 2.2, 115.4, 'timer'],
    ['timer longer than the book stops at book end', 3000, min(30), 1, 3500, 'bookEnd'],
    ['end of this chapter', 700, { kind: 'chapterEnd', count: 1 }, 1, 1800, 'chapterEnd'],
    ['end of the chapter after next', 0, { kind: 'chapterEnd', count: 3 }, 1, 3000, 'chapterEnd'],
    ['chapter boundary belongs to the chapter starting there', 600, { kind: 'chapterEnd', count: 1 }, 1, 1800, 'chapterEnd'],
    ['last chapter end is the book end', 2000, { kind: 'chapterEnd', count: 2 }, 1, 3500, 'bookEnd'],
    ['no timer plays to book end', 1500, { kind: 'none' }, 1.5, 3500, 'bookEnd'],
  ] as const)('%s', (_label, position, mode, rate, globalEnd, stopReason) => {
    const plan = planSession(book, position, mode, rate)
    expect(plan.globalEnd).toBeCloseTo(globalEnd, 9)
    expect(plan.stopReason).toBe(stopReason)
    expect(plan.mediaDuration).toBeCloseTo(globalEnd - position, 9)
    expect(plan.listeningDuration).toBeCloseTo((globalEnd - position) / rate, 9)
  })

  it('splits intervals across files on a continuous session timeline', () => {
    const plan = planSession(book, 600, min(30), 1.5)
    expect(plan.parts).toEqual([
      { assetId: 'a', sourceStart: 600, sourceEnd: 1000, sessionStart: 0 },
      { assetId: 'b', sourceStart: 0, sourceEnd: 2000, sessionStart: 400 },
      { assetId: 'c', sourceStart: 0, sourceEnd: 300, sessionStart: 2400 },
    ])
    expect(plan.mediaDuration).toBe(2700)
    expect(plan.listeningDuration).toBe(1800)
  })

  it('a timer ending exactly on a file join creates no empty part', () => {
    expect(planSession(book, 400, { kind: 'duration', seconds: 600 }, 1).parts).toHaveLength(1)
  })

  it.each([
    [0, []],
    [2000, [3]],
    [3200, [2, 3]],
  ])('at %s chapter-end options %j are unavailable and refused', (position, unavailable) => {
    expect(planSession(book, position, { kind: 'none' }, 1).unavailableChapterEnds).toEqual(unavailable)
    for (const count of unavailable) {
      expect(() => planSession(book, position, { kind: 'chapterEnd', count: count as 1 | 2 | 3 }, 1)).toThrow(RangeError)
    }
  })

  it('position at book end yields an empty book-end plan', () => {
    const plan = planSession(book, 3500, min(5), 1)
    expect(plan).toMatchObject({ parts: [], mediaDuration: 0, stopReason: 'bookEnd', unavailableChapterEnds: [1, 2, 3] })
  })

  it.each([0, -1, Number.NaN])('rejects rate %s', (rate) => {
    expect(() => planSession(book, 0, min(5), rate)).toThrow(RangeError)
  })

  it('rejects a non-positive custom duration', () => {
    expect(() => planSession(book, 0, { kind: 'duration', seconds: 0 }, 1)).toThrow(RangeError)
  })
})

describe('progress tracker', () => {
  // Actual compiler map for a 950 s -> 1100 s plan: file b starts with 0.025 s of codec priming at the join.
  const map = [
    { assetId: 'a', sourceStart: 950, sourceEnd: 1000, sessionStart: 0 },
    { assetId: 'b', sourceStart: -0.025, sourceEnd: 100, sessionStart: 50 },
  ]

  it.each([
    [10, 960],
    [50.01, 1000], // inside priming: clamped to the start of file b
    [50.025, 1000],
    [100.025, 1050],
  ])('session %s s -> book %s s without drift across the join', (t, global) => {
    expect(sessionToGlobal(book, map, t)).toBeCloseTo(global, 6)
  })

  it('maps a book position back into the session and rejects one outside it', () => {
    expect(globalToSession(book, map, 1050)).toBeCloseTo(100.025, 6)
    expect(globalToSession(book, map, 900)).toBeNull()
  })

  it('timer stop rewinds 5 s exactly once, clamped at the book start', () => {
    const stopped = stopState(book, 'timer', 400)
    const resumed = resumeFrom(stopped)
    expect(resumed).toEqual({ position: 395, rewindPending: false, completed: false })
    expect(resumeFrom(resumed).position).toBe(395)
    expect(resumeFrom(stopState(book, 'timer', 2)).position).toBe(0)
  })

  it.each([
    ['chapter end resumes at the next chapter even if the file ended a frame early', 'chapterEnd', 1799.98, 1800],
    ['chapter end resumes at the next chapter after a small overshoot', 'chapterEnd', 1800.03, 1800],
    ['manual pause resumes in place', 'pause', 1234.5, 1234.5],
  ] as const)('%s', (_label, reason, position, expected) => {
    expect(resumeFrom(stopState(book, reason, position))).toEqual({ position: expected, rewindPending: false, completed: false })
  })

  it('reaching the book end completes the book instead of rewinding', () => {
    expect(resumeFrom(stopState(book, 'timer', 3499.99))).toEqual({ position: 3500, rewindPending: false, completed: true })
    expect(stopState(book, 'bookEnd', 3480).completed).toBe(true)
  })
})
