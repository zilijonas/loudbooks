// What the player surfaces show, derived from the store. Shared by the full player and the dock.
import { useBlobUrl, type BookSummary } from '../../components/books/BookCover'
import { formatSpeed } from '../../components/format'
import { sessionBadgeText, type PlayerStatus } from '../../components/player/Playback'
import { t } from '../../i18n'
import { bookDuration, chapterIndexAt } from '../../domain/session-planner'
import { currentPosition } from './controller'
import { listeningLeft } from './machine'
import { usePlayerStore } from './store'

export function usePlayerView() {
  const s = usePlayerStore()
  const coverUrl = useBlobUrl(s.cover)
  const { book, chapters, timeline, state, timer, file } = s
  if (!book || !timeline) return null
  const total = bookDuration(timeline)
  const position = Math.min(currentPosition(s), total)
  const ci = Math.max(0, chapterIndexAt(timeline, Math.min(position, total - 1e-3)))
  const chapter = chapters[ci]!
  const generated = chapter.kind === 'generated'
  const status: PlayerStatus =
    state.status === 'ended' ? (state.stop === 'timer' ? 'endedTimer' : state.stop === 'chapterEnd' ? 'endedChapter' : 'completed')
      : state.status === 'idle' && book.status === 'completed' ? 'completed'
        : state.status
  const ended = ['endedTimer', 'endedChapter', 'completed', 'interrupted', 'error'].includes(status)
  const playable = !!file && (status === 'playing' || status === 'paused' || status === 'ready' || status === 'interrupted' || status === 'rebuilding')
  const left = file ? listeningLeft(file.duration, s.time, file.plan.rate) : 0
  // The session the badge describes: the prepared file's stop if there is one, else the chosen timer.
  const stopChapter = timer.mode === 'chapters' ? Math.min(chapters.length, ci + timer.count) : 0
  const badge = timer.mode === 'off' ? ''
    : timer.mode === 'minutes' && !playable && status !== 'endedTimer' ? t('player.minuteSession', { minutes: timer.minutes })
      : sessionBadgeText({ timer, listeningLeftSec: left, stopChapterLabel: String(stopChapter), paused: status === 'paused' })
  const chapterLine = chapters.length > 1
    ? generated ? t('player.partOf', { n: ci + 1, total: chapters.length }) : t('player.chapterOf', { n: ci + 1, total: chapters.length, title: chapter.title })
    : t('player.wholeBook')
  const summary: BookSummary = {
    id: book.id,
    title: book.title,
    durationSec: total,
    positionSec: position,
    status: book.status,
    cover: coverUrl ? { kind: 'image', url: coverUrl } : { kind: 'generated' },
    chapterCount: chapters.length,
    singleFile: chapters.length <= 1,
  }
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
    busy: state.status === 'preparing' || state.status === 'rebuilding',
    badge: ended ? '' : badge,
    chapterLine,
    subtitle: badge && !ended ? badge : chapterLine,
    speedLabel: formatSpeed(s.rate),
    timerLabel: timer.mode === 'off' ? t('player.timerChip')
      : timer.mode === 'minutes' ? t('player.timerMinutes', { minutes: timer.minutes })
        : timer.count === 1 ? t('player.timerChapterEnd') : t('player.timerChapters', { n: timer.count - 1 }),
    timerOn: timer.mode !== 'off',
  }
}

export type PlayerView = NonNullable<ReturnType<typeof usePlayerView>>
