import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { BookSummary } from '../../components/books/BookCover'
import { formatClock, formatDuration } from '../../components/format'
import type { Book, Chapter, MediaAsset, PlaybackProgress } from '../../domain/models'
import { ImportCoordinator } from '../../features/import/ImportCoordinator'
import { coverPath, LibraryCommands } from '../../features/library/LibraryCommands'
import { isActivePath } from '../../features/playback/api'
import { StorageMaintenance } from '../../features/storage/StorageMaintenance'
import { t } from '../../i18n'
import { db } from '../../services/db/database'
import { MediaStorage } from '../../services/opfs/MediaStorage'

// One instance each for the app's lifetime; all share the player guard and the storage lock.
export const commands = new LibraryCommands(isActivePath)
export const maintenance = new StorageMaintenance(isActivePath)
export const importer = new ImportCoordinator()
const storage = new MediaStorage()

export interface BookView {
  book: Book
  chapters: Chapter[]
  assets: MediaAsset[]
  progress?: PlaybackProgress
  summary: BookSummary
  bytes: number
  /** Generated 30-minute parts instead of the author's chapters. */
  parts: boolean
}

function toView(book: Book, chapters: Chapter[], assets: MediaAsset[], progress?: PlaybackProgress): BookView {
  const durationSec = chapters.at(-1)?.globalEnd ?? assets.reduce((a, x) => a + x.duration, 0)
  const positionSec = book.status === 'completed' ? durationSec : Math.min(durationSec, progress?.globalOffset ?? 0)
  return {
    book, chapters, assets, progress, bytes: assets.reduce((a, x) => a + x.bytes, 0),
    parts: chapters.some((c) => c.kind === 'generated'),
    summary: { id: book.id, title: book.title, durationSec, positionSec, status: book.status, chapterCount: chapters.length, singleFile: assets.length === 1 },
  }
}

/** Every book with its chapters, assets and progress, newest first. `undefined` while loading. */
export function useLibrary(): BookView[] | undefined {
  return useLiveQuery(async () => {
    const [books, chapters, assets, progress] = await Promise.all([db.books.toArray(), db.chapters.toArray(), db.assets.toArray(), db.progress.toArray()])
    // Not Map.groupBy: iOS 17.0–17.3 lacks it.
    const by = <T extends { bookId: string }>(rows: T[]) => rows.reduce((m, r) => m.set(r.bookId, [...(m.get(r.bookId) ?? []), r]), new Map<string, T[]>())
    const ch = by(chapters), as = by(assets), pr = new Map(progress.map((p) => [p.bookId, p]))
    return books
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => toView(b, (ch.get(b.id) ?? []).sort((x, y) => x.order - y.order), as.get(b.id) ?? [], pr.get(b.id)))
  }, [])
}

/** Index of the chapter that holds the listening position. */
export const chapterIndexAt = (chapters: Chapter[], pos: number) => {
  const i = chapters.findIndex((c) => pos < c.globalEnd)
  return i < 0 ? Math.max(0, chapters.length - 1) : i
}

/** Display title: generated parts are "Part n", a single imported file is the whole book. */
export function chapterTitle(v: BookView, c: Chapter, i: number) {
  if (c.kind === 'generated') return c.title || t('details.part', { n: i + 1 })
  return v.chapters.length === 1 && v.assets.length === 1 ? t('details.wholeBook') : c.title
}

/** "Chapter 3 of 14 · 6 h 45 min left" (Continue card, mini-player). */
export function chapterLine(v: BookView) {
  const { durationSec, positionSec } = v.summary
  const left = formatDuration(durationSec - positionSec)
  if (v.chapters.length < 2) return t('library.left', { duration: left })
  const n = chapterIndexAt(v.chapters, positionSec) + 1
  return t(v.parts ? 'library.partLine' : 'library.chapterLine', { n, total: v.chapters.length, left })
}

/** Details primary action label. */
export function resumeLabel(v: BookView) {
  const { positionSec } = v.summary
  if (v.chapters.length < 2) return t('details.resumeAt', { time: formatClock(positionSec) })
  const n = chapterIndexAt(v.chapters, positionSec) + 1
  return t(v.parts ? 'details.resumePart' : 'details.resumeChapter', { n })
}

// shortcut: object URLs live for the app session (covers are small WebP files); revoke on cover change if memory ever matters.
const coverUrls = new Map<string, string>()

/** Object URL for a stored cover, or undefined for the generated fallback. Cached so shared-cover transitions don't flash. */
export function useCoverUrl(book: Pick<Book, 'id' | 'coverAssetId'> | undefined) {
  const key = book?.coverAssetId ? coverPath(book.id, book.coverAssetId) : null
  const [, setLoaded] = useState(0)
  useEffect(() => {
    if (!key || coverUrls.has(key)) return
    let live = true
    storage.read(key).then((file) => {
      coverUrls.set(key, URL.createObjectURL(file))
      if (live) setLoaded((n) => n + 1)
    }).catch(() => { /* unreadable cover: the generated art stays */ })
    return () => { live = false }
  }, [key])
  return key ? coverUrls.get(key) : undefined
}

/** BookSummary with its stored cover (when any) for the presentational components. */
export function useSummary(v: BookView): BookSummary {
  const url = useCoverUrl(v.book)
  return url ? { ...v.summary, cover: { kind: 'image', url } } : v.summary
}

/** Browser estimate of what is still free for the app (bytes), refreshed when `dep` changes. */
export function useFreeSpace(dep?: unknown) {
  const [free, setFree] = useState<number>()
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setFree(Math.max(0, (e.quota ?? 0) - (e.usage ?? 0)))).catch(() => {})
  }, [dep])
  return free
}
