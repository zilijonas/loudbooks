import type { Chapter, MediaAsset } from "../../domain/models";

export function generatedParts(asset: MediaAsset): Chapter[] {
  const chapters: Chapter[] = [];
  for (let start = 0; start < asset.duration; start += 1800) {
    const end = Math.min(start + 1800, asset.duration);
    chapters.push({
      id: crypto.randomUUID(), bookId: asset.bookId, order: chapters.length,
      title: "", globalStart: start, globalEnd: end,
      kind: "generated", sourceRanges: [{ assetId: asset.id, sourceStart: start, sourceEnd: end }],
    });
  }
  return chapters;
}
