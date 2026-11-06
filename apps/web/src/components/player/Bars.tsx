import { motion } from 'motion/react'
import { t } from '../../i18n'
import { ease, usePreset } from '../../motion/presets'
import { BookCover, type BookSummary } from '../books/BookCover'
import type { Art } from '../books/cover'
import { Ic } from '../icons'
import { IconButton } from '../ui/Button'
import type { PlayerStatus } from './Playback'

export interface MiniPlayerProps {
  book: BookSummary
  status: PlayerStatus
  subtitle: string
  onOpen: () => void
  onToggle: () => void
  art?: Partial<Art>
}

const isPlaying = (s: PlayerStatus) => s === 'playing'

/**
 * Phone mini-player. Render inside `<AnimatePresence>`: it rises in with a small overshoot and drops out faster.
 * The cover carries `layoutId="cover-{id}"` so it morphs into the full player.
 */
export function MiniPlayer({ book, status, subtitle, onOpen, onToggle, art }: MiniPlayerProps) {
  const p = usePreset()
  const reduce = !('transform' in p.page.initial)
  return (
    <motion.div
      className="lb-mini"
      initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(40px)' }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(40px)', transition: { duration: 0.2, ease: ease.drawer } }}
      transition={reduce ? p.springSoft : { type: 'spring', duration: 0.46, bounce: 0.25 }}
    >
      <button type="button" className="lb-reset lb-mini-open" aria-label={`${t('player.nowPlaying')}: ${book.title}`} onClick={onOpen}>
        <span style={{ borderRadius: 7, overflow: 'hidden', marginLeft: 6, flex: 'none' }}><BookCover book={book} size="xs" layoutId={`cover-${book.id}`} art={art} style={{ marginLeft: 0 }} /></span>
        <span className="lb-mini-text">
          <span className="lb-ellipsis">{book.title}</span>
          <span className="lb-ellipsis">{subtitle}</span>
        </span>
      </button>
      <motion.button type="button" className="lb-roundplay" aria-label={isPlaying(status) ? t('common.pause') : t('common.play')} onClick={onToggle} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
        <Ic name={isPlaying(status) ? 'pause' : 'play'} size={22} />
      </motion.button>
    </motion.div>
  )
}

export interface PlayerBarProps extends MiniPlayerProps {
  speedLabel: string
  timerLabel: string
  timerActive: boolean
  onBack: () => void
  onForward: () => void
  onSpeed: () => void
  onTimer: () => void
}

/** Desktop player bar (≥ 768 px) under the content. Render inside `<AnimatePresence>`. */
export function PlayerBar({ book, status, subtitle, onOpen, onToggle, art, speedLabel, timerLabel, timerActive, onBack, onForward, onSpeed, onTimer }: PlayerBarProps) {
  const p = usePreset()
  return (
    <motion.div className="lb-playerbar" {...p.page}>
      <button type="button" className="lb-reset lb-playerbar-open" aria-label={`${t('player.nowPlaying')}: ${book.title}`} onClick={onOpen}>
        <BookCover book={book} size="sm" layoutId={`cover-${book.id}`} art={art} />
        <span className="lb-mini-text">
          <span className="lb-ellipsis">{book.title}</span>
          <span className="lb-ellipsis">{subtitle}</span>
        </span>
      </button>
      <div className="lb-playerbar-mid">
        <IconButton label={t('common.back30')} icon="back" iconSize={26} onClick={onBack} />
        <motion.button type="button" className="lb-roundplay" aria-label={isPlaying(status) ? t('common.pause') : t('common.play')} onClick={onToggle} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
          <Ic name={isPlaying(status) ? 'pause' : 'play'} size={22} />
        </motion.button>
        <IconButton label={t('common.forward15')} icon="fwd" iconSize={26} onClick={onForward} />
      </div>
      <div className="lb-playerbar-end">
        <button type="button" className="lb-chip" aria-label={`${t('speed.title')}, ${speedLabel}`} onClick={onSpeed}>{speedLabel}</button>
        <button type="button" className="lb-chip" data-on={timerActive || undefined} aria-label={`${t('timer.title')}, ${timerLabel}`} onClick={onTimer}><Ic name="moon" size={16} />{timerLabel}</button>
        <IconButton label={t('player.nowPlaying')} icon="upc" size={44} onClick={onOpen} />
      </div>
    </motion.div>
  )
}
