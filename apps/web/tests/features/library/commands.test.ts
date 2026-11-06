import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryDatabase } from "../../../src/services/db/database";
import { LibraryRepository } from "../../../src/services/db/LibraryRepository";
import { MediaStorage } from "../../../src/services/opfs/MediaStorage";
import { LibraryCommands } from "../../../src/features/library/LibraryCommands";
import { StorageMaintenance } from "../../../src/features/storage/StorageMaintenance";
import { generatedParts } from "../../../src/features/library/chapters";
import { ImportCoordinator } from "../../../src/features/import/ImportCoordinator";

let db: LibraryDatabase;
let repo: LibraryRepository;
beforeEach(() => { db = new LibraryDatabase(`library-test-${crypto.randomUUID()}`); repo = new LibraryRepository(db); });
class MemoryStorage extends MediaStorage {
  files = new Map<string, number>();
  fail = false;
  override async delete(path: string) { if (this.fail) throw new Error("storage unavailable"); this.files.delete(path); }
  override async list() { return []; }
  override async usage(path: string) { return this.files.get(path) ?? 0; }
}
const storage = new MemoryStorage();
afterEach(async () => { await db.delete(); storage.files.clear(); storage.fail = false; });

async function seed() {
  await db.books.put({ id: "b", title: "Book", description: "", coverAssetId: null, revision: 1, createdAt: 1, updatedAt: 1, status: "ready" });
  for (const [order, id] of ["a", "b"].entries()) {
    await db.assets.put({ id, bookId: "b", path: `staging/j/${id}`, originalFilename: id, container: "MP3", codec: "mp3", channels: 1, sampleRate: 44100, duration: 60, bytes: 1, sha256: "hash" });
    await db.chapters.put({ id, bookId: "b", order, title: id, globalStart: order * 60, globalEnd: order * 60 + 60, kind: "imported", sourceRanges: [{ assetId: id, sourceStart: 0, sourceEnd: 60 }] });
    storage.files.set(`staging/j/${id}`, 1);
  }
}
describe("library persistence", () => {
  it("removes a chapter, remaps progress, and deletes its unreferenced audio", async () => {
    await seed();
    await db.progress.put({ bookId: "b", bookRevision: 1, sourceAssetId: "b", sourceOffset: 20, globalOffset: 80, updatedAt: 1, stopReason: null, rewindPending: false });
    await new LibraryCommands(() => false, repo, storage).removeChapter("b", "a");
    expect((await db.books.get("b"))?.revision).toBe(2);
    expect(await db.progress.get("b")).toMatchObject({ bookRevision: 2, sourceAssetId: "b", sourceOffset: 20, globalOffset: 20 });
    expect(await db.assets.get("a")).toBeUndefined();
    expect(storage.files.has("staging/j/a")).toBe(false);
  });
  it("moves progress from removed audio to a remaining chapter and retains cleanup on failure", async () => {
    await seed();
    await db.books.update("b", { status: "completed" });
    await db.progress.put({ bookId: "b", bookRevision: 1, sourceAssetId: "a", sourceOffset: 20, globalOffset: 20, updatedAt: 1, stopReason: null, rewindPending: false });
    storage.fail = true;
    await expect(new LibraryCommands(() => false, repo, storage).removeChapter("b", "a")).rejects.toThrow("storage unavailable");
    expect(await db.progress.get("b")).toMatchObject({ bookRevision: 2, sourceAssetId: "b", sourceOffset: 0, globalOffset: 0 });
    expect((await db.books.get("b"))?.status).toBe("ready");
    expect(await db.imports.count()).toBe(1);
    storage.fail = false;
    await new ImportCoordinator({ repository: repo, storage, exclusive: work => work() }).recover(() => false);
    expect(storage.files.has("staging/j/a")).toBe(false);
  });
  it("toggles logical parts without changing the source position or copying audio", async () => {
    await seed();
    await db.chapters.delete("b");
    await db.assets.delete("b");
    await db.assets.update("a", { duration: 3700 });
    await db.chapters.update("a", { globalEnd: 3700, sourceRanges: [{ assetId: "a", sourceStart: 0, sourceEnd: 3700 }] });
    await db.progress.put({ bookId: "b", bookRevision: 1, sourceAssetId: "a", sourceOffset: 1850, globalOffset: 1850, updatedAt: 1, stopReason: null, rewindPending: false });
    const commands = new LibraryCommands(() => false, repo, storage);
    await commands.setGeneratedParts("b", true);
    expect(await db.chapters.where("bookId").equals("b").count()).toBe(3);
    expect(await db.progress.get("b")).toMatchObject({ bookRevision: 2, sourceOffset: 1850, globalOffset: 1850 });
    await commands.setGeneratedParts("b", false);
    expect(await db.chapters.where("bookId").equals("b").count()).toBe(1);
    expect(await db.progress.get("b")).toMatchObject({ bookRevision: 3, sourceOffset: 1850, globalOffset: 1850 });
  });
  it("reorders with new revision and remaps the current source position", async () => {
    await seed();
    await db.progress.put({ bookId: "b", bookRevision: 1, sourceAssetId: "a", sourceOffset: 20, globalOffset: 20, updatedAt: 1, stopReason: null, rewindPending: false });
    const commands = new LibraryCommands(() => false, repo, storage);
    await commands.reorderChapters("b", ["b", "a"]);
    expect((await db.books.get("b"))?.revision).toBe(2);
    expect(await db.progress.get("b")).toMatchObject({ bookRevision: 2, globalOffset: 80, sourceOffset: 20 });
    expect((await db.chapters.get("a"))?.globalStart).toBe(60);
  });
  it("does not delete a book while its source is active", async () => {
    await seed();
    const commands = new LibraryCommands(path => path === "staging/j/a", repo, storage);
    await expect(commands.deleteBook("b")).rejects.toThrow("File is active");
    expect(await db.books.get("b")).toBeDefined();
    expect(storage.files.size).toBe(2);
  });
  it("recovers file cleanup when deletion fails after metadata commits", async () => {
    await seed();
    storage.fail = true;
    await expect(new LibraryCommands(() => false, repo, storage).deleteBook("b")).rejects.toThrow("storage unavailable");
    expect(await db.books.get("b")).toBeUndefined();
    expect(await db.imports.count()).toBe(1);
    storage.fail = false;
    const coordinator = new ImportCoordinator({ repository: repo, storage, exclusive: work => work() });
    await coordinator.recover(() => false);
    expect(storage.files.size).toBe(0);
    expect(await db.imports.count()).toBe(0);
  });
  it("keeps an active old cover journaled until it is inactive", async () => {
    await seed();
    const path = "books/b/covers/cover.webp";
    await db.books.update("b", { coverAssetId: "cover" });
    storage.files.set(path, 5);
    await new LibraryCommands(p => p === path, repo, storage).setCover("b", null);
    expect(storage.files.has(path)).toBe(true);
    expect(await db.imports.count()).toBe(1);
    const coordinator = new ImportCoordinator({ repository: repo, storage, exclusive: work => work() });
    await coordinator.recover(p => p === path);
    expect(storage.files.has(path)).toBe(true);
    expect(await db.imports.count()).toBe(1);
    await coordinator.recover(() => false);
    expect(storage.files.has(path)).toBe(false);
    expect(await db.imports.count()).toBe(0);
  });
  it("leaves paused and active sessions untouched during cleanup", async () => {
    await seed();
    for (const [id, state] of [["paused", "paused"], ["playing", "ready"], ["old", "ended"]] as const) {
      await db.sessions.put({ id, bookId: "b", revision: 1, mode: "duration", rate: 1, requestedListeningSeconds: 60, actualMediaDuration: 60, outputPath: `sessions/${id}`, state, sourceMap: [], lastObservedPosition: 0 });
      storage.files.set(`sessions/${id}`, 5);
    }
    const maintenance = new StorageMaintenance(path => path === "sessions/playing", repo, storage);
    expect(await maintenance.clearTemporary()).toBe(5);
    expect([...storage.files.keys()]).toContain("sessions/paused");
    expect(await db.sessions.get("playing")).toBeDefined();
    expect(await db.sessions.get("old")).toBeUndefined();
  });
  it("generates logical half-hour parts with no source copies", async () => {
    await seed();
    const asset = (await db.assets.get("a"))!;
    const parts = generatedParts({ ...asset, duration: 3700 });
    expect(parts.map(part => part.sourceRanges[0])).toEqual([
      { assetId: "a", sourceStart: 0, sourceEnd: 1800 },
      { assetId: "a", sourceStart: 1800, sourceEnd: 3600 },
      { assetId: "a", sourceStart: 3600, sourceEnd: 3700 },
    ]);
  });
});
