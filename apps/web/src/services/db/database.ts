import Dexie, { type Table } from "dexie";
import type { Book, Chapter, ImportJob, MediaAsset, PlaybackProgress, PlaybackSession, Settings, TransferJob } from "../../domain/models";

export class LibraryDatabase extends Dexie {
  books!: Table<Book, string>;
  assets!: Table<MediaAsset, string>;
  chapters!: Table<Chapter, string>;
  progress!: Table<PlaybackProgress, string>;
  sessions!: Table<PlaybackSession, string>;
  imports!: Table<ImportJob, string>;
  transfers!: Table<TransferJob, string>;
  settings!: Table<Settings, string>;

  constructor(name = "loud-books-v1") {
    super(name);
    this.version(1).stores({
      books: "id, status, updatedAt", assets: "id, bookId", chapters: "id, bookId, [bookId+order]",
      progress: "bookId", sessions: "id, bookId", imports: "id, state", transfers: "id, state", settings: "id",
    });
  }
}
export const db = new LibraryDatabase();
