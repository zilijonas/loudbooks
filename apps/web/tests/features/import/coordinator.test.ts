import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ImportCoordinator } from "../../../src/features/import/ImportCoordinator";
import { LibraryDatabase } from "../../../src/services/db/database";
import { LibraryRepository } from "../../../src/services/db/LibraryRepository";
import { MemoryStorage, MemoryWriter } from "./memory-storage";

const databases: LibraryDatabase[] = [];
const makeFile = (name: string) => new File([name], name);
const setup = () => {
  const database = new LibraryDatabase(`test-${crypto.randomUUID()}`);
  databases.push(database);
  const repository = new LibraryRepository(database);
  const storage = new MemoryStorage();
  const writer = new MemoryWriter(storage);
  const coordinator = new ImportCoordinator({
    repository, storage, writer,
    probeFile: async (file: File) => ({ container: file.name.endsWith(".wav") ? "WAVE" : "MP3", codec: file.name.endsWith(".wav") ? "pcm-s16" : "mp3", channels: 1, sampleRate: 44100, duration: 10 }),
    exclusive: async <T>(work: () => Promise<T>) => work(),
  });
  return { database, repository, storage, writer, coordinator };
};
afterEach(async () => { await Promise.all(databases.splice(0).map(database => database.delete())); });

describe("import coordinator", () => {
  it("commits only complete files with naturally sorted chapter offsets", async () => {
    const { database, storage, coordinator } = setup();
    const book = await coordinator.importBook({ title: "Test", files: [makeFile("chapter 10.mp3"), makeFile("chapter 2.mp3")] });
    const chapters = await database.chapters.where("bookId").equals(book.id).sortBy("order");
    const assets = await database.assets.where("bookId").equals(book.id).toArray();
    expect(book.status).toBe("ready");
    expect(chapters.map(ch => [ch.title, ch.globalStart, ch.globalEnd])).toEqual([["chapter 2", 0, 10], ["chapter 10", 10, 20]]);
    expect(assets).toHaveLength(2);
    for (const asset of assets) expect((await storage.read(asset.path)).name).toBe(asset.originalFilename);
  });
  it("cleans a cancelled import without exposing a book", async () => {
    const { database, storage, writer, coordinator } = setup();
    const abort = new AbortController();
    writer.onWrite = () => abort.abort();
    await expect(coordinator.importBook({ title: "Test", files: [makeFile("a.mp3")], signal: abort.signal })).rejects.toMatchObject({ code: "importing.stopped" });
    expect(await database.books.count()).toBe(0);
    expect(storage.files.size).toBe(0);
  });
  it("does not start an import with an already aborted signal", async () => {
    const { database, storage, coordinator } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(coordinator.importBook({ title: "Test", files: [makeFile("a.mp3")], signal: abort.signal })).rejects.toMatchObject({ code: "importing.stopped" });
    expect(await database.books.count()).toBe(0);
    expect(storage.files.size).toBe(0);
  });
  it("leaves existing books intact on quota failure", async () => {
    const { database, storage, writer, coordinator } = setup();
    const saved = await coordinator.importBook({ title: "Saved", files: [makeFile("old.mp3")] });
    const oldPath = (await database.assets.where("bookId").equals(saved.id).first())!.path;
    writer.quota = true;
    await expect(coordinator.importBook({ title: "New", files: [makeFile("new.mp3")] })).rejects.toMatchObject({ code: "importing.quotaTitle" });
    expect((await database.books.toArray()).map(book => book.id)).toEqual([saved.id]);
    expect((await storage.read(oldPath)).name).toBe("old.mp3");
  });
  it("rejects incompatible chapters and cleans staged files", async () => {
    const { database, storage, coordinator } = setup();
    await expect(coordinator.importBook({ title: "Test", files: [makeFile("a.mp3"), makeFile("b.wav")] })).rejects.toMatchObject({ code: "form.mismatch" });
    expect(await database.books.count()).toBe(0);
    expect(storage.files.size).toBe(0);
  });
  it("recovery removes incomplete and orphan staging while retaining ready assets", async () => {
    const { database, repository, storage, coordinator } = setup();
    const saved = await coordinator.importBook({ title: "Saved", files: [makeFile("old.mp3")] });
    const savedPath = (await database.assets.where("bookId").equals(saved.id).first())!.path;
    storage.files.set("staging/incomplete/a", makeFile("partial"));
    storage.files.set("staging/orphan/b", makeFile("orphan"));
    await repository.saveImportJob({ id: "incomplete", stagingPaths: ["staging/incomplete/a"], expectedFiles: 1, receivedFiles: 0, state: "staging", error: null });
    await coordinator.recover(() => false);
    expect([...storage.files.keys()]).toEqual([savedPath]);
    expect(await database.imports.get("incomplete")).toBeUndefined();
    expect(await database.books.get(saved.id)).toBeDefined();
  });
  it("keeps the journal when recovery cannot delete a partial file", async () => {
    const { database, repository, storage, coordinator } = setup();
    const path = "staging/incomplete/a";
    storage.files.set(path, makeFile("partial"));
    await repository.saveImportJob({ id: "incomplete", stagingPaths: [path], expectedFiles: 1, receivedFiles: 0, state: "staging", error: null });
    const remove = storage.delete.bind(storage);
    storage.delete = async () => { throw new DOMException("Denied", "NotAllowedError"); };
    await expect(coordinator.recover(() => false)).rejects.toThrow();
    expect(await database.imports.get("incomplete")).toBeDefined();
    expect(storage.files.has(path)).toBe(true);
    storage.delete = remove;
    await coordinator.recover(() => false);
    expect(await database.imports.get("incomplete")).toBeUndefined();
    expect(storage.files.has(path)).toBe(false);
  });
  it("recovery preserves resumable transfers and referenced session files", async () => {
    const { database, repository, storage, coordinator } = setup();
    const path = "staging/receive-1/audio.mp3";
    const sessionPath = "sessions/session-1/audio.mp3";
    storage.files.set(path, makeFile("received"));
    storage.files.set(sessionPath, makeFile("session"));
    await database.transfers.put({ id: "receive-1", manifestDigest: "digest", fileOffsets: {}, verifiedFiles: [], state: "interrupted", expiresAt: 0 });
    await repository.saveSession({ id: "session-1", bookId: "book", revision: 1, mode: "duration", rate: 1, requestedListeningSeconds: 30, actualMediaDuration: 30, outputPath: sessionPath, state: "paused", sourceMap: [], lastObservedPosition: 0 });
    await repository.saveImportJob({ id: "cleanup", stagingPaths: [sessionPath], expectedFiles: 0, receivedFiles: 0, state: "staging", error: null });
    await coordinator.recover();
    expect([...storage.files.keys()].sort()).toEqual([sessionPath, path].sort());
  });

  it("defers cleanup of an active old cover until the file is released", async () => {
    const { database, repository, storage, coordinator } = setup();
    const path = "books/book/covers/old.webp";
    storage.files.set(path, makeFile("cover"));
    await repository.saveImportJob({ id: "cover-cleanup", stagingPaths: [path], expectedFiles: 0, receivedFiles: 0, state: "staging", error: null });
    await coordinator.recover();
    expect(storage.files.has(path)).toBe(true);
    await coordinator.recover(candidate => candidate === path);
    expect(await database.imports.get("cover-cleanup")).toBeDefined();
    await coordinator.recover(() => false);
    expect(storage.files.has(path)).toBe(false);
    expect(await database.imports.get("cover-cleanup")).toBeUndefined();
  });

  it("preserves active staging files and deferred journals during orphan sweep", async () => {
    const { database, repository, storage, coordinator } = setup();
    const active = "staging/deleted-book/audio.mp3";
    const orphanActive = "staging/orphan/nested/audio.mp3";
    const removable = "staging/removable/audio.mp3";
    for (const path of [active, orphanActive, removable]) storage.files.set(path, makeFile(path));
    await repository.saveImportJob({ id: "cleanup", stagingPaths: [active], expectedFiles: 1, receivedFiles: 0, state: "failed", error: "cleanup" });
    await coordinator.recover();
    expect([...storage.files.keys()]).toHaveLength(3);
    await coordinator.recover(path => path === active || path === orphanActive);
    expect(storage.files.has(active)).toBe(true);
    expect(storage.files.has(orphanActive)).toBe(true);
    expect(storage.files.has(removable)).toBe(false);
    expect(await database.imports.get("cleanup")).toBeDefined();
    await coordinator.recover(() => false);
    expect(storage.files.size).toBe(0);
    expect(await database.imports.get("cleanup")).toBeUndefined();
  });

});
