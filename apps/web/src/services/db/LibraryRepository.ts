import type { Book, Chapter, ImportJob, MediaAsset, PlaybackProgress, PlaybackSession, Settings } from "../../domain/models";
import { db, type LibraryDatabase } from "./database";

export class LibraryRepository {
  constructor(readonly database: LibraryDatabase = db) {}
  async saveImportJob(job: ImportJob) { await this.database.imports.put(job); }
  async removeImportJob(id: string) { await this.database.imports.delete(id); }
  async listImportJobs() { return this.database.imports.toArray(); }
  async commitImport(job: ImportJob, book: Book, assets: MediaAsset[], chapters: Chapter[]) {
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.imports], async () => {
      await this.database.assets.bulkAdd(assets);
      await this.database.chapters.bulkAdd(chapters);
      await this.database.books.add(book);
      await this.database.imports.put({ ...job, state: "ready" });
    });
  }
  async commitAdditionalImport(job: ImportJob, book: Book, assets: MediaAsset[], oldChapters: Chapter[], chapters: Chapter[], oldAssets: MediaAsset[]) {
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.progress, this.database.imports], async () => {
      const current = await this.database.books.get(book.id);
      if (!current || current.revision !== book.revision - 1) throw new Error("Book changed during import");
      const wasGenerated = oldChapters.some(chapter => chapter.kind === "generated");
      if (wasGenerated) {
        if (oldAssets.length !== 1) throw new Error("Invalid generated parts");
        const asset = oldAssets[0]!;
        await this.database.chapters.where("bookId").equals(book.id).delete();
        await this.database.chapters.add({ id: oldChapters[0]!.id, bookId: book.id, order: 0, title: asset.originalFilename.replace(/\.[^.]+$/, ""), globalStart: 0, globalEnd: asset.duration, kind: "imported", sourceRanges: [{ assetId: asset.id, sourceStart: 0, sourceEnd: asset.duration }] });
        chapters = chapters.map((chapter, index) => ({ ...chapter, order: index + 1 }));
      }
      await this.database.assets.bulkAdd(assets);
      await this.database.chapters.bulkAdd(chapters);
      await this.database.books.update(book.id, { revision: book.revision, updatedAt: book.updatedAt, status: current.status === "completed" ? "ready" : current.status });
      const progress = await this.database.progress.get(book.id);
      if (progress) await this.database.progress.update(book.id, { bookRevision: book.revision, ...(wasGenerated && progress.sourceAssetId === oldAssets[0]?.id ? { globalOffset: progress.sourceOffset } : {}) });
      await this.database.imports.put({ ...job, state: "ready" });
    });
  }
  async updateBook(id: string, changes: Partial<Pick<Book, "title" | "description" | "coverAssetId" | "status">>) {
    if (!await this.database.books.update(id, { ...changes, updatedAt: Date.now() })) throw new Error("Book not found");
  }
  async commitCover(id: string, coverAssetId: string | null, stagedId: string | null, cleanup: ImportJob | null) {
    await this.database.transaction("rw", [this.database.books, this.database.imports], async () => {
      if (!await this.database.books.update(id, { coverAssetId, updatedAt: Date.now() })) throw new Error("Book not found");
      if (stagedId) await this.database.imports.delete(stagedId);
      if (cleanup) await this.database.imports.add(cleanup);
    });
  }
  async reorderChapters(bookId: string, ids: string[]) {
    await this.database.transaction("rw", [this.database.books, this.database.chapters, this.database.progress], async () => {
      const book = await this.database.books.get(bookId);
      const chapters = await this.database.chapters.where("bookId").equals(bookId).toArray();
      if (!book || ids.length !== chapters.length || new Set(ids).size !== ids.length || ids.some(id => !chapters.some(ch => ch.id === id))) throw new Error("Invalid chapter order");
      let position = 0;
      const progress = await this.database.progress.get(bookId);
      let remapped: number | undefined;
      for (const [order, id] of ids.entries()) {
        const chapter = chapters.find(item => item.id === id)!;
        const duration = chapter.globalEnd - chapter.globalStart;
        if (progress) {
          let rangeStart = position;
          for (const range of chapter.sourceRanges) {
            if (range.assetId === progress.sourceAssetId && progress.sourceOffset >= range.sourceStart && progress.sourceOffset <= range.sourceEnd) {
              remapped = rangeStart + progress.sourceOffset - range.sourceStart;
            }
            rangeStart += range.sourceEnd - range.sourceStart;
          }
        }
        await this.database.chapters.update(id, { order, globalStart: position, globalEnd: position + duration });
        position += duration;
      }
      const revision = book.revision + 1;
      await this.database.books.update(bookId, { revision, updatedAt: Date.now() });
      if (progress && remapped !== undefined) await this.database.progress.update(bookId, { bookRevision: revision, globalOffset: remapped });
    });
  }
  async replaceChapters(bookId: string, chapters: Chapter[], removedAssetIds: string[] = [], cleanup?: ImportJob, fallbackIndex = 0) {
    await this.database.transaction("rw", [this.database.books, this.database.chapters, this.database.assets, this.database.progress, this.database.imports], async () => {
      const book = await this.database.books.get(bookId);
      if (!book || !chapters.length) throw new Error("Book must have audio");
      const progress = await this.database.progress.get(bookId);
      const revision = book.revision + 1;
      if (cleanup) await this.database.imports.add(cleanup);
      await this.database.chapters.where("bookId").equals(bookId).delete();
      await this.database.chapters.bulkAdd(chapters);
      await this.database.assets.bulkDelete(removedAssetIds);
      await this.database.books.update(bookId, { revision, updatedAt: Date.now() });
      if (progress) {
        let mapped: { sourceAssetId: string; sourceOffset: number; globalOffset: number } | undefined;
        for (const chapter of chapters) {
          let start = chapter.globalStart;
          for (const range of chapter.sourceRanges) {
            if (range.assetId === progress.sourceAssetId && progress.sourceOffset >= range.sourceStart && progress.sourceOffset <= range.sourceEnd) {
              mapped = { sourceAssetId: range.assetId, sourceOffset: progress.sourceOffset, globalOffset: start + progress.sourceOffset - range.sourceStart };
              break;
            }
            start += range.sourceEnd - range.sourceStart;
          }
          if (mapped) break;
        }
        if (!mapped) {
          const chapter = chapters[Math.min(fallbackIndex, chapters.length - 1)]!;
          const range = chapter.sourceRanges[0]!;
          mapped = { sourceAssetId: range.assetId, sourceOffset: range.sourceStart, globalOffset: chapter.globalStart };
          await this.database.progress.update(bookId, { stopReason: null, rewindPending: false });
          if (book.status === "completed") await this.database.books.update(bookId, { status: "ready" });
        }
        await this.database.progress.update(bookId, { ...mapped, bookRevision: revision });
      }
    });
  }
  async renameChapter(id: string, title: string) { await this.database.chapters.update(id, { title }); }
  async deleteBookMetadata(id: string, cleanup: ImportJob) {
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.progress, this.database.sessions, this.database.imports], async () => {
      await this.database.imports.add(cleanup);
      await this.database.assets.where("bookId").equals(id).delete();
      await this.database.chapters.where("bookId").equals(id).delete();
      await this.database.sessions.where("bookId").equals(id).delete();
      await this.database.progress.delete(id);
      await this.database.books.delete(id);
    });
  }
  async deleteLibraryMetadata(cleanup: ImportJob) {
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.progress, this.database.sessions, this.database.imports], async () => {
      await this.database.imports.add(cleanup);
      await Promise.all([this.database.books.clear(), this.database.assets.clear(), this.database.chapters.clear(), this.database.progress.clear(), this.database.sessions.clear()]);
    });
  }
  async deleteSession(id: string, cleanup: ImportJob) {
    await this.database.transaction("rw", [this.database.sessions, this.database.imports], async () => {
      await this.database.imports.add(cleanup);
      await this.database.sessions.delete(id);
    });
  }
  async saveProgress(progress: PlaybackProgress) { await this.database.progress.put(progress); }
  async saveSession(session: PlaybackSession) { await this.database.sessions.put(session); }
  async saveSettings(settings: Settings) { await this.database.settings.put(settings); }
}
export const libraryRepository = new LibraryRepository();
