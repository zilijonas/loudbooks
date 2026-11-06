import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { isSafariTab } from '../../app/env'
import { useUi } from '../../app/store'
import { formatBytes } from '../../components/format'
import { Ic } from '../../components/icons'
import { PairingCode, ReceiveScanner } from '../../components/transfer/Transfer'
import { Button, IconButton } from '../../components/ui/Button'
import { StatusPanel, type StatusPanelProps } from '../../components/ui/Feedback'
import { TextField } from '../../components/ui/Fields'
import { AlertDialog } from '../../components/ui/Overlays'
import { parsePairingLink, type Pairing } from '../../features/transfer/protocol'
import { emph, progressFor } from '../../features/transfer/SendDialog'
import { useTransfer } from '../../features/transfer/store'
import { answerReceive, discardReceive, receiveActive, showReceive, startReceive, stopReceive } from '../../features/transfer/TransferCoordinator'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'

let lastPairing: Pairing | null = null
const pair = (p: Pairing) => { lastPairing = p; startReceive(p) }

/** `#/receive/r/<room>.<token>.<exp>`: a pairing link opened directly. Starts pairing and drops the token from the URL. */
export function ReceiveLink() {
  const [pairing] = useState(() => parsePairingLink(location.href))
  useEffect(() => { if (pairing) pair(pairing); else showReceive('paste') }, [pairing])
  return <Navigate to="/receive" replace />
}

async function cameraGranted() {
  try { return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state === 'granted' } catch { return false }
}
const scan = async () => showReceive(await cameraGranted() ? 'scanning' : 'permission')

/** Camera preview + QR decoding. The camera starts only on this step and stops on a result or unmount. */
function Scanner() {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    let scanner: import('qr-scanner').default | null = null
    let done = false
    const finish = () => { done = true; scanner?.destroy(); scanner = null }
    void import('qr-scanner').then(async ({ default: QrScanner }) => {
      if (done || !video.current) return
      scanner = new QrScanner(video.current, (result) => {
        const p = parsePairingLink(result.data)
        if (!p || done) return // not ours: keep looking
        finish()
        pair(p)
      }, { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 8 })
      try { await scanner.start() } catch { if (!done) { finish(); showReceive('denied') } }
    })
    return finish
  }, [])
  return (
    <ReceiveScanner onPasteInstead={() => showReceive('paste')} onCancel={() => showReceive('intro')}>
      <video ref={video} muted playsInline />
    </ReceiveScanner>
  )
}

function Paste() {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const connect = () => {
    const p = parsePairingLink(value)
    if (p) pair(p)
    else setError(true)
  }
  return (
    <>
      <p className="lb-receive-lead">{emph(t('receive.pasteHelp'), t('send.copyLink'))}</p>
      <form className="lb-receive-paste" onSubmit={(e) => { e.preventDefault(); connect() }}>
        <TextField label={t('receive.pasteLabel')} value={value} inputMode="url" onChange={(v) => { setValue(v); setError(false) }} error={error ? t('receive.pasteError') : undefined} />
      </form>
      <div className="lb-receive-actions">
        <Button size="dialog" onClick={connect}>{t('receive.connect')}</Button>
        <Button variant="quiet" size="sm" style={{ height: 44, fontSize: 15 }} onClick={() => showReceive('intro')}>{t('common.cancel')}</Button>
      </div>
    </>
  )
}

export function ReceivePage() {
  const navigate = useNavigate()
  const p = usePreset()
  const r = useTransfer((s) => s.receive)
  const [stop, setStop] = useState(false)
  // A finished or abandoned flow starts over on each visit (keyed by location: a quick back-and-forth can bring
  // back the exiting page instance instead of mounting a new one). A lost connection stays for "Pair again".
  const { key } = useLocation()
  useEffect(() => {
    const { step } = useTransfer.getState().receive
    if (!receiveActive() && !['disconnected', 'intro'].includes(step)) showReceive('intro')
  }, [key])
  const busy = r.step === 'receiving' || r.step === 'verifying'
  const back = () => (busy ? setStop(true) : navigate('/'))
  const library = { label: t('player.backToLibrary'), onClick: () => navigate('/') }

  const panels: Partial<Record<string, StatusPanelProps>> = {
    denied: { tone: 'warning', icon: 'camera', title: t('receive.denied'), body: t('receive.deniedBody'), primary: { label: t('receive.paste'), onClick: () => showReceive('paste') }, secondary: { label: t('receive.tryCamera'), onClick: () => showReceive('permission') } },
    expired: { tone: 'warning', icon: 'info', title: t('receive.expired'), body: t('receive.expiredBody'), primary: { label: t('receive.scanAgain'), onClick: scan } },
    connecting: { icon: 'wifi', title: t('receive.connecting'), body: t('send.sameWifi'), indeterminate: true },
    receiving: { align: 'start', tone: 'action', icon: 'download', title: t('receive.receiving', { title: r.title }), body: '', progress: progressFor(r.title, r), note: t('receive.keepOpen'), secondary: { label: t('common.cancel'), onClick: () => setStop(true) } },
    verifying: { icon: 'shield', title: t('receive.verifying'), body: t('receive.verifyingBody'), indeterminate: true },
    success: { tone: 'success', icon: 'check', title: t('receive.success'), body: t('receive.successBody', { title: r.title }), primary: { label: t('receive.openBook'), onClick: () => navigate(`/book/${r.bookId}`) }, secondary: library },
    disconnected: { tone: 'warning', icon: 'wifi', title: t('receive.lost'), body: t('receive.lostBody'), note: t('receive.lostNote'), primary: { label: t('receive.pairAgain'), onClick: scan }, secondary: { label: t('receive.cancelRemove'), onClick: () => void discardReceive() } },
    storage: { tone: 'danger', icon: 'drive', title: t('receive.storage'), body: t('receive.storageBody', { need: formatBytes(r.need), free: formatBytes(r.free) }), note: t('receive.storageNote'), primary: { label: t('settings.clearTemp'), onClick: () => answerReceive('clear') }, secondary: { label: t('common.cancel'), onClick: () => answerReceive('cancel') } },
    duplicate: { icon: 'book', title: t('receive.duplicate'), body: t('receive.duplicateBody', { title: r.title }), primary: { label: t('receive.keepBoth'), onClick: () => answerReceive('keep-both') }, secondary: { label: t('receive.replace'), onClick: () => answerReceive('replace') }, tertiary: { label: t('common.cancel'), onClick: () => answerReceive('cancel') } },
    signaling: { tone: 'warning', icon: 'wifi', title: t('receive.signaling'), body: t('receive.signalingBody'), primary: { label: t('common.tryAgain'), onClick: () => (lastPairing ? pair(lastPairing) : void scan()) }, secondary: library },
  }
  const panel = panels[r.step] ?? null

  return (
    <div className="lb-screen lb-receive">
      <div className="lb-receive-head">
        <IconButton label={t('player.backToLibrary')} icon="left" iconSize={26} onClick={back} />
        <h1>{t('receive.title')}</h1>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={panel ? 'panel' : r.step} className="lb-receive-step" {...p.reveal}>
          {r.step === 'intro' && (
            <>
              <p className="lb-receive-lead">{t('receive.intro')}</p>
              <ol className="lb-receive-steps">
                <li><span>{emph(t('receive.step1'), t('common.send'))}</span></li>
                <li><span>{t('receive.step2')}</span></li>
                <li><span>{t('receive.step3')}</span></li>
              </ol>
              {isSafariTab() && (
                <div className="lb-safari">
                  <Ic name="info" size={22} />
                  <span>
                    {t('receive.safari')}
                    <button type="button" className="lb-textlink" onClick={() => useUi.setState({ installOpen: true })}>{t('library.howToInstall')}</button>
                  </span>
                </div>
              )}
              <div className="lb-receive-actions">
                <Button size="lg" icon="camera" onClick={() => void scan()}>{t('receive.scan')}</Button>
                <Button size="dialog" variant="secondary" icon="link" onClick={() => showReceive('paste')}>{t('receive.paste')}</Button>
              </div>
              <p className="lb-receive-note">{t('receive.wifi')}</p>
            </>
          )}
          {r.step === 'permission' && (
            <div className="lb-receive-ask">
              <div className="lb-receive-badge"><Ic name="camera" size={30} /></div>
              <h2>{t('receive.cameraTitle')}</h2>
              <p>{t('receive.cameraBody')}</p>
              <div className="lb-receive-actions">
                <Button size="dialog" onClick={() => showReceive('scanning')}>{t('receive.continue')}</Button>
              </div>
            </div>
          )}
          {r.step === 'scanning' && <Scanner />}
          {r.step === 'paste' && <Paste />}
          {r.step === 'code' && r.code && (
            <div className="lb-receive-code">
              <span className="lb-eyebrow">{t('receive.found')}</span>
              <h2>{t('receive.typeCode')}</h2>
              <PairingCode role="show" digits={r.code} />
              <div role="status" className="lb-send-wait"><Ic name="spin" size={18} />{t('receive.waiting')}</div>
              <p>{t('receive.codeNote')}</p>
              <Button variant="secondary" onClick={() => showReceive('intro')}>{t('common.cancel')}</Button>
            </div>
          )}
          {panel && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={r.step} className="lb-receive-card" {...p.reveal}>
                <StatusPanel {...panel} />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </AnimatePresence>
      <AlertDialog
        open={stop && busy}
        danger
        title={t('receive.stopTitle')}
        body={t('receive.stopBody')}
        confirmLabel={t('receive.stop')}
        cancelLabel={t('receive.keep')}
        onConfirm={() => { setStop(false); void stopReceive() }}
        onCancel={() => setStop(false)}
      />
    </div>
  )
}
