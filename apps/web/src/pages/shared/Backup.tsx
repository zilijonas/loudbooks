import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { formatBytes } from '../../components/format'
import { StatusPanel } from '../../components/ui/Feedback'
import { AlertDialog, Dialog } from '../../components/ui/Overlays'
import type { Book } from '../../domain/models'
import { exportBook, exportLibrary } from '../../features/backup/export'
import { importBackup } from '../../features/backup/import'
import { BackupError } from '../../features/backup/inspect'
import { ImportError } from '../../features/import/probe'
import { isActivePath, isBookActive, stopListening } from '../../features/playback/api'
import { t } from '../../i18n'
import { usePreset } from '../../motion/presets'
import { showToast, useUi } from '../../app/store'

type Choice = 'keep-both' | 'replace' | 'cancel'
type Phase =
  | { kind: 'working'; mode: 'export' | 'import'; title: string; written: number; total: number }
  | { kind: 'duplicate'; book: Book; decide: (choice: Choice) => void }
  | { kind: 'failed'; body: string }
  | { kind: 'quota'; need: number; free: number }

type Made = { blob: Blob; filename: string }
type Progress = (written: number, total: number) => void

function save({ blob, filename }: Made) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000) // Safari starts the download asynchronously
}

/** Backup export/import with its progress, duplicate prompt and error panels. Render `ui` once next to the trigger. */
export function useBackup() {
  const p = usePreset()
  const [phase, setPhase] = useState<Phase | null>(null)
  const [last, setLast] = useState(phase) // keep the content while the dialog animates out
  const [askStop, setAskStop] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const busy = useRef(false)
  if (phase && phase !== last) setLast(phase)
  const shown = phase ?? last

  const start = async (first: Phase, work: (progress: Progress) => Promise<Phase | null>) => {
    if (busy.current) return
    busy.current = true
    useUi.setState({ importing: true }) // blocks the update restart
    setPhase(first)
    let next: Phase | null = null
    try {
      next = await work((written, total) => setPhase((s) => (s?.kind === 'working' ? { ...s, written, total } : s)))
    } finally {
      setPhase(next)
      abort.current = null
      setAskStop(false)
      busy.current = false
      useUi.setState({ importing: false })
    }
  }

  const runExport = (title: string, make: (progress: Progress) => Promise<Made>) =>
    start({ kind: 'working', mode: 'export', title, written: 0, total: 0 }, async (progress) => {
      try {
        const made = await make(progress)
        save(made)
        showToast(t('backup.exported', { name: made.filename }))
      } catch {
        showToast(t('backup.exportFailed'))
      }
      return null
    })

  const importFile = (file: File) => {
    const controller = new AbortController()
    abort.current = controller
    const working = { kind: 'working', mode: 'import', title: t('backup.importTitle'), written: 0, total: 0 } as const
    return start(working, async (progress) => {
      const seen = { written: 0, total: 0 }
      try {
        const books = await importBackup(file, {
          signal: controller.signal,
          isActivePath,
          onProgress: (written, total) => { Object.assign(seen, { written, total }); progress(written, total) },
          onDuplicate: (book) => new Promise<Choice>((resolve) => {
            const decide = async (choice: Choice) => {
              if (choice === 'replace' && isBookActive(book.id)) await stopListening(true) // never delete the file under the player
              setPhase({ ...working, ...seen })
              resolve(choice)
            }
            setPhase({ kind: 'duplicate', book, decide })
          }),
        })
        showToast(t('backup.imported', { count: books.length }))
        return null
      } catch (error) {
        const code = error instanceof BackupError || error instanceof ImportError ? error.code : ''
        if (code === 'cancelled' || code === 'importing.stopped') {
          showToast(t('backup.stopped'))
          return null
        }
        if (code === 'importing.quotaTitle') {
          const est = await navigator.storage?.estimate?.().catch(() => undefined)
          return { kind: 'quota', need: seen.total, free: Math.max(0, (est?.quota ?? 0) - (est?.usage ?? 0)) }
        }
        return { kind: 'failed', body: t(code === 'invalid' ? 'backup.invalid' : code === 'size' || code === 'hash' ? 'backup.damaged' : 'backup.failed') }
      }
    })
  }

  const close = () => setPhase(null)
  let panel = null
  if (shown?.kind === 'working') {
    const { mode, title, written, total } = shown
    panel = (
      <StatusPanel
        align="start" tone="action" icon={mode === 'import' ? 'download' : 'archive'} title={title}
        progress={{ value: total ? written / total : 0, label: t(mode === 'export' ? 'backup.exporting' : written === 0 ? 'importing.checking' : written < total ? 'importing.copying' : 'importing.saving'), sub: t('common.bytesOf', { done: Math.round(written / 1e6), total: formatBytes(total) }) }}
        note={t('importing.note')}
        secondary={mode === 'import' ? { label: t('common.cancel'), onClick: () => setAskStop(true) } : undefined}
      />
    )
  } else if (shown?.kind === 'duplicate') {
    const { book, decide } = shown
    panel = (
      <StatusPanel
        tone="warning" icon="alert" title={t('receive.duplicate')} body={t('backup.duplicateBody', { title: book.title })}
        note={isBookActive(book.id) ? t('dialogs.deletePlaying') : undefined}
        primary={{ label: t('receive.keepBoth'), onClick: () => void decide('keep-both') }}
        secondary={{ label: t('backup.replace'), onClick: () => void decide('replace') }}
        tertiary={{ label: t('common.cancel'), onClick: () => void decide('cancel') }}
      />
    )
  } else if (shown?.kind === 'quota') {
    panel = <StatusPanel tone="danger" icon="drive" title={t('importing.quotaTitle')} body={t('importing.quotaBody', { need: formatBytes(shown.need), free: formatBytes(shown.free) })} primary={{ label: t('common.close'), onClick: close }} />
  } else if (shown?.kind === 'failed') {
    panel = <StatusPanel tone="danger" icon="alert" title={t('importing.stoppedTitle')} body={shown.body} primary={{ label: t('common.close'), onClick: close }} />
  }

  const ui = (
    <>
      <Dialog open={!!phase} onOpenChange={() => {}} dismissible={false} title={t(shown?.kind === 'working' && shown.mode === 'export' ? 'backup.exportDialog' : shown?.kind === 'quota' || shown?.kind === 'failed' ? 'importing.stoppedTitle' : 'importing.dialogTitle')}>
        <div className="lb-import">
          <AnimatePresence mode="wait" initial={false}>
            {panel && <motion.div key={shown!.kind} {...p.reveal}>{panel}</motion.div>}
          </AnimatePresence>
        </div>
      </Dialog>
      <AlertDialog
        open={askStop && phase?.kind === 'working'} danger
        title={t('dialogs.stopImportTitle')} body={t('backup.stopBody')}
        confirmLabel={t('dialogs.stopImport')} cancelLabel={t('dialogs.keepImporting')}
        onConfirm={() => { abort.current?.abort(); setAskStop(false) }} onCancel={() => setAskStop(false)}
      />
    </>
  )

  return {
    ui,
    exportBook: (book: Book) => runExport(t('backup.exportTitle', { title: book.title }), (progress) => exportBook(book.id, progress)),
    exportLibrary: () => runExport(t('backup.exportLibraryTitle'), (progress) => exportLibrary(progress)),
    importFile,
  }
}
