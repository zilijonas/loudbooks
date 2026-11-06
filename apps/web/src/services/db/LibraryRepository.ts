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
