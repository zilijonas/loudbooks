// Adapter from the LB-4 library rows to the LB-5 planner timeline.
import type { Book, Chapter, MediaAsset, PlaybackProgress } from '../../domain/models'
import type { BookTimeline } from '../../domain/session-planner'

/**
 * Assets in book order = order of first appearance in the ordered chapters' source ranges.
 * shortcut: assumes each asset plays contiguously (true for imported chapters and unreordered generated parts);
 * upgrade to range-based timelines if generated parts of one file can be reordered apart.
 */
export function toTimeline(book: Book, chapters: Chapter[], assets: MediaAsset[]): BookTimeline {
  const ordered = [...chapters].sort((a, b) => a.order - b.order)
  const byId = new Map(assets.map((a) => [a.id, a]))
  const ids = [...new Set(ordered.flatMap((c) => c.sourceRanges.map((r) => r.assetId)))]
  return {
    bookId: book.id,
    revision: book.revision,
    assets: ids.map((id) => {
      const asset = byId.get(id)
      if (!asset) throw new Error(`Asset ${id} of book ${book.id} is missing`)
      return { assetId: id, duration: asset.duration }
    }),
    chapters: ordered.map((c) => ({ id: c.id, globalStart: c.globalStart, globalEnd: c.globalEnd })),
  }
}

/** PlaybackProgress row for a global position (source asset + offset survive chapter reorders). */
export function progressAt(
  timeline: BookTimeline,
  position: number,
  stopReason: PlaybackProgress['stopReason'],
  rewindPending: boolean,
): PlaybackProgress {
  let offset = 0
  let i = 0
  // The last asset owns the book end.
  while (i < timeline.assets.length - 1 && position >= offset + timeline.assets[i]!.duration) offset += timeline.assets[i++]!.duration
  const asset = timeline.assets[i]!
  return {
    bookId: timeline.bookId,
    bookRevision: timeline.revision,
    sourceAssetId: asset.assetId,
    sourceOffset: Math.min(Math.max(0, position - offset), asset.duration),
    globalOffset: position,
    updatedAt: Date.now(),
    stopReason,
    rewindPending,
  }
}
