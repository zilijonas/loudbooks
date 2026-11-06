// Book <-> manifest: what the sender describes, and how the receiver commits it through ImportCoordinator.
import { manifestSchema, type TransferManifest } from '@loudbooks/contracts'
import type { Book, Chapter, ImportJob, MediaAsset } from '../../domain/models'
import { db } from '../../services/db/database'
import { libraryRepository, LibraryRepository } from '../../services/db/LibraryRepository'
import { MediaStorage } from '../../services/opfs/MediaStorage'
import { coverPath } from '../library/LibraryCommands'
import { ProtocolError } from './protocol'

const storage = new MediaStorage()
export const isAudio = (f: { mime: string }) => !f.mime.startsWith('image/')
const mimeOf = (codec: string) => (codec === 'mp3' ? 'audio/mpeg' : codec === 'aac' ? 'audio/mp4' : 'audio/wav')
// File names are display data only; the receiver never uses them as paths, but they must pass the contract.
const safeName = (name: string) => [...name].map((c) => (c.charCodeAt(0) < 32 || c === '/' || c === '\\' ? '_' : c)).join('').slice(0, 255).replace(/^\.{1,2}$/, '_') || 'audio'

export interface Outgoing { manifest: TransferManifest; paths: string[]; bytes: number; audioCount: number }

/** Manifest for a stored book: audio in chapter order, then the cover (an image file no chapter references). */
export async function describeBook(bookId: string, includePosition: boolean): Promise<Outgoing> {
  const book = await db.books.get(bookId)
  if (!book) throw new Error('Book not found')
  const [chapters, assets, progress] = await Promise.all([
    db.chapters.where('bookId').equals(bookId).sortBy('order'),
    db.assets.where('bookId').equals(bookId).toArray(),
    db.progress.get(bookId),
  ])
  const order = [...new Set(chapters.flatMap((c) => c.sourceRanges.map((r) => r.assetId)))]
  assets.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9))
  const files = assets.map((a) => ({ fileId: a.id, name: safeName(a.originalFilename), size: a.bytes, sha256: a.sha256, mime: mimeOf(a.codec.startsWith('pcm-') ? 'pcm' : a.codec) }))
  const paths = assets.map((a) => a.path)
  if (book.coverAssetId) {
    const path = coverPath(book.id, book.coverAssetId)
    const cover = await storage.read(path).catch(() => null)
    if (cover) {
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await cover.arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('')
      files.push({ fileId: `cover-${book.coverAssetId}`, name: 'cover.webp', size: cover.size, sha256, mime: 'image/webp' })
      paths.push(path)
    }
  }
  const manifest = manifestSchema.parse({
    schemaVersion: 1,
    book: { title: book.title.slice(0, 1000), ...(book.description ? { description: book.description.slice(0, 10000) } : {}) },
    // shortcut: one manifest chapter per source range; multi-range chapters (not produced by V1 editing) would arrive split.
    chapters: chapters.flatMap((c) => c.sourceRanges.map((r) => ({ title: c.kind === 'generated' ? '' : c.title.slice(0, 1000), fileId: r.assetId, start: r.sourceStart, end: r.sourceEnd }))),
    files,
    ...(includePosition && progress && assets.some((a) => a.id === progress.sourceAssetId) ? { includePosition: { fileId: progress.sourceAssetId, offset: progress.sourceOffset } } : {}),
  })
  return { manifest, paths, bytes: files.reduce((n, f) => n + f.size, 0), audioCount: assets.length }
}

/** Commits received files with the sender's chapter titles/order and, when sent, the one-time listening position. */
export class TransferRepository extends LibraryRepository {
  constructor(private readonly manifest: TransferManifest) { super(libraryRepository.database) }
  override async commitImport(job: ImportJob, book: Book, assets: MediaAsset[], fallback: Chapter[]) {
    const audio = this.manifest.files.filter(isAudio)
    const byFile = new Map(audio.map((f, i) => [f.fileId, assets[i]!]))
    let at = 0
    const chapters: Chapter[] = !this.manifest.chapters.length ? fallback : this.manifest.chapters.map((c, order) => {
      const asset = byFile.get(c.fileId)
      if (!asset || c.start >= asset.duration) throw new ProtocolError('chapters')
      const end = Math.min(c.end, asset.duration)
      const chapter: Chapter = { id: crypto.randomUUID(), bookId: book.id, order, title: c.title, globalStart: at, globalEnd: at + end - c.start, kind: c.title ? 'imported' : 'generated', sourceRanges: [{ assetId: asset.id, sourceStart: c.start, sourceEnd: end }] }
      at = chapter.globalEnd
      return chapter
    })
    const pos = this.manifest.includePosition
    const asset = pos && byFile.get(pos.fileId)
    const where = asset && chapters.find((c) => c.sourceRanges[0]!.assetId === asset.id && pos.offset >= c.sourceRanges[0]!.sourceStart && pos.offset < c.sourceRanges[0]!.sourceEnd)
    const { database } = this
    await database.transaction('rw', [database.books, database.assets, database.chapters, database.imports, database.progress], async () => {
      await super.commitImport(job, book, assets, chapters)
      if (asset && where) {
        const globalOffset = where.globalStart + pos.offset - where.sourceRanges[0]!.sourceStart
        await this.saveProgress({ bookId: book.id, bookRevision: book.revision, sourceAssetId: asset.id, sourceOffset: pos.offset, globalOffset, updatedAt: Date.now(), stopReason: null, rewindPending: false })
      }
    })
  }
}
