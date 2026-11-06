import * as RSlider from '@radix-ui/react-slider'
import * as RSwitch from '@radix-ui/react-switch'
import { motion } from 'motion/react'
import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { usePreset } from '../../motion/presets'
import { Ic, type IconName } from '../icons'

export type Tone = 'neutral' | 'action' | 'success' | 'warning' | 'danger'

/** Tracks whether the last interaction was the keyboard: keyboard-initiated changes don't animate. */
function useKeyboardFlag() {
  const kb = useRef(false)
  return {
    kb,
    handlers: { onKeyDownCapture: () => { kb.current = true }, onPointerDownCapture: () => { kb.current = false } },
  }
}

export interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

/** Whole row is the switch (Radix): label left, track right; the thumb springs. */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const p = usePreset()
  const { kb, handlers } = useKeyboardFlag()
  return (
    <RSwitch.Root className="lb-switch" checked={checked} onCheckedChange={onChange} disabled={disabled} data-described={description ? '' : undefined} {...handlers}>
      {description ? (
        <span className="lb-switch-text"><strong>{label}</strong><span>{description}</span></span>
      ) : label}
      <span className="lb-switch-track" aria-hidden="true">
        <RSwitch.Thumb asChild>
          <motion.span
            className="lb-switch-thumb"
            initial={false}
            animate={{ transform: `translateX(${checked ? 20 : 0}px)` }}
            transition={kb.current ? { duration: 0 } : p.springPlayful}
          />
        </RSwitch.Thumb>
      </span>
    </RSwitch.Root>
  )
}

export interface SegmentedControlProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  /** md 52 px (theme), lg 56 px (speed). */
  size?: 'md' | 'lg'
}

/** Native radios (arrow keys, form semantics) under a moving pill. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = 'md' }: SegmentedControlProps<T>) {
  const p = usePreset()
  const name = useId()
  const { kb, handlers } = useKeyboardFlag()
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div role="radiogroup" aria-label={label} className="lb-seg" data-size={size} {...handlers}>
      <motion.div
        aria-hidden="true"
        className="lb-seg-pill"
        style={{ width: `calc((100% - 10px) / ${options.length})` }}
        initial={false}
        animate={{ transform: `translateX(${i * 100}%)` }}
        transition={kb.current ? { duration: 0 } : p.springPlayful}
      />
      {options.map((o) => (
        <label key={o.value} data-on={o.value === value || undefined}>
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export interface SliderProps {
  label: string
  value: number
  max: number
  valueText: string
  onScrub: (v: number) => void
  onCommit: (v: number) => void
  /** Arrow-key step in the slider's unit (seconds for the chapter slider). */
  step?: number
}

/** Radix slider: pointer scrubs continuously, arrows move ±step, Home = start. No animation (direct manipulation). */
export function Slider({ label, value, max, valueText, onScrub, onCommit, step = 15 }: SliderProps) {
  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
    if (!d) return
    e.preventDefault()
    const v = Math.min(max, Math.max(0, value + d))
    onScrub(v)
    onCommit(v)
  }
  return (
    <RSlider.Root
      className="lb-slider"
      value={[value]}
      max={max}
      step={1}
      onValueChange={([v]) => onScrub(v ?? 0)}
      onValueCommit={([v]) => onCommit(v ?? 0)}
    >
      <RSlider.Track className="lb-slider-track"><RSlider.Range className="lb-slider-range" /></RSlider.Track>
      <RSlider.Thumb className="lb-slider-thumb" aria-label={label} aria-valuetext={valueText} onKeyDown={onKeyDown} />
    </RSlider.Root>
  )
}

export interface ProgressProps {
  /** 0–1; omit for indeterminate. */
  value?: number
  label: string
  height?: 5 | 6 | 8 | 10
  tone?: 'action' | 'accent' | 'muted' | 'success' | 'warning'
  /** Decorative bars beside a text equivalent are hidden from assistive tech. */
  decorative?: boolean
}

const FILL = { action: 'var(--lb-action)', accent: 'var(--lb-accent-text)', muted: 'var(--lb-text-muted)', success: 'var(--lb-success)', warning: 'var(--lb-warning)' }

/** Determinate fill animates scaleX only; indeterminate keeps looping under reduced motion (it carries meaning). */
export function Progress({ value, label, height = 10, tone = 'action', decorative }: ProgressProps) {
  const pct = value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="lb-progress"
      style={{ '--h': `${height}px`, '--fill': FILL[tone] } as CSSProperties}
      data-indeterminate={value === undefined || undefined}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct })}
    >
      <div className="lb-progress-fill" data-spin={value === undefined ? '' : undefined} style={value === undefined ? undefined : { transform: `scaleX(${Math.min(1, Math.max(0, value))})` }} />
    </div>
  )
}

export interface BadgeProps { tone: Tone; icon?: IconName; children: ReactNode }

export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span className="lb-badge" data-tone={tone}>
      {icon && <Ic name={icon} size={16} />}
      {children}
    </span>
  )
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="lb-skeleton" style={{ width }} aria-hidden="true" />
}
