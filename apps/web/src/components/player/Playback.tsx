import { AnimatePresence, motion } from 'motion/react'
import type { CSSProperties } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatClock, formatDuration } from '../format'
import { Ic } from '../icons'
import { Slider } from '../ui/Controls'
import { Reveal } from '../ui/Reveal'

export type PlayerStatus = 'idle' | 'preparing' | 'ready' | 'playing' | 'paused' | 'rebuilding' | 'endedTimer' | 'endedChapter' | 'completed' | 'interrupted' | 'error'
export type TimerSetting = { mode: 'off' } | { mode: 'minutes'; minutes: number } | { mode: 'chapters'; count: 1 | 2 | 3 }

export interface PlaybackControlsProps {
  status: PlayerStatus
  onToggle: () => void
  onBack: () => void
  onForward: () => void
}

/** −30 / Play-Pause / +15. Preparing shows a spinner ring; "ready" (browser wants another tap) swaps in the Ready — play pill. */
export function PlaybackControls({ status, onToggle, onBack, onForward }: PlaybackControlsProps) {
  const p = usePreset()
  const playing = status === 'playing'
  const busy = status === 'preparing' || status === 'rebuilding'
  const reduce = !('scale' in p.press.whileTap)
  const seekTap = (deg: number) => (reduce ? p.press.whileTap : { transform: `scale(0.9) rotate(${deg}deg)` })
  const glyph = (on: boolean) => ({ opacity: on ? 1 : 0, transform: `scale(${on || reduce ? 1 : 0.6})`, filter: `blur(${on || reduce ? 0 : 2}px)` })
  return (
    <div className="lb-controls">
      <motion.button type="button" className="lb-seek" aria-label={t('common.back30')} onClick={onBack} whileTap={seekTap(-12)} transition={p.press.transition}>
        <Ic name="back" size={38} />
        <span aria-hidden="true">30</span>
      </motion.button>
      <AnimatePresence mode="popLayout" initial={false}>
        {status === 'ready' ? (
          <motion.button key="ready" type="button" className="lb-ready" onClick={onToggle} initial={p.success.initial} animate={p.success.animate} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={p.success.transition} whileTap={p.press.whileTap}>
            <Ic name="play" size={26} />
            {t('player.readyPlay')}
          </motion.button>
        ) : (
          <motion.button key="round" type="button" className="lb-play" aria-label={playing ? t('common.pause') : t('common.play')} aria-busy={busy || undefined} onClick={onToggle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
            <span className="lb-play-icons">
              <motion.span data-glyph="pause" initial={false} animate={glyph(playing && !busy)} transition={p.springPlayful}><Ic name="pause" size={32} /></motion.span>
              <motion.span data-glyph="play" initial={false} animate={glyph(!playing && !busy)} transition={p.springPlayful}><Ic name="play" size={32} /></motion.span>
              <motion.span data-glyph="spin" initial={false} animate={{ opacity: busy ? 1 : 0 }} transition={{ duration: 0.16 }}><Ic name="spin" size={40} /></motion.span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <motion.button type="button" className="lb-seek" aria-label={t('common.forward15')} onClick={onForward} whileTap={seekTap(12)} transition={p.press.transition}>
        <Ic name="fwd" size={38} />
        <span aria-hidden="true">15</span>
      </motion.button>
    </div>
  )
}

export interface TimeDisplayProps { seconds: number; kind: 'elapsed' | 'remaining' | 'session' | 'bookLeft' }

export function formatTime(seconds: number, kind: TimeDisplayProps['kind']) {
  if (kind === 'remaining') return `−${formatClock(seconds)}`
  if (kind === 'session') return t('player.sessionLeft', { time: formatClock(seconds) })
  if (kind === 'bookLeft') return t('player.bookLeft', { duration: formatDuration(seconds) })
  return formatClock(seconds)
}

export function TimeDisplay({ seconds, kind }: TimeDisplayProps) {
  return <span className="lb-num">{formatTime(seconds, kind)}</span>
}

export interface ScrubberProps {
  positionSec: number
  chapterDurationSec: number
  bookLeftSec: number
  onScrub: (v: number) => void
  onCommit: (v: number) => void
}

/** Chapter position slider with elapsed · left in book · remaining. */
export function Scrubber({ positionSec, chapterDurationSec, bookLeftSec, onScrub, onCommit }: ScrubberProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Slider label={t('player.position')} value={positionSec} max={chapterDurationSec} valueText={`${formatClock(positionSec)} / ${formatClock(chapterDurationSec)}`} onScrub={onScrub} onCommit={onCommit} />
      <div className="lb-times">
        <TimeDisplay seconds={positionSec} kind="elapsed" />
        <TimeDisplay seconds={bookLeftSec} kind="bookLeft" />
        <TimeDisplay seconds={chapterDurationSec - positionSec} kind="remaining" />
      </div>
    </div>
  )
}

export interface ActiveSessionBadgeProps {
  timer: TimerSetting
  listeningLeftSec?: number
  /** Chapter number the session stops after. */
  stopChapterLabel?: string
  paused: boolean
  onPress: () => void
  /** Hide the chevron (static display). */
  plain?: boolean
}

export function sessionBadgeText({ timer, listeningLeftSec = 0, stopChapterLabel = '', paused }: Pick<ActiveSessionBadgeProps, 'timer' | 'listeningLeftSec' | 'stopChapterLabel' | 'paused'>) {
  if (timer.mode === 'chapters') return t('player.stopsAfter', { n: stopChapterLabel })
  return t(paused ? 'player.sessionPaused' : 'player.sessionLeft', { time: formatClock(listeningLeftSec) })
}

/** "28:14 of listening left" pill; opens the timer sheet. */
export function ActiveSessionBadge({ plain, onPress, ...rest }: ActiveSessionBadgeProps) {
  const p = usePreset()
  const text = sessionBadgeText(rest)
  return (
    <motion.button type="button" className="lb-sessionbadge" aria-label={`${text}. ${t('player.changeTimer')}`} onClick={onPress} whileTap={p.press.whileTap} transition={p.press.transition}>
      <Ic name="moon" size={16} />
      {text}
      {!plain && <Ic name="right" size={16} />}
    </motion.button>
  )
}

export interface SessionPreparationProps {
  phase: 'analyzing' | 'reading' | 'writing' | 'finalizing'
  reason?: 'start' | 'speed' | 'position' | 'timer'
  /** e.g. "30 minutes at 1.5× covers about 45 min of the book." */
  summary: string
  /** Needed for the "Updating your session for 1.5×" title. */
  speedLabel?: string
  onCancel?: () => void
}

/** Live status while the media worker compiles the session file. */
export function SessionPreparation({ phase, reason = 'start', summary, speedLabel = '', onCancel }: SessionPreparationProps) {
  const title =
    reason === 'speed' ? t('player.rebuildSpeed', { speed: speedLabel })
      : reason === 'position' ? t('player.rebuildPosition')
        : reason === 'timer' ? t('player.rebuildTimer')
          : t(phase === 'analyzing' ? 'player.prep1' : phase === 'finalizing' ? 'player.prep3' : 'player.prep2')
  return (
    <div role="status" aria-live="polite" className="lb-prep">
      <div className="lb-prep-head"><Ic name="spin" size={20} /><strong>{title}</strong></div>
      <span>{reason === 'start' ? summary : `${summary} ${t('player.rebuildNote')}`}</span>
      <div className="lb-progress" data-indeterminate="" style={{ '--h': '5px' } as CSSProperties} aria-hidden="true"><div className="lb-progress-fill" data-spin="" /></div>
      <Reveal show={!!onCancel}>
        <button type="button" className="lb-status-tertiary" style={{ color: 'var(--lb-text)', height: 36 }} onClick={onCancel}>{t('common.cancel')}</button>
      </Reveal>
    </div>
  )
}
