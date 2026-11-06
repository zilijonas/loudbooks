import { t } from '../../i18n'
import { formatBytes } from '../format'

export interface StorageBarProps {
  /** tokenColor is a CSS colour, normally a token: var(--lb-action), var(--lb-highlight), … */
  segments: { label: string; bytes: number; tokenColor: string; description: string }[]
  availableEstimateBytes?: number
}

/** Stacked usage bar; every segment is also listed as text (the bar alone is not the information). */
export function StorageBar({ segments, availableEstimateBytes }: StorageBarProps) {
  const total = segments.reduce((a, s) => a + s.bytes, 0) || 1
  return (
    <>
      <div className="lb-storagebar" aria-hidden="true">
        {segments.map((s) => <span key={s.label} style={{ width: `${Math.max(s.bytes ? 1.5 : 0, (s.bytes / total) * 100)}%`, background: s.tokenColor }} />)}
      </div>
      <ul className="lb-storagelist">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="lb-swatch" style={{ background: s.tokenColor }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><strong>{s.label}</strong><span>{s.description}</span></span>
            <b>{formatBytes(s.bytes)}</b>
          </li>
        ))}
      </ul>
      {availableEstimateBytes !== undefined && <p className="lb-fineprint">{t('settings.estimate', { free: formatBytes(availableEstimateBytes) })}</p>}
    </>
  )
}
