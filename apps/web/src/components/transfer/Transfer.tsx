import QRCode from 'qrcode'
import { useId, useMemo, type ReactNode } from 'react'
import { t } from '../../i18n'
import { formatBytes } from '../format'
import { Ic } from '../icons'
import { Button } from '../ui/Button'
import { Progress } from '../ui/Controls'
import { Reveal } from '../ui/Reveal'

/** QR for the pairing URL: SVG modules, ink on white (always light so phone cameras read it in dark mode too). */
export function QR({ payload, size = 200, label }: { payload: string; size?: number; label: string }) {
  const rects = useMemo(() => {
    const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' })
    const n = modules.size
    const out: string[] = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules.get(r, c)) out.push(`M${c} ${r}h1v1h-1z`)
    return { n, d: out.join('') }
  }, [payload])
  return (
    <div className="lb-qr" style={{ width: size, height: size }}>
      <svg viewBox={`-2 -2 ${rects.n + 4} ${rects.n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <path d={rects.d} fill="#2A1E17" />
      </svg>
    </div>
  )
}

export interface PairingCodeProps {
  digits: string
  role: 'show' | 'enter'
  error?: string
  onChange?: (v: string) => void
  disabled?: boolean
  onSubmit?: () => void
}

/** `show`: six large digits in two groups (phone). `enter`: one numeric field (computer). */
export function PairingCode({ digits, role, error, onChange, disabled, onSubmit }: PairingCodeProps) {
  const id = useId()
  if (role === 'show') {
    return (
      <div role="img" aria-label={digits.split('').join(' ')} className="lb-digits">
        {digits.split('').map((d, i) => <span key={i}>{d}</span>)}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor={id} className="lb-code-label">{t('send.enterCode')}</label>
      <input
        id={id}
        className="lb-code-input"
        value={digits}
        onChange={(e) => onChange?.(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      <Reveal show={!!error} as="span" className="lb-error" id={`${id}-err`} role="alert"><Ic name="alert" size={16} />{error}</Reveal>
    </div>
  )
}

export interface TransferProgressProps {
  title: string
  bytesDone: number
  bytesTotal: number
  fileIndex: number
  fileCount: number
  direction: 'send' | 'receive'
  onCancel?: () => void
}

/** Live byte progress for Send/Receive. Fill animates scaleX only. */
export function TransferProgress({ title, bytesDone, bytesTotal, fileIndex, fileCount, direction, onCancel }: TransferProgressProps) {
  const frac = bytesTotal ? bytesDone / bytesTotal : 0
  // shortcut: "138 / 270 MB" — ui-strings has no "{done} of {total}" key yet; switch to it when added.
  const done = bytesTotal >= 1e9 ? formatBytes(bytesDone) : String(Math.round(bytesDone / 1e6))
  return (
    <div role="status" aria-live="polite" className="lb-transfer">
      <strong>{title}</strong>
      <div className="lb-transfer-row"><span>{`${done} / ${formatBytes(bytesTotal)}`}</span><span>{Math.round(frac * 100)}%</span></div>
      <Progress value={frac} label={title} />
      <span>{`${t('receive.fileOf', { n: fileIndex, total: fileCount })} · ${t(direction === 'send' ? 'send.keepOpen' : 'receive.keepOpen')}`}</span>
      {onCancel && <Button variant="quiet" size="sm" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={onCancel}>{t('common.cancel')}</Button>}
    </div>
  )
}

export interface ReceiveScannerProps {
  /** The camera `<video>` (owned by the scanning hook). Empty shows the dark viewfinder. */
  children?: ReactNode
  onPasteInstead: () => void
  onCancel: () => void
}

/** Camera viewfinder frame with coral corners, the instruction, and the fallbacks. */
export function ReceiveScanner({ children, onPasteInstead, onCancel }: ReceiveScannerProps) {
  return (
    <>
      <Viewfinder>{children}</Viewfinder>
      <p role="status" className="lb-scan-status">{t('receive.point')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="secondary" size="dialog" icon="link" onClick={onPasteInstead}>{t('receive.paste')}</Button>
        <Button variant="quiet" size="sm" style={{ height: 44, fontSize: 15 }} onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </>
  )
}

export function Viewfinder({ children }: { children?: ReactNode }) {
  return (
    <div className="lb-viewfinder">
      {children}
      <span aria-hidden="true" className="lb-viewfinder-mask" />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => <span key={c} aria-hidden="true" className="lb-viewfinder-c" data-c={c} />)}
    </div>
  )
}
