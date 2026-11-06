import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryDatabase } from "../../src/services/db/database";
import { LibraryRepository } from "../../src/services/db/LibraryRepository";
import type { Book, Chapter, ImportJob, MediaAsset } from "../../src/domain/models";

const openDatabases: LibraryDatabase[] = [];
const setup = () => {
  const database = new LibraryDatabase(`test-${crypto.randomUUID()}`);
  openDatabases.push(database);
  return { database, repository: new LibraryRepository(database) };
};
afterEach(async () => { await Promise.all(openDatabases.splice(0).map(database => database.delete())); });

const book: Book = { id: "book", title: "Book", description: "", coverAssetId: null, revision: 1, createdAt: 1, updatedAt: 1, status: "ready" };
const job: ImportJob = { id: "job", stagingPaths: ["staging/job/a"], expectedFiles: 1, receivedFiles: 1, state: "staging", error: null };
const asset: MediaAsset = { id: "asset", bookId: "book", path: "staging/job/a", originalFilename: "a.mp3", container: "MP3", codec: "mp3", channels: 1, sampleRate: 44100, duration: 30, bytes: 100, sha256: "hash" };
const chapter = (id: string, order: number, start: number, end: number): Chapter => ({ id, bookId: "book", order, title: id, globalStart: start, globalEnd: end, kind: "imported", sourceRanges: [{ assetId: "asset", sourceStart: start, sourceEnd: end }] });

describe("library transactions", () => {
  it("commits book, audio metadata and journal together", async () => {
    const { database, repository } = setup();
    await repository.saveImportJob(job);
    await repository.commitImport(job, book, [asset], [chapter("one", 0, 0, 30)]);
    expect(await database.books.get("book")).toEqual(book);
    expect(await database.assets.get("asset")).toEqual(asset);
    expect((await database.imports.get("job"))?.state).toBe("ready");
  });
  it("rolls back audio and book if chapter insert fails", async () => {
    const { database, repository } = setup();
    await repository.saveImportJob(job);
    await expect(repository.commitImport(job, book, [asset], [chapter("same", 0, 0, 15), chapter("same", 1, 15, 30)])).rejects.toThrow();
    expect(await database.books.count()).toBe(0);
    expect(await database.assets.count()).toBe(0);
    expect(await database.chapters.count()).toBe(0);
    expect((await database.imports.get("job"))?.state).toBe("staging");
  });
  it("rejects an invalid reorder without changing the book", async () => {
    const { database, repository } = setup();
    await repository.commitImport(job, book, [asset], [chapter("one", 0, 0, 10), chapter("two", 1, 10, 30)]);
    await expect(repository.reorderChapters("book", ["one", "one"])).rejects.toThrow();
    expect((await database.books.get("book"))?.revision).toBe(1);
    expect((await database.chapters.orderBy("[bookId+order]").toArray()).map(({ id, globalStart, globalEnd }) => [id, globalStart, globalEnd])).toEqual([["one", 0, 10], ["two", 10, 30]]);
  });
});
