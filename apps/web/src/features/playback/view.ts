// What the player surfaces show, derived from the store. Shared by the full player and the dock.
// The store's `time` ticks ~4 Hz: usePlayerView reads only slow fields, and the time-driven bits
// (session badge, scrubber) are separate subscriptions so a tick re-renders only the text that changes.
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { BookSummary } from '../../components/books/BookCover'
import { formatSpeed } from '../../components/format'
import { sessionBadgeText, type PlayerStatus } from '../../components/player/Playback'
import { t } from '../../i18n'
import { bookDuration, chapterIndexAt } from '../../domain/session-planner'
import { coverUrlFor } from '../../pages/shared/data'
import { currentPosition } from './controller'
import { listeningLeft } from './machine'
import { usePlayerStore, type PlayerStore } from './store'

const ENDED: PlayerStatus[] = ['endedTimer', 'endedChapter', 'completed', 'interrupted', 'error']

function statusOf({ state, book }: PlayerStore): PlayerStatus {
  return state.status === 'ended' ? (state.stop === 'timer' ? 'endedTimer' : state.stop === 'chapterEnd' ? 'endedChapter' : 'completed')
    : state.status === 'idle' && book?.status === 'completed' ? 'completed'
      : state.status
}

/** Chapter that holds the listening position; changes only at chapter boundaries. */
function chapterIndexOf(s: PlayerStore) {
  if (!s.timeline) return 0
  const total = bookDuration(s.timeline)
  return Math.max(0, chapterIndexAt(s.timeline, Math.min(currentPosition(s), total, total - 1e-3)))
}

/** The session pill ("28:14 of listening left"); empty when no timer is set or the session ended. */
function badgeOf(s: PlayerStore) {
  const { book, timeline, timer, file, chapters } = s
  const status = statusOf(s)
  if (!book || !timeline || timer.mode === 'off' || ENDED.includes(status)) return ''
  const playable = !!file && (status === 'playing' || status === 'paused' || status === 'ready' || status === 'interrupted' || status === 'rebuilding')
  if (timer.mode === 'minutes' && !playable) return t('player.minuteSession', { minutes: timer.minutes })
  // The session the badge describes: the prepared file's stop if there is one, else the chosen timer.
  const stopChapter = timer.mode === 'chapters' ? Math.min(chapters.length, chapterIndexOf(s) + timer.count) : 0
  const left = file ? listeningLeft(file.duration, s.time, file.plan.rate) : 0
  return sessionBadgeText({ timer, listeningLeftSec: left, stopChapterLabel: String(stopChapter), paused: status === 'paused' })
}

export const useSessionBadge = () => usePlayerStore(badgeOf)
export const useHasSessionBadge = () => usePlayerStore((s) => !!badgeOf(s))

/** Global book position, live. For the scrubber only. */
export const usePlayerPosition = () => usePlayerStore((s) => (s.timeline ? Math.min(currentPosition(s), bookDuration(s.timeline)) : 0))

const slowOf = (s: PlayerStore) => ({
  book: s.book, chapters: s.chapters, timeline: s.timeline, state: s.state, timer: s.timer, file: s.file, rate: s.rate, toast: s.toast, cover: s.cover,
  status: statusOf(s), ci: chapterIndexOf(s),
})

/** Cover surfaces ignore position, so the summary stays equal (and BookCover quiet) between chapters. Primitive deps only. */
function useSummary(id: string | undefined, title: string | undefined, status: BookSummary['status'] | undefined, positionSec: number | undefined, durationSec: number, count: number, url: string | undefined) {
  return useMemo<BookSummary | null>(() => id === undefined || title === undefined || status === undefined || positionSec === undefined ? null : {
    id, title, durationSec, positionSec, status,
    cover: url ? { kind: 'image', url } : { kind: 'generated' },
    chapterCount: count,
    singleFile: count <= 1,
  }, [id, title, status, positionSec, durationSec, count, url])
}

/**
 * Re-renders on session changes, never on playback ticks. `position` is read when the component renders (fresh then);
 * pass `followPosition` while the timer sheet is open so its chapter-left times keep counting.
 */
export function usePlayerView(followPosition = false) {
  const { status, ci, cover, ...s } = usePlayerStore(useShallow(slowOf))
  usePlayerStore((x) => (followPosition ? Math.floor(currentPosition(x)) : 0))
  const { book, chapters, timeline, timer } = s
  const count = chapters.length
  const coverUrl = book && cover ? coverUrlFor(book.id, book.coverAssetId, cover) : undefined
  const chapter = chapters[ci]
  const total = timeline ? bookDuration(timeline) : 0
  const summary = useSummary(book?.id, book?.title, book?.status, chapter?.globalStart, total, count, coverUrl)
  if (!book || !timeline || !summary || !chapter) return null
  const position = Math.min(currentPosition(), total)
  const ended = ENDED.includes(status)
  return {
    s,
    book,
    summary,
    chapters,
    chapterIndex: ci,
    chapter,
    position,
    total,
    status,
    ended,
    busy: s.state.status === 'preparing' || s.state.status === 'rebuilding',
    chapterLine: chapters.length > 1
      ? chapter.kind === 'generated' ? t('player.partOf', { n: ci + 1, total: chapters.length }) : t('player.chapterOf', { n: ci + 1, total: chapters.length, title: chapter.title })
      : t('player.wholeBook'),
    speedLabel: formatSpeed(s.rate),
    timerLabel: timer.mode === 'off' ? t('player.timerChip')
      : timer.mode === 'minutes' ? t('player.timerMinutes', { minutes: timer.minutes })
        : timer.count === 1 ? t('player.timerChapterEnd') : t('player.timerChapters', { n: timer.count - 1 }),
    timerOn: timer.mode !== 'off',
  }
}

export type PlayerView = NonNullable<ReturnType<typeof usePlayerView>>
