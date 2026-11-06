import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { version } from '../../../package.json'
import { formatBytes } from '../../components/format'
import { Button, IconButton } from '../../components/ui/Button'
import { SegmentedControl } from '../../components/ui/Controls'
import { StatusRow } from '../../components/ui/Feedback'
import { Reveal, Swap } from '../../components/ui/Reveal'
import { useTheme, type ThemePreference } from '../../theme/ThemeProvider'
import { AlertDialog, useIsDesktop } from '../../components/ui/Overlays'
import { StorageBar } from '../../components/ui/StorageBar'
import { isBookActive, isBookPlaying, stopListening } from '../../features/playback/api'
import { t } from '../../i18n'
import { isStandalone } from '../../app/env'
import { showToast, useUi } from '../../app/store'
import symbol from '../../components/brand/symbol.svg'
import symbolDark from '../../components/brand/symbol-on-dark.svg'
import { useUpdateBusy } from '../../pwa/usePwaUpdate'
import { useBackup } from '../shared/Backup'
import { maintenance, useLibrary } from '../shared/data'

const REPO = 'https://github.com/zilijonas/loudbooks'

interface Usage { books: number; covers: number; sessions: number; continuousCache: number; usage: number; free: number; persisted: boolean }

async function readUsage(): Promise<Usage> {
  const [c, est, persisted] = await Promise.all([
    maintenance.categories(),
    maintenance.estimate().catch(() => ({ usage: 0, quota: 0 }) as StorageEstimate),
    maintenance.persisted().catch(() => false),
  ])
  return { ...c, usage: est.usage ?? 0, free: Math.max(0, (est.quota ?? 0) - (est.usage ?? 0)), persisted }
}

export function SettingsPage() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const { preference, resolved, setPreference } = useTheme()
  const views = useLibrary()
  const pwa = useUi((s) => s.pwa)
  const importing = useUi((s) => s.importing)
  const busy = useUpdateBusy()
  const [usage, setUsage] = useState<Usage>()
  const [dialog, setDialog] = useState<'clear' | 'library' | null>(null)
  const [tick, setTick] = useState(0)
  const backup = useBackup()
  const picker = useRef<HTMLInputElement>(null)
  const books = views ?? []
  const playing = books.some((v) => isBookActive(v.book.id))

  useEffect(() => {
    let live = true
    readUsage().then((u) => live && setUsage(u)).catch(() => {})
    return () => { live = false }
  }, [tick, views])

  const temp = (usage?.sessions ?? 0) + (usage?.continuousCache ?? 0)
  const bookBytes = (usage?.books ?? 0) + (usage?.covers ?? 0)
  // Origin usage minus our files approximates the app shell (precache, database); never negative.
  const appBytes = Math.max(0, (usage?.usage ?? 0) - bookBytes - temp)
  const segments = [
    { label: t('settings.books'), bytes: bookBytes, tokenColor: 'var(--lb-action)', description: t('settings.booksCount', { count: books.length }) },
    { label: t('settings.cache'), bytes: usage?.continuousCache ?? 0, tokenColor: 'var(--lb-highlight)', description: t('settings.cacheSub') },
    { label: t('settings.sessions'), bytes: usage?.sessions ?? 0, tokenColor: 'var(--lb-text-muted)', description: t('settings.sessionsSub') },
    { label: t('settings.appFiles'), bytes: appBytes, tokenColor: 'var(--lb-border-strong)', description: t('settings.appFilesSub') },
  ]
  const installed = isStandalone()

  const clear = async () => {
    setDialog(null)
    const freed = await maintenance.clearTemporary().catch(() => 0)
    showToast(t('dialogs.cleared', { size: formatBytes(freed) }))
    setTick((n) => n + 1)
  }
  const deleteLibrary = async () => {
    setDialog(null)
    try {
      if (playing) await stopListening(true)
      await maintenance.deleteLibrary()
      showToast(t('dialogs.libraryDeleted'))
      navigate('/')
    } catch {
      showToast(t('dialogs.deleteFailed'))
    }
  }
  const persist = async () => {
    await maintenance.persist().catch(() => false)
    setTick((n) => n + 1)
  }

  return (
    <div className="lb-screen lb-settings">
      <div className="lb-settings-head">
        {!desktop && <IconButton label={t('player.backToLibrary')} icon="left" iconSize={26} onClick={() => navigate('/')} />}
        <h1>{t('settings.title')}</h1>
      </div>

      <section aria-labelledby="st-ap" className="lb-sec">
        <h2 id="st-ap">{t('settings.appearance')}</h2>
        <SegmentedControl<ThemePreference>
          label={t('settings.appearance')}
          value={preference}
          onChange={setPreference}
          options={[{ value: 'system', label: t('settings.system') }, { value: 'light', label: t('settings.light') }, { value: 'dark', label: t('settings.dark') }]}
        />
      </section>

      <section aria-labelledby="st-sto" className="lb-sec" data-gap="14">
        <div className="lb-sec-head"><h2 id="st-sto">{t('settings.storage')}</h2><b>{formatBytes(bookBytes + temp + appBytes)}</b></div>
        <StorageBar segments={segments} availableEstimateBytes={usage?.free} />
        <Swap id={usage?.persisted ? 'protected' : 'standard'}>
          {usage?.persisted ? (
            <StatusRow variant="card" icon="shield" tone="success" title={t('settings.protected')} body={t('settings.protectedBody')} />
          ) : (
            <StatusRow variant="card" icon="drive" tone="warning" title={t('settings.standard')} body={t('settings.standardBody')} action={{ label: t('settings.requestPersist'), onClick: () => void persist() }} />
          )}
        </Swap>
        <div className="lb-clear">
          <Button variant="secondary" disabled={temp === 0} onClick={() => setDialog('clear')}>{t('settings.clearTemp')}</Button>
          <span>{t('settings.clearTempSub')}</span>
        </div>
      </section>

      <section aria-labelledby="st-bk" className="lb-sec" data-gap="10">
        <h2 id="st-bk">{t('settings.backups')}</h2>
        <p>{t('settings.backupsBody')}</p>
        <div className="lb-actions">
          <Button variant="secondary" icon="upload" disabled={books.length === 0 || importing} onClick={() => void backup.exportLibrary()}>{t('backup.exportLibrary')}</Button>
          <Button variant="secondary" icon="archive" disabled={importing} onClick={() => picker.current?.click()}>{t('settings.importBackup')}</Button>
        </div>
        <input
          ref={picker} type="file" hidden accept=".zip,application/zip" data-testid="backup-file"
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void backup.importFile(file) }}
        />
      </section>

      <section aria-labelledby="st-app" className="lb-sec" data-gap="10">
        <h2 id="st-app">{t('settings.app')}</h2>
        <StatusRow
          icon="addHome"
          title={t(installed ? 'settings.installed' : 'settings.browser')}
          body={t(installed ? 'settings.installedSub' : 'settings.browserSub')}
          action={installed ? undefined : { label: t('library.howToInstall'), onClick: () => useUi.setState({ installOpen: true }) }}
        />
        <Swap id={pwa.offlineReady ? 'ready' : 'preparing'}>
          <StatusRow
            icon="check"
            tone="success"
            gap={3}
            title={t(pwa.offlineReady ? 'settings.offlineReady' : 'settings.preparing')}
            body={t(pwa.offlineReady ? 'settings.offlineReadySub' : 'settings.preparingSub')}
          />
        </Swap>
        <Reveal show={pwa.needRefresh}>
          <StatusRow
            icon="refresh" tone="action" gap={8} title={t('settings.update')} body={t(busy ? 'settings.updateBusy' : 'settings.updateIdle')}
            action={{ label: t('settings.restart'), onClick: () => !busy && pwa.apply() }} actionStrong actionDisabled={busy}
          />
        </Reveal>
      </section>

      <section aria-labelledby="st-ab" className="lb-sec">
        <h2 id="st-ab">{t('settings.about')}</h2>
        <div className="lb-about">
          <img src={resolved === 'dark' ? symbolDark : symbol} alt="" />
          <span><strong>{t('settings.version', { version })}</strong><span>{t('settings.license')}</span></span>
        </div>
        <p className="lb-privacy">{t('settings.privacy')}</p>
        <div className="lb-links">
          <a href={REPO} target="_blank" rel="noreferrer">{t('settings.source')}</a>
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t('settings.licenses')}</a>
        </div>
      </section>

      <section aria-labelledby="st-del" className="lb-sec" data-gap="8">
        <h2 id="st-del">{t('settings.deleteLibrary')}</h2>
        <p>{t('settings.deleteLibrarySub')}</p>
        <Button variant="danger-outline" onClick={() => setDialog('library')}>{t('settings.deleteLibraryCta')}</Button>
      </section>

      {backup.ui}
      <AlertDialog
        open={dialog === 'clear'} title={t('dialogs.clearTitle')} body={t('dialogs.clearBody', { size: formatBytes(temp) })}
        confirmLabel={t('settings.clearTemp')} cancelLabel={t('common.cancel')} onConfirm={() => void clear()} onCancel={() => setDialog(null)}
      />
      <AlertDialog
        open={dialog === 'library'} danger typedConfirm={t('dialogs.confirmWord')}
        title={t('dialogs.deleteLibraryTitle')} body={t('dialogs.deleteLibraryBody', { count: books.length, size: formatBytes(bookBytes) })}
        note={books.some((v) => isBookPlaying(v.book.id)) ? t('dialogs.deletePlaying') : undefined}
        confirmLabel={t('settings.deleteLibrary')} cancelLabel={t('common.cancel')} onConfirm={() => void deleteLibrary()} onCancel={() => setDialog(null)}
      />
    </div>
  )
}
