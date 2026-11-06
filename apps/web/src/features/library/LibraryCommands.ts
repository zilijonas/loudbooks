import { libraryRepository } from "../../services/db/LibraryRepository";
import type { ImportJob } from "../../domain/models";
import { MediaStorage } from "../../services/opfs/MediaStorage";
import { resizeCover } from "./cover";
import { exclusive } from "../import/exclusive";

export type IsActivePath = (path: string) => boolean | Promise<boolean>;
export const cleanupJob = (paths: string[]): ImportJob => ({ id: crypto.randomUUID(), stagingPaths: [...new Set(paths.filter(Boolean))], expectedFiles: paths.length, receivedFiles: 0, state: "failed", error: "cleanup" });
export const coverPath = (bookId: string, coverId: string) => `books/${bookId}/covers/${coverId}.webp`;

export class LibraryCommands {
  constructor(private readonly isActive: IsActivePath, private readonly repository = libraryRepository, private readonly storage = new MediaStorage()) {}

  private async ensureInactiveBook(id: string) {
    const [assets, sessions] = await Promise.all([this.repository.database.assets.where("bookId").equals(id).toArray(), this.repository.database.sessions.where("bookId").equals(id).toArray()]);
    for (const path of [...assets.map(asset => asset.path), ...sessions.map(session => session.outputPath)]) {
      if (path && await this.isActive(path)) throw new Error("File is active");
    }
  }

  async renameBook(id: string, title: string) {
    await this.ensureInactiveBook(id);
    if (!title.trim()) throw new Error("form.titleError");
    await this.repository.updateBook(id, { title: title.trim() });
  }
  async updateDescription(id: string, description: string) { await this.ensureInactiveBook(id); await this.repository.updateBook(id, { description }); }
  async reorderChapters(bookId: string, ids: string[]) { await this.ensureInactiveBook(bookId); await this.repository.reorderChapters(bookId, ids); }
  async renameChapter(id: string, title: string) {
    const chapter = await this.repository.database.chapters.get(id);
    if (!chapter) throw new Error("Chapter not found");
    await this.ensureInactiveBook(chapter.bookId);
    await this.repository.renameChapter(id, title);
  }

  async setCover(bookId: string, image: Blob | null) {
    return exclusive(async () => {
      await this.ensureInactiveBook(bookId);
      const book = await this.repository.database.books.get(bookId);
      if (!book) throw new Error("Book not found");
      const coverId = image ? crypto.randomUUID() : null;
      const path = coverId ? coverPath(bookId, coverId) : null;
      const staged = path ? cleanupJob([path]) : null;
      if (staged) await this.repository.saveImportJob(staged);
      try {
        if (image && path) {
          const data = await resizeCover(image);
          let writer: FileSystemWritableFileStream | undefined;
          try {
            const handle = await this.storage.handle(path, true);
            writer = await handle.createWritable();
            await writer.write(data);
            await writer.close();
          } catch (error) {
            await writer?.abort().catch(() => {});
            throw error;
          }
        }
        const old = book.coverAssetId ? coverPath(bookId, book.coverAssetId) : null;
        const cleanup = old ? cleanupJob([old]) : null;
        await this.repository.commitCover(bookId, coverId, staged?.id ?? null, cleanup);
        if (old && cleanup && !await this.isActive(old)) {
          await this.storage.delete(old);
          await this.repository.removeImportJob(cleanup.id);
        }
      } catch (error) {
        if (staged && path && await this.repository.database.imports.get(staged.id)) {
          try { await this.storage.delete(path); await this.repository.removeImportJob(staged.id); } catch { /* Recovery retains the journal. */ }
        }
        throw error;
      }
    });
  }

  async deleteBook(id: string) {
    return exclusive(async () => {
      const book = await this.repository.database.books.get(id);
      if (!book) return;
      const [assets, sessions] = await Promise.all([
        this.repository.database.assets.where("bookId").equals(id).toArray(),
        this.repository.database.sessions.where("bookId").equals(id).toArray(),
      ]);
      const paths = [...assets.map(asset => asset.path), ...sessions.map(session => session.outputPath)];
      if (book.coverAssetId) paths.push(coverPath(id, book.coverAssetId));
      for (const path of paths) if (path && await this.isActive(path)) throw new Error("File is active");
      const job = cleanupJob(paths);
      await this.repository.deleteBookMetadata(id, job);
      for (const path of job.stagingPaths) await this.storage.delete(path);
      await this.repository.removeImportJob(job.id);
    });
  }
}
