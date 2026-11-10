import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'

const ROW = 44
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export interface WheelPickerProps {
  /** Accessible name of the column (also shown by the caller). */
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Row text; defaults to the number. */
  format?: (n: number) => string
  /** Spoken value, e.g. "3 hours"; defaults to the row text. */
  valueText?: (n: number) => string
}

/**
 * One iOS-style wheel column: native scroll-snap with momentum, selection band, fade masks.
 * The value is read once the scroll settles (`scrollend`, or a short debounce where it is missing), never per frame.
 * It is a spinbutton for assistive tech: focus it and use Arrow/Page/Home/End.
 */
export function WheelPicker({ label, value, min, max, onChange, format = String, valueText = format }: WheelPickerProps) {
  const el = useRef<HTMLDivElement>(null)
  const latest = useRef({ onChange, min })
  useLayoutEffect(() => { latest.current = { onChange, min } })
  const rows = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max])

  // Follow `value` (first paint, keyboard, clicks) unless the scroll already shows it.
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const first = !node.dataset.ready
    node.dataset.ready = '1'
    if (Math.round(node.scrollTop / ROW) === value - min) return
    const top = (value - min) * ROW
    if (first) node.scrollTop = top
    else node.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [value, min])

  useEffect(() => {
    const node = el.current
    if (!node) return
    const settle = () => latest.current.onChange(clamp(Math.round(node.scrollTop / ROW), 0, rows.length - 1) + latest.current.min)
    if ('onscrollend' in window) {
      node.addEventListener('scrollend', settle)
      return () => node.removeEventListener('scrollend', settle)
    }
    let timer = 0
    const debounced = () => { clearTimeout(timer); timer = window.setTimeout(settle, 120) }
    node.addEventListener('scroll', debounced, { passive: true })
    return () => { clearTimeout(timer); node.removeEventListener('scroll', debounced) }
  }, [rows.length])

  const step = (delta: number) => onChange(clamp(value + delta, min, max))
  const onKeyDown = (e: KeyboardEvent) => {
    const to: Record<string, () => void> = {
      ArrowUp: () => step(-1), ArrowDown: () => step(1), PageUp: () => step(-5), PageDown: () => step(5),
      Home: () => onChange(min), End: () => onChange(max),
    }
    if (!to[e.key]) return
    e.preventDefault()
    to[e.key]!()
  }
  const onClick = (e: MouseEvent) => {
    const n = (e.target as HTMLElement).dataset.n
    if (n !== undefined) onChange(Number(n))
  }

  return (
    <div className="lb-wheel">
      <div
        ref={el}
        className="lb-wheel-scroll"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText(value)}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {rows.map((n) => <div key={n} className="lb-wheel-row" data-n={n} aria-hidden="true">{format(n)}</div>)}
      </div>
    </div>
  )
}
