// @vitest-environment node
import "fake-indexeddb/auto";
import { createSHA256 } from "hash-wasm";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ files: new Map<string, Blob>() }));
vi.mock("../../../src/services/opfs/MediaStorage", () => ({ MediaStorage: class {
  async read(path: string) { const blob = state.files.get(path); if (!blob) throw new Error("Missing file"); return new File([blob], path); }
  async delete(path: string) { for (const key of state.files.keys()) if (key === path || key.startsWith(`${path}/`)) state.files.delete(key); }
  async list() { return []; }
  async handle(path: string) { return { createWritable: async () => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    return { write: async (chunk: Uint8Array) => { chunks.push(new Uint8Array(chunk)); }, close: async () => { state.files.set(path, new Blob(chunks)); }, abort: async () => {} };
  } }; }
} }));
vi.mock("comlink", () => ({ proxy: <T>(value: T) => value, wrap: () => ({
  probe: async () => ({ ok: true, value: { container: "MP3", codec: "mp3", channels: 1, sampleRate: 44100, duration: 10 } }),
  write: async (_id: string, path: string, file: File, progress: (bytes: number) => void) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = await createSHA256(); digest.update(bytes);
    state.files.set(path, file); progress(bytes.length);
    return { bytes: bytes.length, sha256: digest.digest("hex") };
  }, cancel: async () => {}, finish: async () => {},
}) }));
vi.stubGlobal("Worker", class { terminate() {} });
vi.stubGlobal("navigator", { locks: { request: (_name: string, work: () => Promise<unknown>) => work() } });

import { ImportCoordinator } from "../../../src/features/import/ImportCoordinator";
import { LibraryCommands } from "../../../src/features/library/LibraryCommands";
import { libraryRepository } from "../../../src/services/db/LibraryRepository";
import { exportBook } from "../../../src/features/backup/export";
import { importBackup } from "../../../src/features/backup/import";

it("roundtrips reordered chapters and progress through the repository", async () => {
  const coordinator = new ImportCoordinator();
  try {
    const book = await coordinator.importBook({ title: "Book", files: [new File(["audio one"], "one.mp3"), new File(["audio two"], "two.mp3")], ordered: true });
    const original = await libraryRepository.database.chapters.where("bookId").equals(book.id).sortBy("order");
    await libraryRepository.reorderChapters(book.id, original.map(chapter => chapter.id).reverse());
    await libraryRepository.renameChapter(original[1]!.id, "Renamed");
    const chapters = await libraryRepository.database.chapters.where("bookId").equals(book.id).sortBy("order");
    const assets = await libraryRepository.database.assets.where("bookId").equals(book.id).toArray();
    const source = chapters[0]!.sourceRanges[0]!.assetId;
    await libraryRepository.saveProgress({ bookId: book.id, bookRevision: 2, sourceAssetId: source, sourceOffset: 2, globalOffset: 2, updatedAt: 1, stopReason: null, rewindPending: false });
    const archive = await exportBook(book.id);
    await new LibraryCommands(() => false).deleteBook(book.id);
    const [restored] = await importBackup(archive.blob, { onDuplicate: () => "cancel" });
    expect(restored).toBeDefined();
    const newAssets = await libraryRepository.database.assets.where("bookId").equals(restored!.id).toArray();
    const newChapters = await libraryRepository.database.chapters.where("bookId").equals(restored!.id).sortBy("order");
    const progress = await libraryRepository.database.progress.get(restored!.id);
    expect(newAssets.map(asset => asset.sha256).sort()).toEqual(assets.map(asset => asset.sha256).sort());
    expect(newChapters.map(chapter => [chapter.order, chapter.title, chapter.globalStart, chapter.globalEnd])).toEqual(chapters.map(chapter => [chapter.order, chapter.title, chapter.globalStart, chapter.globalEnd]));
    expect(newAssets.find(asset => asset.id === progress?.sourceAssetId)?.sha256).toBe(assets.find(asset => asset.id === source)?.sha256);
    expect(progress?.sourceOffset).toBe(2);
    await expect(importBackup(archive.blob, { onDuplicate: () => "replace" })).rejects.toMatchObject({ code: "invalid" });
    expect(await libraryRepository.database.books.count()).toBe(1);
    const [replacement] = await importBackup(archive.blob, { onDuplicate: () => "replace", isActivePath: () => false });
    expect(replacement?.id).not.toBe(restored!.id);
    expect(await libraryRepository.database.books.get(restored!.id)).toBeUndefined();
    expect(await libraryRepository.database.books.count()).toBe(1);
  } finally { coordinator.dispose(); await libraryRepository.database.delete(); state.files.clear(); }
});
