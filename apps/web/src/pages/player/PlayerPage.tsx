import { AnimatePresence, motion } from 'motion/react'
import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { BookCover } from '../../components/books/BookCover'
import { Ic } from '../../components/icons'
import { PlaybackControls, Scrubber } from '../../components/player/Playback'
import { IconButton } from '../../components/ui/Button'
import { StatusPanel, Toast, type StatusPanelProps } from '../../components/ui/Feedback'
import { useIsDesktop } from '../../components/ui/Overlays'
import { seekBy, seekTo, togglePlay } from '../../features/playback/controller'
import { PlayerSheets, type SheetName } from '../../features/playback/PlayerSheets'
import { usePlayerStore } from '../../features/playback/store'
import { useHasSessionBadge, usePlayerPosition, usePlayerView, useSessionBadge, type PlayerView } from '../../features/playback/view'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import './player.css'

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)

/** Full player (#/player): cover, session badge, transport, outcome panels, sheets. */
export function PlayerPage() {
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const view = usePlayerView(sheet === 'timer')
  // No book once restore finished and nothing is being opened: the player has nothing to show.
  const empty = usePlayerStore((s) => s.restored && !s.state.bookId)
  if (!view) return empty ? <Navigate to="/" replace /> : null
  return <Player view={view} sheet={sheet} setSheet={setSheet} />
}

/** Scrubber and time labels: the only part of the player that follows playback ticks. */
function ChapterScrubber({ chapterStart, chapterLen, total }: { chapterStart: number; chapterLen: number; total: number }) {
  const position = usePlayerPosition()
  // While dragging, the thumb follows the finger; the session changes only on release.
  const [scrub, setScrub] = useState<number | null>(null)
  const inChapter = scrub ?? Math.min(chapterLen, Math.max(0, position - chapterStart))
  return (
    <Scrubber
      positionSec={inChapter}
      chapterDurationSec={chapterLen}
      bookLeftSec={total - (chapterStart + inChapter)}
      onScrub={setScrub}
      onCommit={(v) => { setScrub(null); seekTo(chapterStart + v) }}
    />
  )
}

/** The countdown pill; its text ticks every second, so it subscribes itself. */
function SessionBadge({ onPress }: { onPress: () => void }) {
  const p = usePreset()
  const live = useSessionBadge()
  // Keep the last text while the pill animates out.
  const [last, setLast] = useState(live)
  if (live && live !== last) setLast(live)
  const badge = live || last
  return (
    <motion.button type="button" className="lb-sessionbadge" aria-label={`${badge}. ${t('player.changeTimer')}`} onClick={onPress} whileTap={p.press.whileTap} transition={p.press.transition}>
      <Ic name="moon" size={16} />{badge}<Ic name="right" size={16} />
    </motion.button>
  )
}

function Player({ view, sheet, setSheet }: { view: PlayerView; sheet: SheetName | null; setSheet: (s: SheetName | null) => void }) {
  const p = usePreset()
  const navigate = useNavigate()
  const online = useOnline()
  const wide = useIsDesktop()
  const hasBadge = useHasSessionBadge()
  const { s, book, chapter, status } = view
  const chapterStart = chapter.globalStart
  const chapterLen = chapter.globalEnd - chapterStart
  const panel = outcome(view, () => setSheet('timer'), () => navigate('/'), () => navigate(`/book/${book.id}`))
  const reveal = p.reveal

  return (
    <div className="lb-player" data-wide={wide || undefined}>
      <div className="lb-player-top">
        <IconButton label={t('player.close')} icon="down" iconSize={26} onClick={() => navigate(`/book/${book.id}`)} />
        <span className="lb-player-kicker">{online ? t('player.nowPlaying') : t('player.offline')}</span>
        <IconButton label={t('details.chapters')} icon="list" iconSize={24} onClick={() => setSheet('chapters')} />
      </div>
      <div className="lb-player-grid">
        <div className="lb-player-cover">
          <BookCover book={view.summary} layoutId={`cover-${book.id}`} style={{ '--cover-r': '20px' } as CSSProperties} />
        </div>
        <div className="lb-player-main">
          <div className="lb-player-head">
            <h1>{book.title}</h1>
            <span>{view.chapterLine}</span>
          </div>

          <AnimatePresence initial={false}>
            {hasBadge && (
              <motion.div key="badge" className="lb-player-badge" {...reveal}>
                <SessionBadge onPress={() => setSheet('timer')} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false} mode="popLayout">
            {view.ended ? (
              <motion.div key={`panel-${status}`} className="lb-player-panel" {...reveal}>
                {panel && <StatusPanel {...panel} />}
              </motion.div>
            ) : (
              <motion.div key="transport" className="lb-player-transport" {...reveal}>
                <ChapterScrubber chapterStart={chapterStart} chapterLen={chapterLen} total={view.total} />
                <PlaybackControls status={status} onToggle={togglePlay} onBack={() => seekBy(-30)} onForward={() => seekBy(15)} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="lb-player-tools">
            <motion.button type="button" className="lb-player-tool" aria-label={`${t('speed.title')}, ${view.speedLabel}`} onClick={() => setSheet('speed')} whileTap={{ scale: 0.95 }} transition={p.press.transition}>
              <Ic name="gauge" size={18} />{view.speedLabel}
            </motion.button>
            <motion.button type="button" className="lb-player-tool" data-on={view.timerOn || undefined} aria-label={`${t('timer.title')}, ${view.timerLabel}`} onClick={() => setSheet('timer')} whileTap={{ scale: 0.95 }} transition={p.press.transition}>
              <Ic name="moon" size={18} /><span className="lb-ellipsis">{view.timerLabel}</span>
            </motion.button>
            <motion.button type="button" className="lb-player-tool" onClick={() => setSheet('chapters')} whileTap={{ scale: 0.95 }} transition={p.press.transition}>
              <Ic name="list" size={18} />{t(chapter.kind === 'generated' ? 'details.parts' : 'details.chapters')}
            </motion.button>
          </div>
        </div>
      </div>
      <PlayerSheets view={view} sheet={sheet} onClose={() => setSheet(null)} />
      <Toast toast={s.toast} />
    </div>
  )
}

/** The StatusPanel for a finished or broken session (state matrix P10-P14). */
function outcome(view: PlayerView, changeTimer: () => void, library: () => void, details: () => void): StatusPanelProps | null {
  const { status, chapters, chapterIndex, book, s } = view
  switch (status) {
    case 'endedTimer': {
      const minutes = Math.round((s.file?.plan.listeningDuration ?? 0) / 60) || (s.timer.mode === 'minutes' ? s.timer.minutes : 0)
      return { icon: 'moon', title: t('player.endedTimer', { minutes }), body: t('player.endedTimerBody'), primary: { label: t('player.keepListening'), onClick: togglePlay }, secondary: { label: t('player.changeTimer'), onClick: changeTimer } }
    }
    case 'endedChapter': {
      // The file ends on the chapter boundary, so the position already sits in the next chapter (or at its edge).
      const stopped = s.file ? Math.max(1, chapters.findIndex((c) => c.globalStart >= s.file!.plan.globalEnd - 0.5)) : chapterIndex + 1
      const next = chapters[Math.min(stopped, chapters.length - 1)]!
      return { icon: 'moon', title: t('player.endedChapter', { n: stopped }), body: t('player.endedChapterBody', { next: stopped + 1, title: next.title }), primary: { label: t('player.playChapter', { n: stopped + 1 }), onClick: togglePlay }, secondary: { label: t('player.changeTimer'), onClick: changeTimer } }
    }
    case 'completed':
      return { tone: 'success', icon: 'check', title: t('player.completed'), body: t('player.completedBody', { title: book.title }), primary: { label: t('player.listenAgain'), onClick: togglePlay }, secondary: { label: t('player.backToLibrary'), onClick: library } }
    case 'interrupted':
      return { tone: 'warning', icon: 'pause', title: t('player.interrupted'), body: t('player.interruptedBody'), primary: { label: t('common.resume'), onClick: togglePlay } }
    case 'error':
      return { tone: 'danger', icon: 'alert', title: t('player.error'), body: t('player.errorBody'), primary: { label: t('common.tryAgain'), onClick: togglePlay }, secondary: { label: t('player.bookDetails'), onClick: details } }
    default:
      return null
  }
}
