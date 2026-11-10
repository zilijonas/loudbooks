import { AnimatePresence, motion } from 'motion/react'
import { memo, useState } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatDuration } from '../format'
import { Ic } from '../icons'
import { IconButton } from '../ui/Button'
import { Progress } from '../ui/Controls'
import { BookCover, type BookSummary } from './BookCover'
import type { Art } from './cover'

export function bookMeta(book: BookSummary) {
  if (book.status === 'missing') return { text: t('library.missing'), tone: 'warning' as const, icon: 'alert' as const }
  if (book.status === 'completed') return { text: t('common.finished'), tone: 'success' as const, icon: 'check' as const }
  const left = book.durationSec - book.positionSec
  return { text: book.positionSec > 0 ? t('library.left', { duration: formatDuration(left) }) : formatDuration(book.durationSec), tone: 'muted' as const, icon: null }
}

export function playLabel(book: BookSummary, playing: boolean) {
  const key = playing ? 'library.pauseTitle' : book.status === 'completed' ? 'library.againTitle' : book.positionSec > 0 ? 'library.resumeTitle' : 'library.playTitle'
  return t(key, { title: book.title })
}

export function NewBadge({ floating }: { floating?: boolean }) {
  const p = usePreset()
  return (
    <motion.span className="lb-badge-new" data-floating={floating || undefined} initial={p.success.initial} animate={p.success.animate} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ ...p.success.transition, delay: 0.26 }}>
      <Ic name="check" size={16} />
      {t('common.new')}
    </motion.span>
  )
}

export interface BookCardProps {
  book: BookSummary
  isActive: boolean
  isPlaying: boolean
  isNew?: boolean
  /** Position in the grid: alternates the hover tilt (±1°). */
  index?: number
  onOpen: () => void
  onPlay: () => void
  onMenu: () => void
  art?: Partial<Art>
}

/** Library grid card. Cover lifts on mouse hover only (touch gets press), Play sits on the cover, title clamps to 2 lines. */
// memo: the library re-renders on every progress write; callers pass stable callbacks so only the changed card repaints.
export const BookCard = memo(function BookCard({ book, isActive, isPlaying, isNew, index = 0, onOpen, onPlay, onMenu, art }: BookCardProps) {
  const p = usePreset()
  const [hover, setHover] = useState(false)
  const meta = bookMeta(book)
  const missing = book.status === 'missing'
  const pct = book.status === 'completed' ? 1 : book.durationSec ? book.positionSec / book.durationSec : 0
  const lift = { transform: `translateY(-5px) scale(1.035) rotate(${index % 2 ? 1 : -1}deg)` }
  return (
    // A new book pops in (success preset, never from 0); a deleted one fades out inside the grid's AnimatePresence.
    <motion.div
      role="listitem"
      layout="position"
      className="lb-card"
      data-missing={missing || undefined}
      initial={isNew ? p.success.initial : false}
      animate={p.success.animate}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={p.success.transition}
    >
      <motion.div
        className="lb-card-lift"
        data-hover={hover || undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        initial={false}
        animate={hover && 'transform' in p.hoverLift.whileHover ? lift : { transform: 'translateY(0px) scale(1) rotate(0deg)' }}
        transition={p.hoverLift.transition}
      >
        <motion.button type="button" className="lb-card-open" aria-label={t('library.openTitle', { title: book.title })} onClick={onOpen} whileTap={p.press.whileTap} transition={p.press.transition}>
          <BookCover book={book} layoutId={`cover-${book.id}`} art={art} />
        </motion.button>
        {!missing && (
          <motion.button type="button" className="lb-card-play" aria-label={playLabel(book, isActive && isPlaying)} aria-pressed={isActive && isPlaying} onClick={onPlay} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
            <Ic name={isActive && isPlaying ? 'pause' : 'play'} size={18} />
          </motion.button>
        )}
        <AnimatePresence>{isNew && <NewBadge floating />}</AnimatePresence>
      </motion.div>
      <Progress value={pct} label={meta.text} height={5} tone={meta.tone} decorative />
      <div className="lb-card-row">
        <div className="lb-card-text">
          <span className="lb-card-title lb-clamp2">{book.title}</span>
          <span className="lb-meta" data-tone={meta.tone}>
            {meta.icon && <Ic name={meta.icon} size={14} />}
            {meta.text}
          </span>
        </div>
        <IconButton className="lb-iconbtn lb-card-menu" label={t('library.moreTitle', { title: book.title })} icon="more" size={44} tone="muted" onClick={onMenu} />
      </div>
    </motion.div>
  )
})

export interface ContinueCardProps {
  book: BookSummary
  /** "Chapter 3 of 14 · 6 h 45 min left". */
  chapterLine: string
  isPlaying: boolean
  onOpen: () => void
  onToggle: () => void
  art?: Partial<Art>
}

/** "Continue listening" hero at the top of the library. */
export function ContinueCard({ book, chapterLine, isPlaying, onOpen, onToggle, art }: ContinueCardProps) {
  const p = usePreset()
  return (
    <section aria-label={t('library.continue')} className="lb-continue">
      <button type="button" className="lb-reset lb-continue-open" onClick={onOpen}>
        <span className="lb-continue-cover"><BookCover book={book} size="md" art={art} /></span>
        <span className="lb-continue-text">
          <span className="lb-kicker">{t('library.continue')}</span>
          <span className="lb-continue-title lb-clamp2">{book.title}</span>
          <span className="lb-continue-sub">{chapterLine}</span>
          <Progress value={book.durationSec ? book.positionSec / book.durationSec : 0} label={chapterLine} height={6} tone="accent" decorative />
        </span>
      </button>
      <motion.button type="button" className="lb-roundplay" aria-label={t(isPlaying ? 'library.pauseTitle' : 'library.resumeTitle', { title: book.title })} onClick={onToggle} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
        <Ic name={isPlaying ? 'pause' : 'play'} size={22} />
      </motion.button>
    </section>
  )
}
