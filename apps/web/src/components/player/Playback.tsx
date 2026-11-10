import { motion } from 'motion/react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatClock, formatDuration } from '../format'
import { Ic } from '../icons'
import { Slider } from '../ui/Controls'

export type PlayerStatus = 'idle' | 'preparing' | 'ready' | 'playing' | 'paused' | 'rebuilding' | 'endedTimer' | 'endedChapter' | 'completed' | 'interrupted' | 'error'
export type TimerSetting = { mode: 'off' } | { mode: 'minutes'; minutes: number } | { mode: 'chapters'; count: 1 | 2 | 3 }

export interface PlaybackControlsProps {
  status: PlayerStatus
  onToggle: () => void
  onBack: () => void
  onForward: () => void
}

/** −30 / Play-Pause / +15. While a session is prepared the play button shows a spinner (aria-busy); once ready (or when the browser wants another tap) it is the plain play button. */
export function PlaybackControls({ status, onToggle, onBack, onForward }: PlaybackControlsProps) {
  const p = usePreset()
  const playing = status === 'playing'
  const busy = status === 'preparing' || status === 'rebuilding'
  const reduce = !('scale' in p.press.whileTap)
  const seekTap = (deg: number) => (reduce ? p.press.whileTap : { transform: `scale(0.9) rotate(${deg}deg)` })
  const glyph = (on: boolean) => ({ opacity: on ? 1 : 0, transform: `scale(${on || reduce ? 1 : 0.6})` })
  /** Icons cross-fade on opacity (fixed, short); the scale rides the spring. */
  const swap = { ...p.springPlayful, opacity: { duration: 0.16 } }
  return (
    <div className="lb-controls">
      <motion.button type="button" className="lb-seek" aria-label={t('common.back30')} onClick={onBack} whileTap={seekTap(-12)} transition={p.press.transition}>
        <Ic name="back" size={38} />
        <span aria-hidden="true">30</span>
      </motion.button>
      <motion.button type="button" className="lb-play" aria-label={busy ? t('player.preparing') : playing ? t('common.pause') : t('common.play')} aria-busy={busy || undefined} onClick={onToggle} whileTap={p.press.playButton.whileTap} transition={p.press.transition}>
        <span className="lb-play-icons">
          <motion.span data-glyph="pause" initial={false} animate={glyph(playing && !busy)} transition={swap}><Ic name="pause" size={32} /></motion.span>
          <motion.span data-glyph="play" initial={false} animate={glyph(!playing && !busy)} transition={swap}><Ic name="play" size={32} /></motion.span>
          <motion.span data-glyph="spin" initial={false} animate={{ opacity: busy ? 1 : 0 }} transition={{ duration: 0.16 }}><Ic name="spin" size={40} /></motion.span>
        </span>
      </motion.button>
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
