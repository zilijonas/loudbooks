import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { showToast } from '../../app/store'
import { BookCover, type BookSummary } from '../../components/books/BookCover'
import { formatBytes } from '../../components/format'
import { Ic } from '../../components/icons'
import { PairingCode, QR } from '../../components/transfer/Transfer'
import { Button } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Controls'
import { StatusPanel, type StatusPanelProps } from '../../components/ui/Feedback'
import { AlertDialog, BottomSheet } from '../../components/ui/Overlays'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { useTransfer, type Progress } from './store'
import { closeSend, setIncludePosition, startSend, submitCode } from './TransferCoordinator'
import './transfer.css'

/** Wraps the first occurrence of `word` in <strong> (design steps bold the button names). */
export function emph(text: string, word: string): ReactNode {
  const i = text.indexOf(word)
  return i < 0 ? text : <>{text.slice(0, i)}<strong>{word}</strong>{text.slice(i + word.length)}</>
}

/** "138 of 270 MB" as in the design; whole MB below 1 GB. */
export function progressFor(title: string, s: Progress): StatusPanelProps['progress'] {
  const done = s.bytesTotal >= 1e9 ? formatBytes(s.bytesDone) : String(Math.round(s.bytesDone / 1e6))
  return {
    value: s.bytesTotal ? Math.min(1, s.bytesDone / s.bytesTotal) : 0,
    label: t('common.bytesOf', { done, total: formatBytes(s.bytesTotal) }),
    sub: t('receive.fileOf', { n: s.fileIndex, total: s.fileCount }),
  }
}

function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [on])
  return now
}

export interface SendDialogProps { book: BookSummary; bytes: number; files: number }

/** "Send to another device" (sheet on phone, centred dialog ≥ 768 px). Opens when `startSend(book.id)` runs. */
export function SendDialog({ book, bytes, files }: SendDialogProps) {
  const s = useTransfer((x) => x.send)
  const open = s.bookId === book.id
  const p = usePreset()
  const [stop, setStop] = useState(false)
  const now = useNow(open && (s.step === 'qr' || s.step === 'code'))
  const sending = open && s.step === 'sending'

  // Escape during an active send asks first (state matrix T12).
  useEffect(() => {
    if (!sending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStop(true) }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [sending])

  const left = Math.max(0, Math.ceil((s.expiresAt - now) / 1000))
  const retry = () => startSend(book.id, true)
  const close = { label: t('common.close'), onClick: closeSend }
  const panels: Partial<Record<string, StatusPanelProps>> = {
    connecting: { icon: 'wifi', title: t('send.connecting'), body: t('send.sameWifi'), indeterminate: true },
    sending: { align: 'start', tone: 'action', icon: 'send', title: t('send.sending', { title: book.title }), progress: progressFor(book.title, s), note: t('send.keepOpen'), secondary: { label: t('common.cancel'), onClick: () => setStop(true) } },
    verifying: { icon: 'shield', title: t('send.verifying'), body: t('send.almostDone'), indeterminate: true },
    done: { tone: 'success', icon: 'check', title: t('send.done'), body: t('send.doneBody', { title: book.title }), primary: { label: t('send.doneAction'), onClick: closeSend } },
    failed: { tone: 'warning', icon: 'wifi', title: t('send.failed'), body: t('send.failedBody'), note: t('send.keptFiles'), primary: { label: t('common.tryAgain'), onClick: retry }, secondary: close },
    signaling: { tone: 'warning', icon: 'wifi', title: t('send.signaling'), body: t('send.signalingBody'), primary: { label: t('common.tryAgain'), onClick: retry }, secondary: close },
  }
  const panel = panels[s.step] ?? null
  const view = panel ? `panel-${s.step}` : s.step

  return (
    <>
      <BottomSheet open={open} onOpenChange={(o) => { if (!o) closeSend() }} title={t('send.title')} dismissible={!sending}>
        <div className="lb-send-book">
          <BookCover book={book} size="xs" style={{ '--w': '40px' } as CSSProperties} />
          <span>
            <strong>{book.title}</strong>
            <span>{t('send.bookInfo', { size: formatBytes(bytes), count: files })}</span>
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} className="lb-send-step" {...p.reveal}>
            {s.step === 'qr' && (
              <>
                <div className="lb-send-qr">
                  {s.link ? <QR payload={s.link} label={t('send.step2')} /> : <div className="lb-qr lb-qr-wait" style={{ width: 200, height: 200 }}><Ic name="spin" size={28} /></div>}
                  <ol>
                    <li>{t('send.step1')}</li>
                    <li>{emph(t('send.step2'), t('common.receive'))}</li>
                    <li>{t('send.step3')}</li>
                  </ol>
                </div>
                <div role="status" className="lb-send-wait"><Ic name="spin" size={18} />{t('send.waiting', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}</div>
                <Button variant="secondary" size="sm" icon="link" className="lb-btn lb-send-copy" disabled={!s.link} onClick={() => {
                  navigator.clipboard?.writeText(s.link!).then(() => showToast(t('send.copied')), () => {})
                }}>{t('send.copyLink')}</Button>
                <Switch label={t('send.includePosition')} description={t('send.includePositionSub')} checked={s.includePosition} onChange={setIncludePosition} />
              </>
            )}
            {s.step === 'code' && <CodeEntry />}
            {panel && <div className="lb-send-panel"><StatusPanel {...panel} /></div>}
          </motion.div>
        </AnimatePresence>
      </BottomSheet>
      <AlertDialog
        open={stop && sending}
        danger
        title={t('send.stopTitle')}
        body={t('send.stopBody')}
        confirmLabel={t('send.stop')}
        cancelLabel={t('send.keep')}
        onConfirm={() => { setStop(false); closeSend() }}
        onCancel={() => setStop(false)}
      />
    </>
  )
}

/** Code typed from the phone; mounted only in the code step, so it starts empty each time. */
function CodeEntry() {
  const s = useTransfer((x) => x.send)
  const [code, setCode] = useState('')
  const [incomplete, setIncomplete] = useState(false)
  const locked = s.codeError === 'locked'
  const error = locked ? t('send.locked') : s.codeError === 'wrong' ? t('send.wrong', { n: s.triesLeft }) : incomplete ? t('send.incomplete') : undefined
  const pair = () => {
    if (code.length < 6) setIncomplete(true)
    else submitCode(code)
  }
  return (
    <>
      <PairingCode role="enter" digits={code} error={error} disabled={locked} onChange={(v) => { setCode(v); setIncomplete(false) }} onSubmit={pair} />
      <Button size="lg" fullWidth disabled={locked} loading={s.checking} onClick={pair}>{t('send.pair')}</Button>
    </>
  )
}
