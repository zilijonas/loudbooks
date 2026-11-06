import * as RAlert from '@radix-ui/react-alert-dialog'
import * as RDialog from '@radix-ui/react-dialog'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentPropsWithRef, type PointerEvent, type ReactNode } from 'react'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { Button, IconButton } from './Button'
import { dragOffset, releaseVelocity, shouldDismiss } from './sheetDrag'

const DESKTOP = '(min-width: 768px)'
/** True at ≥ 768 px, where sheets become centred dialogs. */
export function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(DESKTOP); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia(DESKTOP).matches,
    () => false,
  )
}

type Kind = 'sheet' | 'dialog'

let openModals = 0
/** Radix marks the page behind a modal aria-hidden but leaves its buttons focusable (axe aria-hidden-focus). `inert` makes it true for keyboard and screen readers too. */
function useInertApp(open: boolean) {
  useEffect(() => {
    if (!open) return
    const app = document.querySelector('.lb-app')
    openModals++
    app?.setAttribute('inert', '')
    return () => { if (--openModals === 0) app?.removeAttribute('inert') }
  }, [open])
}

/** Radix returns focus to its own Trigger, which screens don't use (dialogs open from state). Remember the opener instead. */
function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => { opener.current = document.activeElement as HTMLElement | null },
    onCloseAutoFocus: (e: Event) => { e.preventDefault(); opener.current?.focus({ preventScroll: true }) },
  }
}

/** Shared enter/exit for scrim + panel. Sheets slide (spring in, drawer-curve out); dialogs scale from centre. */
function Stage({ kind, wide, children, scrim }: { kind: Kind; wide?: boolean; children: ReactNode; scrim: ReactNode }) {
  const p = usePreset()
  const m = kind === 'sheet' ? { ...p.sheet, exit: { ...p.sheet.exit, transition: p.sheet.exitTransition } } : p.dialog
  return (
    <div className="lb-ov" data-kind={kind} data-wide={wide || undefined}>
      {scrim}
      <motion.div className="lb-ov-slide" initial={m.initial} animate={m.animate} exit={m.exit} transition={m.transition}>
        {children}
      </motion.div>
    </div>
  )
}

function ScrimMotion() {
  return <motion.div className="lb-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.14 } }} />
}

/** Drag-to-dismiss from the grabber/header only (never from scrolling content): 1:1 down, rubber band up, velocity flick. */
function useSheetDrag(enabled: boolean, onDismiss: () => void) {
  const p = usePreset()
  const y = useMotionValue(0)
  const drag = useRef<{ id: number; start: number; samples: { y: number; t: number }[] } | null>(null)
  if (!enabled) return { y, handlers: {} }
  const end = (e: PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    const dy = e.clientY - d.start
    const v = releaseVelocity(d.samples)
    if (shouldDismiss(dy, v)) onDismiss()
    else animate(y, 0, { ...p.sheet.transition, velocity: v * 1000 })
  }
  return {
    y,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (drag.current || (e.target as HTMLElement).closest('button')) return // ignore extra touches and the close button
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { id: e.pointerId, start: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] }
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const d = drag.current
        if (!d || e.pointerId !== d.id) return
        d.samples.push({ y: e.clientY, t: e.timeStamp })
        if (d.samples.length > 6) d.samples.shift()
        y.set(dragOffset(e.clientY - d.start, window.innerHeight))
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  }
}

/** Radix Content renders asChild onto this panel, so it receives role, aria and focus props via `rest`. */
function Panel({ kind, title, showClose, grabber, drag, onDismiss, Title, children, style, ...rest }: {
  kind: Kind; title: string; showClose: boolean; grabber: boolean; drag: boolean; onDismiss: () => void
  Title: typeof RDialog.Title; children: ReactNode
} & Omit<ComponentPropsWithRef<typeof motion.div>, 'children' | 'title'>) {
  const { y, handlers } = useSheetDrag(drag && kind === 'sheet', onDismiss)
  return (
    <motion.div className="lb-ov-panel" {...rest} style={{ ...style, y }}>
      <div className="lb-ov-head" {...handlers}>
        {grabber && kind === 'sheet' && <div className="lb-grabber" aria-hidden="true" />}
        <div className="lb-ov-headrow">
          <Title className="lb-ov-title">{title}</Title>
          {showClose && <IconButton label={t('common.close')} icon="x" size={44} variant="filled" iconSize={20} onClick={onDismiss} />}
        </div>
      </div>
      <div className="lb-ov-body">{children}</div>
    </motion.div>
  )
}

export interface DialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  /** false: no close button, Escape and outside clicks do nothing (import in progress). */
  dismissible?: boolean
  children: ReactNode
}

function DialogImpl({ open, onOpenChange, title, dismissible = true, children, kind, wide, dragToDismiss = true }: DialogProps & { kind: Kind; wide?: boolean; dragToDismiss?: boolean }) {
  const block = (e: Event) => { if (!dismissible) e.preventDefault() }
  const focus = useReturnFocus()
  useInertApp(open)
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <Stage kind={kind} wide={wide} scrim={<RDialog.Overlay forceMount asChild><ScrimMotion /></RDialog.Overlay>}>
              <RDialog.Content forceMount asChild aria-describedby={undefined} {...focus} onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}>
                <Panel kind={kind} title={title} showClose={dismissible} grabber drag={dismissible && dragToDismiss} onDismiss={() => onOpenChange(false)} Title={RDialog.Title}>
                  {children}
                </Panel>
              </RDialog.Content>
            </Stage>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}

/** Centred modal dialog (Radix: focus trap, return focus, Escape). */
export function Dialog(props: DialogProps) {
  return <DialogImpl {...props} kind="dialog" />
}

export interface BottomSheetProps extends DialogProps { dragToDismiss?: boolean }

/** Phone: bottom sheet with drag/flick to dismiss. ≥ 768 px: a centred dialog (520 px). */
export function BottomSheet(props: BottomSheetProps) {
  const desktop = useIsDesktop()
  return <DialogImpl {...props} kind={desktop ? 'dialog' : 'sheet'} wide />
}

export interface AlertDialogProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  /** Extra warning line (e.g. "This book is playing now…"). */
  note?: string
  /** Word the user must type before confirming (e.g. "delete"). */
  typedConfirm?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmation for destructive or irreversible actions. Focus starts on Cancel (or the typed-confirm field). */
export function AlertDialog({ open, title, body, confirmLabel, cancelLabel, danger, note, typedConfirm, onConfirm, onCancel }: AlertDialogProps) {
  const [typed, setTyped] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const locked = !!typedConfirm && typed.trim().toLowerCase() !== typedConfirm.toLowerCase()
  const focus = useReturnFocus()
  useInertApp(open)
  return (
    <RAlert.Root open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AnimatePresence onExitComplete={() => setTyped('')}>
        {open && (
          <RAlert.Portal forceMount>
            <Stage kind="dialog" scrim={<RAlert.Overlay forceMount asChild><ScrimMotion /></RAlert.Overlay>}>
              <RAlert.Content forceMount asChild onCloseAutoFocus={focus.onCloseAutoFocus} onOpenAutoFocus={(e) => { focus.onOpenAutoFocus(); if (typedConfirm) { e.preventDefault(); input.current?.focus() } }}>
                <Panel kind="dialog" title={title} showClose={false} grabber={false} drag={false} onDismiss={onCancel} Title={RAlert.Title}>
                    <RAlert.Description className="lb-dialog-body">{body}</RAlert.Description>
                    {note && <p className="lb-dialog-note">{note}</p>}
                    {typedConfirm && (
                      <div className="lb-field">
                        <label htmlFor="lb-confirm" className="lb-field-label" style={{ fontWeight: 600 }}>{t('dialogs.typeToConfirm')}</label>
                        <input ref={input} id="lb-confirm" className="lb-input" style={{ fontWeight: 600 }} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
                      </div>
                    )}
                    <div className="lb-dialog-actions">
                      <RAlert.Cancel asChild><Button variant="secondary" size="dialog" onClick={onCancel}>{cancelLabel}</Button></RAlert.Cancel>
                      <Button variant={danger ? 'danger' : 'primary'} size="dialog" disabled={locked} onClick={onConfirm}>{confirmLabel}</Button>
                    </div>
                </Panel>
              </RAlert.Content>
            </Stage>
          </RAlert.Portal>
        )}
      </AnimatePresence>
    </RAlert.Root>
  )
}
