import { motion } from 'motion/react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { formatDuration, formatSpeed } from '../format'
import { Ic } from '../icons'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/Controls'
import { Reveal } from '../ui/Reveal'
import { WheelPicker } from '../ui/WheelPicker'
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
        <span id={`${id}-help`} className="lb-hint">{t('speed.range')} {t('speed.current', { speed: formatSpeed(value) })}</span>
        <Reveal show={!!err} as="span" className="lb-error" role="alert"><Ic name="alert" size={16} />{err}</Reveal>
      </Reveal>
      <Reveal show={!!rebuildNotice}><p className="lb-note">{t('speed.rebuild')}</p></Reveal>
    </>
  )
}

type Key = 'm5' | 'm15' | 'm30' | 'custom' | 'c1' | 'c2' | 'c3' | 'off'
const ROW = 60
const DIV = 32
export const MAX_TIMER_MINUTES = 600

export interface TimerSheetProps {
  value: TimerSetting
  chaptersRemaining: number
  /** One file without parts: chapter options are disabled. */
  singleFile?: boolean
  speed: number
  /** Seconds of the book from here to the end of chapter 1, 2 and 3 (each includes the ones before). */
  chapterLeftSec: readonly number[]
  /** A preset or "No timer" was picked: apply it (the sheet closes). */
  onApply: (t: TimerSetting) => void
  /** "Custom length" was picked: open the wheel dialog. */
  onCustom: () => void
}

const keyOf = (v: TimerSetting): Key => (v.mode === 'off' ? 'off' : v.mode === 'chapters' ? (`c${v.count}` as Key) : [5, 15, 30].includes(v.minutes) ? (`m${v.minutes}` as Key) : 'custom')

/** Sleep timer sheet content. Tapping an option applies it at once; the highlight slides to it while the sheet leaves. */
export function TimerSheet({ value, chaptersRemaining, singleFile, speed, chapterLeftSec, onApply, onCustom }: TimerSheetProps) {
  const p = usePreset()
  const key = keyOf(value)
  const about = (k: number) => t('timer.aboutDuration', { duration: formatDuration((chapterLeftSec[k - 1] ?? 0) / speed) })
  const chapterSub = (k: number, off: boolean) => (singleFile ? t('timer.noChapters') : off ? t(chaptersRemaining < 1 ? 'timer.lastChapter' : 'timer.oneLeft') : about(k))

  const rows: ({ div: string } | { key: Key; label: string; sub: string; off?: boolean; apply: () => void })[] = [
    ...([5, 15, 30] as const).map((m) => ({ key: `m${m}` as Key, label: t(`timer.m${m}`), sub: '', apply: () => onApply({ mode: 'minutes', minutes: m }) })),
    { key: 'custom', label: t('timer.custom'), sub: key === 'custom' && value.mode === 'minutes' ? formatDuration(value.minutes * 60) : t('timer.customSub'), apply: onCustom },
    { div: t('timer.stopAfter') },
    ...([1, 2, 3] as const).map((k) => {
      const off = singleFile || chaptersRemaining < k - 1
      return { key: `c${k}` as Key, label: t(`timer.c${k}`), sub: chapterSub(k, off), off, apply: () => onApply({ mode: 'chapters', count: k }) }
    }),
    { div: '' },
    { key: 'off', label: t('timer.off'), sub: t('timer.offSub'), apply: () => onApply({ mode: 'off' }) },
  ]
  let y = 0
  let hiY = 0
  const placed = rows.map((r) => {
    const top = y
    if ('key' in r && r.key === key) hiY = y
    y += 'div' in r ? DIV : ROW
    return { r, top }
  })

  return (
    <>
      <div role="group" aria-label={t('timer.title')} className="lb-timer-list">
        <motion.div aria-hidden="true" className="lb-timer-hi" initial={false} animate={{ transform: `translateY(${hiY}px)` }} transition={p.springPlayful} />
        {placed.map(({ r }, i) => 'div' in r ? (
          <div key={`d${i}`} className="lb-timer-div">{r.div}</div>
        ) : (
          <button key={r.key} type="button" className="lb-timer-opt" aria-pressed={key === r.key} disabled={r.off} onClick={r.apply}>
            <span><strong>{r.label}</strong><small>{r.sub}</small></span>
            <motion.span className="lb-ic" style={{ width: 24, height: 24 }} initial={false} animate={{ opacity: key === r.key ? 1 : 0, transform: `scale(${key === r.key ? 1 : 0.6})` }} transition={p.springPlayful}>
              <Ic name="check" size={24} />
            </motion.span>
          </button>
        ))}
      </div>
      <p className="lb-hint" style={{ lineHeight: 1.5 }}>{t('timer.explain')}</p>
    </>
  )
}

/** Body of the custom-length dialog: hours and minutes wheels, Cancel / Save. Valid totals are 1–600 minutes. */
export function CustomTimerForm({ initialMinutes, onSave, onCancel }: { initialMinutes: number; onSave: (minutes: number) => void; onCancel: () => void }) {
  const [hours, setHours] = useState(Math.floor(initialMinutes / 60))
  const [mins, setMins] = useState(initialMinutes % 60)
  const total = hours * 60 + mins
  const invalid = total > MAX_TIMER_MINUTES
  return (
    <>
      <div className="lb-wheels">
        <div className="lb-wheel-col">
          <span aria-hidden="true">{t('timer.hours')}</span>
          <WheelPicker label={t('timer.hours')} value={hours} min={0} max={10} onChange={setHours} valueText={(n) => t('timer.hoursValue', { n })} />
        </div>
        <div className="lb-wheel-col">
          <span aria-hidden="true">{t('timer.minutes')}</span>
          <WheelPicker label={t('timer.minutes')} value={mins} min={0} max={59} onChange={setMins} format={(n) => String(n).padStart(2, '0')} valueText={(n) => t('timer.minutesValue', { n })} />
        </div>
      </div>
      <Reveal show={invalid} as="span" className="lb-error" role="alert"><Ic name="alert" size={16} />{t('timer.minutesError')}</Reveal>
      <div className="lb-dialog-actions">
        <Button variant="secondary" size="dialog" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button size="dialog" disabled={total < 1 || invalid} onClick={() => onSave(total)}>{t('common.save')}</Button>
      </div>
    </>
  )
}
