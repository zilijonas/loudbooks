import { motion } from 'motion/react'
import { Fragment, useId, useState } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatDuration, formatSpeed } from '../format'
import { Ic } from '../icons'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/Controls'
import { Reveal } from '../ui/Reveal'
import type { TimerSetting } from './Playback'

export interface SpeedSelectorProps {
  value: number
  presets: number[]
  min?: number
  max?: number
  onChange: (v: number) => void
  /** Shown while a session is prepared: changing speed rebuilds it. */
  rebuildNotice?: boolean
  /** e.g. "At 1.5×, an hour of listening covers 1 h 30 min of the book." */
  summary?: string
}

/** Speed sheet content: presets + Custom in a segmented control; custom accepts min–max. */
export function SpeedSelector({ value, presets, min = 0.5, max = 3, onChange, rebuildNotice, summary }: SpeedSelectorProps) {
  const id = useId()
  const [custom, setCustom] = useState(!presets.includes(value))
  const [text, setText] = useState(presets.includes(value) ? '' : String(value))
  const [err, setErr] = useState('')
  const options = [...presets.map((v) => ({ value: String(v), label: formatSpeed(v) })), { value: 'custom', label: t('speed.custom') }]
  const apply = () => {
    const v = Number(text.replace(',', '.'))
    if (!Number.isFinite(v) || v < min || v > max) return setErr(t('speed.error'))
    setErr('')
    onChange(Math.round(v * 100) / 100)
  }
  return (
    <>
      {summary && <p className="lb-speed-summary">{summary}</p>}
      <SegmentedControl
        label={t('speed.title')}
        size="lg"
        options={options}
        value={custom ? 'custom' : String(value)}
        onChange={(v) => { if (v === 'custom') setCustom(true); else { setCustom(false); setErr(''); onChange(Number(v)) } }}
      />
      <Reveal show={custom} className="lb-field">
        <label htmlFor={id} className="lb-field-label">{t('speed.customLabel')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="lb-suffix">
            <input id={id} className="lb-input" value={text} onChange={(e) => { setText(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && apply()} inputMode="decimal" placeholder="1.75" aria-invalid={err ? true : undefined} aria-describedby={`${id}-help`} />
            <span aria-hidden="true">×</span>
          </div>
          <Button variant="strong" size="dialog" style={{ padding: '0 20px', fontSize: 15 }} onClick={apply}>{t('speed.set')}</Button>
        </div>
        <span id={`${id}-help`} className="lb-hint">{t('speed.range')}</span>
        <Reveal show={!!err} as="span" className="lb-error" role="alert"><Ic name="alert" size={16} />{err}</Reveal>
      </Reveal>
      <Reveal show={!!rebuildNotice}><p className="lb-note">{t('speed.rebuild')}</p></Reveal>
    </>
  )
}

type Key = 'm5' | 'm15' | 'm30' | 'custom' | 'c1' | 'c2' | 'c3' | 'off'
const ROW = 60
const DIV = 32

export interface TimerSheetProps {
  value: TimerSetting
  /** Zero-based index of the current chapter. */
  chapterIndex: number
  chaptersRemaining: number
  /** One file without parts: chapter options are disabled. */
  singleFile?: boolean
  speed: number
  currentChapterLeftSec: number
  onApply: (t: TimerSetting) => void
}

const keyOf = (v: TimerSetting): Key => (v.mode === 'off' ? 'off' : v.mode === 'chapters' ? (`c${v.count}` as Key) : [5, 15, 30].includes(v.minutes) ? (`m${v.minutes}` as Key) : 'custom')

/** Sleep timer sheet content. The highlight slides between options; the check pops in. */
export function TimerSheet({ value, chapterIndex, chaptersRemaining, singleFile, speed, currentChapterLeftSec, onApply }: TimerSheetProps) {
  const p = usePreset()
  const name = useId()
  const [key, setKey] = useState<Key>(keyOf(value))
  const [customMin, setCustomMin] = useState(value.mode === 'minutes' && keyOf(value) === 'custom' ? String(value.minutes) : '')
  const [err, setErr] = useState('')

  const rows: ({ div: string } | { key: Key; label: string; sub: string; off?: boolean })[] = [
    { key: 'm5', label: t('timer.m5'), sub: '' },
    { key: 'm15', label: t('timer.m15'), sub: '' },
    { key: 'm30', label: t('timer.m30'), sub: '' },
    { key: 'custom', label: t('timer.custom'), sub: key === 'custom' && customMin ? t('timer.summaryMinutes', { minutes: customMin }) : t('timer.customSub') },
    { div: t('timer.byChapter') },
    { key: 'c1', label: t('timer.c1'), sub: singleFile ? t('timer.noChapters') : formatDuration(currentChapterLeftSec / speed), off: singleFile },
    { key: 'c2', label: t('timer.c2'), sub: singleFile ? t('timer.noChapters') : chaptersRemaining < 1 ? t('timer.lastChapter') : '', off: singleFile || chaptersRemaining < 1 },
    { key: 'c3', label: t('timer.c3'), sub: singleFile ? t('timer.noChapters') : chaptersRemaining < 1 ? t('timer.lastChapter') : chaptersRemaining < 2 ? t('timer.oneLeft') : '', off: singleFile || chaptersRemaining < 2 },
    { div: '' },
    { key: 'off', label: t('timer.off'), sub: t('timer.offSub') },
  ]
  let y = 0
  let hiY = 0
  const placed = rows.map((r) => {
    const top = y
    if ('key' in r && r.key === key) hiY = y
    y += 'div' in r ? DIV : ROW
    return { r, top }
  })

  const minutes = key === 'custom' ? parseInt(customMin, 10) : key[0] === 'm' ? Number(key.slice(1)) : 0
  const k = key[0] === 'c' && key !== 'custom' ? Number(key.slice(1)) as 1 | 2 | 3 : 0
  const n = chapterIndex + k
  const [summary, sub] = key === 'off' ? [t('timer.summaryOff'), t('timer.offSub')]
    : k ? [t('timer.summaryChapter', { n }), k === 1 ? formatDuration(currentChapterLeftSec / speed) : '']
      : minutes >= 1 ? [t('timer.summaryMinutes', { minutes }), t('speed.summarySession', { speed: formatSpeed(speed), minutes, duration: formatDuration(minutes * 60 * speed) })]
        : [t('timer.custom'), t('timer.customSub')]
  const applyLabel = key === 'off' ? t('timer.turnOff') : k ? t('timer.applyChapter', { n }) : minutes >= 1 ? t('timer.start', { minutes }) : t('timer.custom')

  const apply = () => {
    if (key === 'off') return onApply({ mode: 'off' })
    if (k) return onApply({ mode: 'chapters', count: k })
    if (!(minutes >= 1 && minutes <= 600)) return setErr(t('timer.minutesError'))
    onApply({ mode: 'minutes', minutes })
  }

  return (
    <>
      <div aria-live="polite" className="lb-timer-summary">
        <strong>{summary}</strong>
        {sub && <span>{sub}</span>}
      </div>
      <div role="radiogroup" aria-label={t('timer.title')} className="lb-timer-list">
        <motion.div aria-hidden="true" className="lb-timer-hi" initial={false} animate={{ transform: `translateY(${hiY}px)` }} transition={p.springPlayful} />
        {placed.map(({ r }, i) => 'div' in r ? (
          <div key={`d${i}`} className="lb-timer-div">{r.div}</div>
        ) : (
          <Fragment key={r.key}>
            <label className="lb-timer-opt" data-disabled={r.off || undefined}>
              <input type="radio" name={name} value={r.key} checked={key === r.key} disabled={r.off} onChange={() => { setKey(r.key); setErr('') }} />
              <span><strong>{r.label}</strong><small>{r.sub}</small></span>
              <motion.span className="lb-ic" style={{ width: 24, height: 24 }} initial={false} animate={{ opacity: key === r.key ? 1 : 0, transform: `scale(${key === r.key ? 1 : 0.6})` }} transition={p.springPlayful}>
                <Ic name="check" size={24} />
              </motion.span>
            </label>
          </Fragment>
        ))}
      </div>
      <Reveal show={key === 'custom'} className="lb-field">
        <label htmlFor={`${name}-min`} className="lb-field-label">{t('timer.minutesLabel')}</label>
        <input id={`${name}-min`} className="lb-input" style={{ fontWeight: 600 }} value={customMin} onChange={(e) => { setCustomMin(e.target.value.replace(/\D/g, '').slice(0, 3)); setErr('') }} inputMode="numeric" placeholder="45" aria-invalid={err ? true : undefined} />
        <Reveal show={!!err} as="span" className="lb-error" role="alert"><Ic name="alert" size={16} />{err}</Reveal>
      </Reveal>
      <p className="lb-hint" style={{ lineHeight: 1.5 }}>{t('timer.explain')}</p>
      <Button size="lg" onClick={apply}>{applyLabel}</Button>
    </>
  )
}
