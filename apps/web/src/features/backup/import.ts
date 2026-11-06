import { proxy, wrap } from "comlink";
import type { Book, ImportJob, MediaAsset } from "../../domain/models";
import { libraryRepository, LibraryRepository } from "../../services/db/LibraryRepository";
import { MediaStorage } from "../../services/opfs/MediaStorage";
import type { StorageWorker } from "../../workers/storage.worker";
import { ImportCoordinator, type ImportWriter } from "../import/ImportCoordinator";
import { exclusive } from "../import/exclusive";
import { LibraryCommands, type IsActivePath } from "../library/LibraryCommands";
import { BackupError, inspectBackup } from "./inspect";
import { extractVerified } from "./extract";
import type { BackupManifest } from "./manifest";

type BackupBook = BackupManifest["books"][number];
export type BackupImportOptions = {
  onProgress?: (written: number, total: number) => void;
  signal?: AbortSignal;
  onDuplicate: (book: Book) => "keep-both" | "replace" | "cancel" | Promise<"keep-both" | "replace" | "cancel">;
  isActivePath?: IsActivePath;
};

class RestoreRepository extends LibraryRepository {
  constructor(private readonly source: BackupBook) { super(libraryRepository.database); }
  override async commitImport(job: ImportJob, book: Book, assets: MediaAsset[]) {
    const ids = new Map(this.source.assets.map((asset, i) => [asset.id, assets[i]!.id]));
    const chapters = this.source.chapters.map(chapter => ({ ...chapter, id: crypto.randomUUID(), bookId: book.id, sourceRanges: chapter.sourceRanges.map(range => ({ ...range, assetId: ids.get(range.assetId)! })) }));
    const progress = this.source.progress;
    await this.database.transaction("rw", [this.database.books, this.database.assets, this.database.chapters, this.database.imports, this.database.progress], async () => {
      await super.commitImport(job, { ...book, status: this.source.book.status }, assets, chapters);
      if (progress) await this.saveProgress({ ...progress, bookId: book.id, bookRevision: book.revision, sourceAssetId: ids.get(progress.sourceAssetId)! });
    });
  }
}

export async function importBackup(file: Blob, options: BackupImportOptions): Promise<Book[]> {
  const { reader, entries, manifest } = await inspectBackup(file);
  const storage = new MediaStorage();
  const signal = options.signal;
  const checkAbort = () => { if (signal?.aborted) throw new BackupError("cancelled"); };
  const total = manifest.books.flatMap(book => book.assets).reduce((sum, asset) => sum + asset.size, 0);
  let written = 0;
  const imported: Book[] = [];
  try {
    for (const item of manifest.books) {
      checkAbort();
      const duplicate = await libraryRepository.database.books.filter(book => book.title === item.book.title).first();
      let replace: Book | undefined;
      if (duplicate) {
        const choice = await options.onDuplicate(duplicate);
        checkAbort();
        if (choice !== "cancel" && choice !== "replace" && choice !== "keep-both") throw new BackupError("invalid");
        if (choice === "cancel") throw new BackupError("cancelled");
        if (choice === "replace") {
          if (!options.isActivePath) throw new BackupError("invalid");
          replace = duplicate;
        }
      }
      const job: ImportJob = { id: crypto.randomUUID(), stagingPaths: [], expectedFiles: item.assets.length + Number(Boolean(item.cover)), receivedFiles: 0, state: "staging", error: null };
      await exclusive(async () => {
        await libraryRepository.saveImportJob(job);
        try {
          const extract = async (source: { name: string; size: number; sha256: string }, filename: string) => {
            checkAbort();
            const entry = entries.find(value => value.filename === source.name);
            if (!entry || entry.directory) throw new BackupError("invalid");
            const path = `staging/${job.id}/${crypto.randomUUID()}`;
            job.stagingPaths.push(path);
            await libraryRepository.saveImportJob(job);
            const output = await (await storage.handle(path, true)).createWritable();
            const sink = new WritableStream<Uint8Array>({ write: chunk => output.write(new Uint8Array(chunk)), close: () => output.close(), abort: reason => output.abort(reason) });
            await extractVerified(entry, sink, source, signal);
            const stored = await storage.read(path);
            return new File([stored], filename, { type: stored.type });
          };
          const files: File[] = [];
          for (const asset of item.assets) files.push(await extract(asset, asset.originalFilename));
          const cover = item.cover ? await extract(item.cover, "cover.webp") : undefined;
          const worker = new Worker(new URL("../../workers/storage.worker.ts", import.meta.url), { type: "module" });
          const remote = wrap<StorageWorker>(worker);
          let index = 0;
          const writer: ImportWriter = {
            async write(id, path, data, progress) {
              const expected = index < item.assets.length ? item.assets[index++] : undefined;
              const result = await remote.write(id, path, data, proxy(progress));
              if (expected && (result.bytes !== expected.size || result.sha256 !== expected.sha256)) throw new BackupError("hash");
              return result;
            },
            cancel: id => remote.cancel(id), finish: id => remote.finish(id),
          };
          const coordinator = new ImportCoordinator({ repository: new RestoreRepository(item), storage, writer, exclusive: work => work() });
          try {
            const book = await coordinator.importBook({ title: item.book.title, description: item.book.description, files, cover, ordered: true, signal, onProgress: bytes => { try { options.onProgress?.(written + bytes, total); } catch { /* Progress is advisory. */ } } });
            written += item.assets.reduce((sum, asset) => sum + asset.size, 0);
            imported.push(book);
          } finally { coordinator.dispose(); worker.terminate(); }
        } finally {
          try { await storage.delete(`staging/${job.id}`); await libraryRepository.removeImportJob(job.id); } catch { /* Recovery retains the journal. */ }
        }
      });
      if (replace) await new LibraryCommands(options.isActivePath!).deleteBook(replace.id);
    }
    return imported;
  } finally { await reader.close(); }
}
