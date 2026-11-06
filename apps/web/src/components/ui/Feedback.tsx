import * as RMenu from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useState, type ReactNode } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { Ic, type IconName } from '../icons'
import { Button } from './Button'
import { Progress, type Tone } from './Controls'

export interface Action { label: string; onClick: () => void; danger?: boolean }
export interface MenuAction extends Action { icon: IconName }

/** Desktop popover menu (Radix DropdownMenu). Danger items sit below a separator. Scales from its trigger. */
export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: MenuAction[]; align?: 'start' | 'end' }) {
  const p = usePreset()
  const [open, setOpen] = useState(false)
  return (
    <RMenu.Root open={open} onOpenChange={setOpen}>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <AnimatePresence>
        {open && (
          <RMenu.Portal forceMount>
            <RMenu.Content forceMount asChild align={align} sideOffset={6} collisionPadding={12}>
              <motion.div className="lb-menu" {...p.menu}>
                {items.map((it, i) => (
                  <Fragment key={it.label}>
                    {it.danger && i > 0 && !items[i - 1]?.danger && <RMenu.Separator className="lb-menu-sep" />}
                    <RMenu.Item className="lb-menu-item" data-danger={it.danger || undefined} onSelect={it.onClick}>
                      <Ic name={it.icon} size={22} />
                      {it.label}
                    </RMenu.Item>
                  </Fragment>
                ))}
              </motion.div>
            </RMenu.Content>
          </RMenu.Portal>
        )}
      </AnimatePresence>
    </RMenu.Root>
  )
}

/** The same actions as a plain list of buttons, for use inside a BottomSheet on phones. */
export function ActionList({ items }: { items: MenuAction[] }) {
  return (
    <div className="lb-actionlist">
      {items.map((it, i) => (
        <Fragment key={it.label}>
          {it.danger && i > 0 && !items[i - 1]?.danger && <div className="lb-menu-sep" />}
          <button type="button" className="lb-menu-item" data-danger={it.danger || undefined} onClick={it.onClick}>
            <Ic name={it.icon} size={22} />
            {it.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

/** One toast at a time. The live region stays mounted so screen readers hear each new message. */
export function Toast({ toast, bottom }: { toast: { id: string | number; text: string } | null; bottom?: string }) {
  const p = usePreset()
  return (
    <div role="status" aria-live="polite" className="lb-toast-region" style={bottom ? { bottom } : undefined}>
      <AnimatePresence mode="popLayout">
        {toast && <motion.div key={toast.id} className="lb-toast" {...p.toast}>{toast.text}</motion.div>}
      </AnimatePresence>
    </div>
  )
}

export interface StatusPanelProps {
  tone?: Tone
  icon: IconName | 'spin'
  title: string
  body?: string
  progress?: { value: number; label: string; sub: string }
  indeterminate?: boolean
  note?: string
  primary?: Action
  secondary?: Action
  tertiary?: Action
  align?: 'center' | 'start'
}

/** Shared outcome layout (LB Status Panel): tone icon, title, body, optional progress, note, up to three actions. */
export function StatusPanel({ tone = 'neutral', icon, title, body, progress, indeterminate, note, primary, secondary, tertiary, align = 'center' }: StatusPanelProps) {
  const p = usePreset()
  const pop = tone === 'success'
  return (
    <div role="status" aria-live="polite" className="lb-status" data-align={align}>
      <motion.div className="lb-status-icon" data-tone={tone} {...(pop ? { initial: p.success.initial, animate: p.success.animate, transition: p.success.transition } : {})}>
        <Ic name={icon} size={26} />
      </motion.div>
      <h3>{title}</h3>
      {body && <p className="lb-status-body">{body}</p>}
      {progress && (
        <div className="lb-status-prog">
          <div className="lb-status-progrow"><span>{progress.label}</span><span>{Math.round(progress.value * 100)}%</span></div>
          <Progress value={progress.value} label={title} />
          <div className="lb-status-progsub">{progress.sub}</div>
        </div>
      )}
      {indeterminate && <div style={{ width: '100%', maxWidth: 280 }}><Progress label={title} height={6} /></div>}
      {note && <p className="lb-status-note">{note}</p>}
      {(primary || secondary || tertiary) && (
        <div className="lb-status-actions">
          {primary && <Button size="dialog" variant={primary.danger ? 'danger' : 'primary'} onClick={primary.onClick}>{primary.label}</Button>}
          {secondary && <Button size="dialog" variant="secondary" onClick={secondary.onClick}>{secondary.label}</Button>}
          {tertiary && <button type="button" className="lb-status-tertiary" onClick={tertiary.onClick}>{tertiary.label}</button>}
        </div>
      )}
    </div>
  )
}

/** `hero`: the empty library (larger heading, wide actions passed as children). */
export function EmptyState({ icon, title, body, action, art, headingLevel = 2, variant, children }: { icon?: IconName; title: string; body?: string; action?: Action; art?: ReactNode; headingLevel?: 2 | 3; variant?: 'hero'; children?: ReactNode }) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <div className="lb-empty" data-variant={variant}>
      {art}
      {icon && <Ic name={icon} size={28} />}
      <H>{title}</H>
      {body && <p>{body}</p>}
      {action && <Button variant="secondary" size="md" style={{ height: 44, padding: '0 18px', fontSize: 15 }} onClick={action.onClick}>{action.label}</Button>}
      {children}
    </div>
  )
}

/** Settings-style status line: icon, title, explanation, optional action. `card` is the boxed variant (storage protection). */
export function StatusRow({ icon, tone, title, body, action, actionStrong, actionDisabled, variant = 'row' }: {
  icon: IconName; tone?: 'neutral' | 'success' | 'warning' | 'action'; title: string; body?: string
  action?: Action; actionStrong?: boolean; actionDisabled?: boolean; variant?: 'row' | 'card'
}) {
  return (
    <div className="lb-statusrow" data-tone={tone} data-variant={variant}>
      <Ic name={icon} size={22} />
      <span className="lb-statusrow-text" style={variant === 'card' && !action ? { gap: 3 } : undefined}>
        <strong>{title}</strong>
        {body && <span>{body}</span>}
        {action && <Button size="sm" variant={actionStrong ? 'strong' : 'secondary'} style={{ fontWeight: 600 }} disabled={actionDisabled} onClick={action.onClick}>{action.label}</Button>}
      </span>
    </div>
  )
}

/** "An update is ready" banner. While listening, Restart is disabled and the copy says it waits. */
export function UpdateBanner({ busy, onRestart, onLater }: { busy: boolean; onRestart: () => void; onLater: () => void }) {
  return (
    <div role="status" className="lb-banner">
      <Ic name="refresh" size={22} />
      <span className="lb-banner-text">{t(busy ? 'library.updateBusy' : 'library.updateReady')}</span>
      <div className="lb-banner-actions">
        <Button size="sm" variant="quiet" onClick={onLater}>{t('library.later')}</Button>
        <Button size="sm" variant="strong" style={{ fontWeight: 600, padding: '0 16px' }} disabled={busy} onClick={onRestart}>{t('library.restart')}</Button>
      </div>
    </div>
  )
}
