import { z } from "zod";

const id = z.string().min(1).max(128);
const nonnegative = z.number().finite().nonnegative();
const size = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const path = z.string().min(1).max(1024).refine(value => !value.startsWith("/") && !value.includes("\\") && !/^[A-Za-z]:/.test(value) && value.split("/").every(part => part !== "" && part !== "." && part !== ".."));
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const book = z.object({ id, title: z.string().min(1).max(1000), description: z.string().max(10000), coverAssetId: id.nullable(), revision: size, createdAt: nonnegative, updatedAt: nonnegative, status: z.enum(["ready", "completed", "missing"]) }).strict();
const asset = z.object({ id, bookId: id, name: path, size, sha256, bytes: size, originalFilename: z.string().min(1).max(255), container: z.string().min(1).max(255), codec: z.string().min(1).max(255), channels: size, sampleRate: size, duration: nonnegative }).strict();
const range = z.object({ assetId: id, sourceStart: nonnegative, sourceEnd: nonnegative }).strict();
const chapter = z.object({ id, bookId: id, order: size, title: z.string().max(1000), globalStart: nonnegative, globalEnd: nonnegative, kind: z.enum(["imported", "generated"]), sourceRanges: z.array(range).min(1).max(65536) }).strict();
const progress = z.object({ bookId: id, bookRevision: size, sourceAssetId: id, sourceOffset: nonnegative, globalOffset: nonnegative, updatedAt: nonnegative, stopReason: z.string().max(255).nullable(), rewindPending: z.boolean() }).strict();
const cover = z.object({ name: path, size, sha256 }).strict();
export const backupManifestSchema = z.object({ schemaVersion: z.literal(1), app: z.literal("loudbooks"), books: z.array(z.object({ book, chapters: z.array(chapter).min(1).max(65536), assets: z.array(asset).min(1).max(65536), progress: progress.optional(), cover: cover.optional() }).strict()).max(65536) }).strict().superRefine((manifest, context) => {
  const names = new Set(["manifest.json"]);
  const bookIds = new Set<string>();
  let total = 0;
  for (const item of manifest.books) {
    const ids = new Set(item.assets.map(file => file.id));
    const chapters = new Set(item.chapters.map(ch => ch.id));
    const orders = new Set(item.chapters.map(ch => ch.order));
    if (bookIds.has(item.book.id) || ids.size !== item.assets.length || chapters.size !== item.chapters.length || orders.size !== item.chapters.length || [...orders].some(order => order >= orders.size) || Boolean(item.cover) !== Boolean(item.book.coverAssetId)) context.addIssue({ code: "custom", message: "Invalid book references" });
    bookIds.add(item.book.id);
    for (const file of [...item.assets, ...(item.cover ? [item.cover] : [])]) {
      total += file.size;
      if (names.has(file.name) || !Number.isSafeInteger(total)) context.addIssue({ code: "custom", message: "Invalid file references" });
      names.add(file.name);
    }
    if (item.assets.some(file => file.bookId !== item.book.id || file.bytes !== file.size || file.channels < 1 || file.sampleRate < 1) || item.chapters.some(ch => ch.bookId !== item.book.id || ch.globalEnd < ch.globalStart || ch.sourceRanges.some(r => !ids.has(r.assetId) || r.sourceEnd < r.sourceStart || r.sourceEnd > item.assets.find(asset => asset.id === r.assetId)!.duration)) || (item.progress && (item.progress.bookId !== item.book.id || !ids.has(item.progress.sourceAssetId) || item.progress.sourceOffset > item.assets.find(asset => asset.id === item.progress!.sourceAssetId)!.duration))) context.addIssue({ code: "custom", message: "Invalid metadata references" });
  }
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
