import type { Book, Chapter, ImportJob, MediaAsset, PlaybackProgress, PlaybackSession, Settings } from "../../domain/models";
import { db, type LibraryDatabase } from "./database";

export class LibraryRepository {
  constructor(readonly database: LibraryDatabase = db) {}
  async saveImportJob(job: ImportJob) { await this.database.imports.put(job); }
  async commitImport(job: ImportJob, book: Book, assets: MediaAsset[], chapters: Chapter[]) {
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.imports], async () => {
      await this.database.assets.bulkAdd(assets);
      await this.database.chapters.bulkAdd(chapters);
      await this.database.books.add(book);
      await this.database.imports.put({ ...job, state: "ready" });
    });
  }
  async updateBook(id: string, changes: Partial<Pick<Book, "title" | "description" | "coverAssetId" | "status">>) {
    await this.database.books.update(id, { ...changes, updatedAt: Date.now() });
  }
  async reorderChapters(bookId: string, ids: string[]) {
    await this.database.transaction("rw", [this.database.books, this.database.chapters, this.database.sessions], async () => {
      const book = await this.database.books.get(bookId);
      const chapters = await this.database.chapters.where("bookId").equals(bookId).toArray();
      if (!book || ids.length !== chapters.length || new Set(ids).size !== ids.length || ids.some(id => !chapters.some(ch => ch.id === id))) throw new Error("Invalid chapter order");
      let position = 0;
      for (const [order, id] of ids.entries()) {
        const chapter = chapters.find(item => item.id === id)!;
        const duration = chapter.globalEnd - chapter.globalStart;
        await this.database.chapters.update(id, { order, globalStart: position, globalEnd: position + duration });
        position += duration;
      }
      await this.database.books.update(bookId, { revision: book.revision + 1, updatedAt: Date.now() });
    });
  }
  async renameChapter(id: string, title: string) { await this.database.chapters.update(id, { title }); }
  async saveProgress(progress: PlaybackProgress) { await this.database.progress.put(progress); }
  async saveSession(session: PlaybackSession) { await this.database.sessions.put(session); }
  async saveSettings(settings: Settings) { await this.database.settings.put(settings); }
}
export const libraryRepository = new LibraryRepository();
