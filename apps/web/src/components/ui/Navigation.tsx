import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { useTheme } from '../../theme/ThemeProvider'
import symbolDark from '../brand/symbol-on-dark.svg'
import symbol from '../brand/symbol.svg'
import { Ic, type IconName } from '../icons'
import { Button, IconButton } from './Button'

/** Brand symbol (design/brand files, not redrawn) plus the live-text wordmark. Sidebar 34/22, Welcome 44/26. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { resolved } = useTheme()
  const style = (size === 'lg' ? { '--s': '44px', '--fs': '26px' } : {}) as CSSProperties
  return (
    <div className="lb-logo" style={style}>
      <img src={resolved === 'dark' ? symbolDark : symbol} alt="" />
      <span>Loud Books</span>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="lb-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

/** Sticky form bar: close (left), title, Save (right). */
export function TopBar({ title, onClose, closeLabel = t('common.cancel'), action }: { title: string; onClose: () => void; closeLabel?: string; action?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <div className="lb-topbar">
      <div>
        <IconButton label={closeLabel} icon="x" onClick={onClose} />
        <h1>{title}</h1>
        {action ? <Button size="sm" variant="strong" onClick={action.onClick} disabled={action.disabled}>{action.label}</Button> : <span style={{ width: 48 }} />}
      </div>
    </div>
  )
}

/** Back with a visible label ("‹ Library"), or icon-only when `iconOnly` (label becomes the accessible name). */
export function BackButton({ label, onClick, iconOnly }: { label: string; onClick: () => void; iconOnly?: boolean }) {
  const p = usePreset()
  if (iconOnly) return <IconButton label={label} icon="left" iconSize={26} onClick={onClick} />
  return (
    <motion.button type="button" className="lb-back" onClick={onClick} whileTap={p.press.whileTap} transition={p.press.transition}>
      <Ic name="left" size={26} />
      {label}
    </motion.button>
  )
}

export interface NavItem { label: string; icon: IconName; current?: boolean; onClick: () => void }

/** Desktop sidebar (≥ 768 px): logo, Add book, sections, offline status at the bottom. */
export function Sidebar({ items, onAdd, offlineReady }: { items: NavItem[]; onAdd: () => void; offlineReady: boolean }) {
  return (
    <nav aria-label={t('common.library')} className="lb-sidebar">
      <Logo />
      <Button icon="plus" onClick={onAdd} style={{ paddingLeft: 20 }}>{t('common.addBook')}</Button>
      <div className="lb-nav">
        {items.map((n) => (
          <button key={n.label} type="button" className="lb-nav-item" aria-current={n.current ? 'page' : undefined} onClick={n.onClick}>
            <Ic name={n.icon} size={22} />
            {n.label}
          </button>
        ))}
      </div>
      <div role="status" className="lb-sidebar-status" data-ready={offlineReady || undefined}>
        <Ic name={offlineReady ? 'check' : 'spin'} size={18} />
        <span>{t(offlineReady ? 'welcome.ready' : 'welcome.preparing')}</span>
      </div>
    </nav>
  )
}

/** Install steps for the BottomSheet ("Install Loud Books"). */
export function InstallGuide({ onDone }: { onDone: () => void }) {
  return (
    <>
      <p className="lb-speed-summary">{t('install.body')}</p>
      <ol className="lb-steps">
        <li><span><Ic name="share" size={22} className="lb-share-blue" /></span>{t('install.step1')}</li>
        <li><span><Ic name="addHome" size={22} /></span>{t('install.step2')}</li>
        <li><img src={`${import.meta.env.BASE_URL}icons/apple-touch-icon-180.png`} alt="" />{t('install.step3')}</li>
      </ol>
      <p className="lb-hint" style={{ lineHeight: 1.5 }}>{t('install.other')}</p>
      <Button variant="strong" size="dialog" onClick={onDone}>{t('install.done')}</Button>
    </>
  )
}
