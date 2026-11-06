import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useBlocker, useNavigate, useParams } from 'react-router'
import { EditableChapterList, type EditableChapter } from '../../components/books/Chapters'
import { CoverPicker } from '../../components/books/CoverPicker'
import { formatBytes, formatDuration } from '../../components/format'
import { Button } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Controls'
import { StatusPanel } from '../../components/ui/Feedback'
import { FileDropzone, TextArea, TextField } from '../../components/ui/Fields'
import { TopBar } from '../../components/ui/Navigation'
import { AlertDialog, Dialog, useIsDesktop } from '../../components/ui/Overlays'
import { Reveal } from '../../components/ui/Reveal'
import { Ic } from '../../components/icons'
import { ImportError, naturalSort } from '../../features/import/probe'
import { coverPath } from '../../features/library/LibraryCommands'
import { isBookActive, releaseBook } from '../../features/playback/api'
import { t } from '../../i18n'
import { db } from '../../services/db/database'
import { MediaStorage } from '../../services/opfs/MediaStorage'
import { showToast, useUi } from '../../app/store'
import { chapterTitle, commands, importer, useFreeSpace, useLibrary, type BookView } from '../shared/data'

const ACCEPT = ['.mp3', '.m4a', '.m4b', '.wav', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/x-m4b', 'audio/wav', 'audio/x-wav']

interface Row extends EditableChapter {
  file?: File
  codec?: string
  sampleRate?: number
  channels?: number
  /** Title the row started with: unchanged titles are not written back. */
  initialTitle: string
}

/** "Quiet Rooms 2 - The Reading Room.mp3" → "The Reading Room" (design cleanName). */
const cleanName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/^.*?\d+\s*-\s*/, '') || name
const ext = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? name).toUpperCase()

type ImportState = { kind: 'running'; written: number; total: number } | { kind: 'quota'; need: number; free: number } | null

export function BookFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { id } = useParams()
  const views = useLibrary()
  if (mode === 'add') return <BookForm mode="add" />
  if (views === undefined) return null
  const view = views.find((v) => v.book.id === id)
  if (!view) return <Navigate to="/" replace />
  return <BookForm mode="edit" view={view} />
}

function rowsFromBook(v: BookView): Row[] {
  const assets = new Map(v.assets.map((a) => [a.id, a]))
  if (v.parts && v.assets.length === 1) {
    const a = v.assets[0]!
    const title = a.originalFilename.replace(/\.[^.]+$/, '')
    return [{ id: v.chapters[0]!.id, title, initialTitle: title, filename: a.originalFilename, durationSec: a.duration, bytes: a.bytes, codec: a.codec, sampleRate: a.sampleRate, channels: a.channels, status: 'ok' }]
  }
  return v.chapters.map((c, i) => {
    const asset = assets.get(c.sourceRanges[0]?.assetId ?? '')
    const title = chapterTitle(v, c, i)
    return { id: c.id, title, initialTitle: title, filename: asset?.originalFilename ?? '', durationSec: c.globalEnd - c.globalStart, bytes: c.kind === 'imported' ? asset?.bytes : undefined, codec: asset?.codec, sampleRate: asset?.sampleRate, channels: asset?.channels, status: 'ok' }
  })
}

function BookForm({ mode, view }: { mode: 'add' | 'edit'; view?: BookView }) {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const edit = mode === 'edit'
  const [title, setTitle] = useState(view?.book.title ?? '')
  const [desc, setDesc] = useState(view?.book.description ?? '')
  const [cover, setCover] = useState<Blob | null>(null)
  const [coverChanged, setCoverChanged] = useState(false)
  const [rows, setRows] = useState<Row[]>(() => (view ? rowsFromBook(view) : []))
  const [parts, setParts] = useState(view?.parts ?? false)
  const [touched, setTouched] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [imp, setImp] = useState<ImportState>(null)
  const [askStop, setAskStop] = useState(false)
  const [saving, setSaving] = useState(false)
  const done = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const free = useFreeSpace(rows.length)
  const playing = !!view && isBookActive(view.book.id)

  // Existing cover image (edit): shown in the picker until replaced or removed.
  useEffect(() => {
    if (!view?.book.coverAssetId) return
    let live = true
    new MediaStorage().read(coverPath(view.book.id, view.book.coverAssetId)).then((f) => live && setCover(f)).catch(() => {})
    return () => { live = false }
  }, [view?.book.id, view?.book.coverAssetId])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !done.current && currentLocation.pathname !== nextLocation.pathname)
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true) }

  // Mismatched codecs are only known once every row is checked: the first usable file sets the family.
  const first = rows.find((r) => r.status === 'ok' && r.codec)
  const display: Row[] = rows.map((r) => (r.status === 'ok' && r.codec && first && (r.codec !== first.codec || r.sampleRate !== first.sampleRate || r.channels !== first.channels) ? { ...r, status: 'error', error: t('form.mismatch') } : r))
  const ok = display.filter((r) => r.status === 'ok')
  const seconds = ok.reduce((a, r) => a + (r.durationSec ?? 0), 0)
  const bytes = ok.reduce((a, r) => a + (r.bytes ?? r.file?.size ?? 0), 0)
  const single = ok.length === 1 && display.length === 1
  const titleErr = touched && !title.trim() ? t('form.titleError') : ''
  const filesErr = !touched ? '' : display.length === 0 ? t('form.filesNone') : display.some((r) => r.status === 'error') ? t('form.filesError') : display.some((r) => r.status === 'checking') ? t('form.filesChecking') : ''

  const addFiles = async (files: File[]) => {
    const added: Row[] = naturalSort(files).map((file) => ({ id: crypto.randomUUID(), file, title: cleanName(file.name), initialTitle: cleanName(file.name), filename: file.name, bytes: file.size, status: 'checking' }))
    setRows((r) => [...r, ...added])
    setDirty(true)
    for (const row of added) {
      const patch: Partial<Row> = await importer.check(row.file!).then(
        (info) => ({ status: 'ok' as const, durationSec: info.duration, codec: info.codec, sampleRate: info.sampleRate, channels: info.channels }),
        () => ({ status: 'error' as const, error: t('form.unsupported', { format: ext(row.filename) }) }),
      )
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, ...patch } : x)))
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    setRows((r) => { const n = [...r]; const [x] = n.splice(from, 1); n.splice(to, 0, x!); return n })
    setDirty(true)
  }

  const leave = () => navigate(edit ? `/book/${view!.book.id}` : '/')

  const finish = (to: string, toast: string) => {
    done.current = true
    navigate(to, { replace: true })
    showToast(toast)
  }

  const runImport = async () => {
    const files = ok.map((r) => r.file!)
    const total = files.reduce((a, f) => a + f.size, 0)
    const controller = new AbortController()
    abort.current = controller
    setImp({ kind: 'running', written: 0, total })
    useUi.setState({ importing: true })
    try {
      const book = await importer.importBook({
        title, description: desc.trim(), files, cover: cover ?? undefined, generatedParts: single && parts, ordered: true, signal: controller.signal,
        onProgress: (written, all) => setImp((s) => (s?.kind === 'running' ? { kind: 'running', written, total: all } : s)),
      })
      // Chapter titles typed in the form replace the file names the importer used.
      if (!(single && parts)) {
        const chapters = await db.chapters.where('bookId').equals(book.id).sortBy('order')
        for (const [i, c] of chapters.entries()) {
          const typed = ok[i]?.title.trim()
          if (typed && typed !== c.title) await commands.renameChapter(c.id, typed)
        }
      }
      setImp(null)
      useUi.setState({ newBookId: book.id })
      finish(`/book/${book.id}`, t('library.added'))
    } catch (error) {
      const code = error instanceof ImportError ? error.code : null
      if (code === 'importing.quotaTitle') {
        const est = await navigator.storage?.estimate?.().catch(() => undefined)
        setImp({ kind: 'quota', need: total, free: Math.max(0, (est?.quota ?? 0) - (est?.usage ?? 0)) })
      } else {
        setImp(null)
        showToast(t('importing.stopped'))
      }
    } finally {
      abort.current = null
      setAskStop(false)
      useUi.setState({ importing: false })
    }
  }

  const saveEdit = async () => {
    const v = view!
    const wasPlaying = isBookActive(v.book.id)
    setSaving(true)
    try {
      await releaseBook(v.book.id)
      const id = v.book.id
      const added = rows.filter(r => r.file)
      if (added.length) await commands.addFiles(id, added.map(r => r.file!))
      let current = await db.chapters.where('bookId').equals(id).sortBy('order')
      const appended = current.slice(current.length - added.length)
      const resolved = rows.map(r => r.file ? { ...r, id: appended[added.indexOf(r)]!.id } : r)
      if (!v.parts || added.length) {
        for (const chapter of current) if (!resolved.some(r => r.id === chapter.id)) await commands.removeChapter(id, chapter.id)
        current = await db.chapters.where('bookId').equals(id).sortBy('order')
        const order = resolved.map(r => r.id)
        if (order.some((rid, i) => rid !== current[i]?.id)) await commands.reorderChapters(id, order)
        for (const r of resolved) if (r.title.trim() && (r.file || r.title.trim() !== r.initialTitle)) await commands.renameChapter(r.id, r.title.trim())
      }
      if (single) await commands.setGeneratedParts(id, parts)
      if (v.parts && !parts && !added.length && rows[0]?.title.trim() && rows[0].title.trim() !== rows[0].initialTitle) {
        const chapter = await db.chapters.where('bookId').equals(id).first()
        if (chapter) await commands.renameChapter(chapter.id, rows[0].title.trim())
      }
      if (title.trim() !== v.book.title) await commands.renameBook(id, title)
      if (desc.trim() !== v.book.description) await commands.updateDescription(id, desc.trim())
      if (coverChanged) await commands.setCover(id, cover)
      finish(`/book/${id}`, t(wasPlaying ? 'form.savedPlaying' : 'form.saved'))
    } catch {
      const [book, chapters, assets] = await Promise.all([db.books.get(v.book.id), db.chapters.where('bookId').equals(v.book.id).sortBy('order'), db.assets.where('bookId').equals(v.book.id).toArray()])
      if (book && book.revision !== v.book.revision) {
        const current = { ...v, book, chapters, assets, parts: chapters.some(c => c.kind === 'generated') }
        setRows(rowsFromBook(current))
        setParts(current.parts)
      }
      showToast(t('form.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    setTouched(true)
    // I2: focus lands on the title field when it is what blocks saving.
    if (!title.trim()) requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.lb-form .lb-input')?.focus())
    if (!title.trim() || display.length === 0 || display.some((r) => r.status !== 'ok') || saving || imp) return
    if (edit) void saveEdit()
    else void runImport()
  }

  const phase = imp?.kind === 'running' ? (imp.written === 0 ? 'importing.checking' : imp.written < imp.total ? 'importing.copying' : 'importing.saving') : 'importing.checking'

  return (
    <div>
      <TopBar title={t(edit ? 'form.editTitle' : 'form.addTitle')} onClose={leave} action={{ label: t('common.save'), onClick: () => save() }} />
      <form className="lb-form" onSubmit={save} noValidate>
        <Reveal show={edit && playing}><p role="note" className="lb-warnnote">{t('form.editPlaying')}</p></Reveal>
        <CoverPicker title={title} image={cover} onChange={(img) => { setCover(img); setCoverChanged(true); setDirty(true) }} />
        <TextField label={t('form.title')} value={title} onChange={change(setTitle)} required error={titleErr} />
        <TextArea label={t('form.description')} value={desc} onChange={change(setDesc)} required={false} />
        <div className="lb-files">
          <div className="lb-files-head"><strong>{t('form.files')}</strong><span>{t('form.filesHelp')}</span></div>
          <FileDropzone accept={ACCEPT} onFiles={(f) => void addFiles(f)} label={t(rows.length ? 'form.addMore' : 'form.choose')} note={desktop ? undefined : ''} />
          <Reveal show={!!filesErr} as="span" className="lb-error" role="alert"><Ic name="alert" size={16} />{filesErr}</Reveal>
          {display.length > 0 && (
            <div className="lb-files-sum">
              <span>{ok.length === 0 ? t('form.noFiles') : ok.length === 1 ? t('form.oneFile', { duration: formatDuration(seconds) }) : t('form.chapters', { count: ok.length, duration: formatDuration(seconds) })}</span>
              <span>{formatBytes(bytes)}</span>
            </div>
          )}
          <EditableChapterList
            items={display}
            onReorder={move}
            onRename={(rid, v) => { setRows((r) => r.map((x) => (x.id === rid ? { ...x, title: v } : x))); setDirty(true) }}
            onRemove={(rid) => { setRows((r) => r.filter((x) => x.id !== rid)); setDirty(true) }}
          />
          <Reveal show={single}>
            <Switch label={t('form.parts')} description={parts ? t('form.partsOn', { count: Math.ceil(seconds / 1800) }) : t('form.partsOff')} checked={parts} onChange={change(setParts)} />
          </Reveal>
        </div>
        {!edit && <p className="lb-form-note">{ok.length && free !== undefined ? t('form.storage', { size: formatBytes(bytes), free: formatBytes(free) }) : t('form.local')}</p>}
        <Button type="submit" size="lg" fullWidth loading={saving}>{t(edit ? 'form.saveChanges' : 'form.saveBook')}</Button>
      </form>

      <Dialog open={!!imp} onOpenChange={() => {}} dismissible={false} title={t(imp?.kind === 'quota' ? 'importing.stoppedTitle' : 'importing.dialogTitle')}>
        <div className="lb-import">
          {imp?.kind === 'quota' ? (
            <StatusPanel
              tone="danger" icon="drive" title={t('importing.quotaTitle')}
              body={t('importing.quotaBody', { need: formatBytes(imp.need), free: formatBytes(imp.free) })}
              primary={{ label: t('importing.openSettings'), onClick: () => { setImp(null); done.current = true; navigate('/settings') } }}
              secondary={{ label: t('importing.backToForm'), onClick: () => setImp(null) }}
            />
          ) : (
            <StatusPanel
              align="start" tone="action" icon="download" title={t('importing.title', { title: title.trim() })}
              progress={imp ? { value: imp.total ? imp.written / imp.total : 0, label: t(phase), sub: t('common.bytesOf', { done: Math.round(imp.written / 1e6), total: formatBytes(imp.total) }) } : undefined}
              note={t('importing.note')}
              secondary={{ label: t('common.cancel'), onClick: () => setAskStop(true) }}
            />
          )}
        </div>
      </Dialog>
      <AlertDialog
        open={askStop && imp?.kind === 'running'} danger
        title={t('dialogs.stopImportTitle')} body={t('dialogs.stopImportBody')}
        confirmLabel={t('dialogs.stopImport')} cancelLabel={t('dialogs.keepImporting')}
        onConfirm={() => abort.current?.abort()} onCancel={() => setAskStop(false)}
      />
      <AlertDialog
        open={blocker.state === 'blocked'} danger
        title={t(edit ? 'dialogs.discardEditTitle' : 'dialogs.discardTitle')} body={t(edit ? 'dialogs.discardEditBody' : 'dialogs.discardBody')}
        confirmLabel={t('dialogs.discard')} cancelLabel={t('dialogs.keepEditing')}
        onConfirm={() => blocker.proceed?.()} onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}
