import { libraryRepository, type LibraryRepository } from "../../services/db/LibraryRepository";
import { MediaStorage } from "../../services/opfs/MediaStorage";
import { cleanupJob, coverPath, type IsActivePath } from "../library/LibraryCommands";
import { exclusive } from "../import/exclusive";

export class StorageMaintenance {
  constructor(private readonly isActive: IsActivePath, private readonly repository: LibraryRepository = libraryRepository, private readonly storage = new MediaStorage()) {}

  async estimate() { return navigator.storage.estimate(); }
  async persist() { return navigator.storage.persist?.() ?? false; }
  async persisted() { return navigator.storage.persisted?.() ?? false; }

  async categories() {
    const [books, assets, sessions] = await Promise.all([
      this.repository.database.books.toArray(), this.repository.database.assets.toArray(), this.repository.database.sessions.toArray(),
    ]);
    const size = async (paths: string[]) => (await Promise.all(paths.filter(Boolean).map(path => this.storage.usage(path)))).reduce((sum, n) => sum + n, 0);
    const [bookBytes, coverBytes, sessionBytes, cacheBytes] = await Promise.all([
      size(assets.map(asset => asset.path)),
      size(books.flatMap(book => book.coverAssetId ? [coverPath(book.id, book.coverAssetId)] : [])),
      size(sessions.filter(session => session.kind !== "continuous-cache").map(session => session.outputPath)),
      size(sessions.filter(session => session.kind === "continuous-cache").map(session => session.outputPath)),
    ]);
    return { books: bookBytes, covers: coverBytes, sessions: sessionBytes, continuousCache: cacheBytes };
  }

  async clearTemporary() {
    return exclusive(async () => {
      let removed = 0;
      const sessions = await this.repository.database.sessions.toArray();
      for (const session of sessions) {
        if (!session.outputPath || ["playing", "paused", "preparing", "rebuilding"].includes(session.state) || await this.isActive(session.outputPath)) continue;
        const bytes = await this.storage.usage(session.outputPath);
        const job = cleanupJob([session.outputPath]);
        await this.repository.deleteSession(session.id, job);
        await this.storage.delete(session.outputPath);
        await this.repository.removeImportJob(job.id);
        removed += bytes;
      }
      return removed;
    });
  }

  async deleteLibrary() {
    return exclusive(async () => {
      const books = await this.repository.database.books.toArray();
      const [assets, sessions] = await Promise.all([this.repository.database.assets.toArray(), this.repository.database.sessions.toArray()]);
      const paths = [...assets.map(asset => asset.path), ...sessions.map(session => session.outputPath), ...books.flatMap(book => book.coverAssetId ? [coverPath(book.id, book.coverAssetId)] : [])];
      for (const path of paths) if (path && await this.isActive(path)) throw new Error("File is active");
      const job = cleanupJob(paths);
      await this.repository.deleteLibraryMetadata(job);
      for (const path of job.stagingPaths) await this.storage.delete(path);
      await this.repository.removeImportJob(job.id);
    });
  }
}
