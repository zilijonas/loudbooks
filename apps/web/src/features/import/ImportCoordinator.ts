import { proxy, wrap, type Remote } from "comlink";
import type { Book, Chapter, ImportJob, MediaAsset } from "../../domain/models";
import { libraryRepository, type LibraryRepository } from "../../services/db/LibraryRepository";
import { MediaStorage } from "../../services/opfs/MediaStorage";
import type { StorageWorker } from "../../workers/storage.worker";
import { generatedParts } from "../library/chapters";
import { resizeCover } from "../library/cover";
import { exclusive } from "./exclusive";
import { ImportError, naturalSort, type probe } from "./probe";

type ProbeResult = Awaited<ReturnType<typeof probe>>;
export interface ImportWriter {
  write(id: string, path: string, file: File, progress: (bytes: number) => void): Promise<{ bytes: number; sha256: string }>;
  cancel?(id: string): Promise<unknown> | void;
  finish?(id: string): Promise<unknown> | void;
}
export interface ImportStorage {
  read(path: string): Promise<File>;
  delete(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
}
type Options = {
  repository?: LibraryRepository;
  storage?: ImportStorage;
  writer?: ImportWriter;
  probeFile?: (file: File) => Promise<ProbeResult>;
  exclusive?: <T>(work: () => Promise<T>) => Promise<T>;
};
export interface ImportRequest {
  title: string; description?: string; files: File[]; cover?: Blob; generatedParts?: boolean;
  ordered?: boolean; signal?: AbortSignal; onProgress?: (written: number, total: number) => void;
}

export class ImportCoordinator {
  private repository: LibraryRepository;
  private storage: ImportStorage;
  private worker?: Worker;
  private remote?: Remote<StorageWorker>;
  private writer?: ImportWriter;
  private probeFile?: (file: File) => Promise<ProbeResult>;
  private lock: <T>(work: () => Promise<T>) => Promise<T>;
  constructor(options: Options = {}) {
    this.repository = options.repository ?? libraryRepository;
    this.storage = options.storage ?? new MediaStorage();
    this.writer = options.writer;
    this.probeFile = options.probeFile;
    this.lock = options.exclusive ?? exclusive;
  }
  private getWorker() {
    if (!this.remote) {
      this.worker = new Worker(new URL("../../workers/storage.worker.ts", import.meta.url), { type: "module" });
      this.remote = wrap<StorageWorker>(this.worker);
    }
    return this.remote;
  }
  private getWriter(): ImportWriter {
    if (this.writer) return this.writer;
    const remote = this.getWorker();
    return {
      write: (id, path, file, progress) => remote.write(id, path, file, proxy(progress)),
      cancel: id => remote.cancel(id),
      finish: id => remote.finish(id),
    };
  }
  private async analyze(file: File) {
    if (this.probeFile) return this.probeFile(file);
    const result = await this.getWorker().probe(file);
    if (!result.ok) throw new ImportError("form.unsupported");
    return result.value;
  }
  /** Probes one file in the worker (the form's per-file "Checking file…" state). Throws ImportError("form.unsupported"). */
  check(file: File) { return this.analyze(file); }
  async importBook(request: ImportRequest): Promise<Book> {
    const title = request.title.trim();
    if (!title) throw new ImportError("form.titleError");
    if (!request.files.length) throw new ImportError("form.filesNone");
    if (request.signal?.aborted) throw new ImportError("importing.stopped");
    return this.lock(() => this.runImport({ ...request, title }));
  }
  private async runImport(request: ImportRequest): Promise<Book> {
    const id = crypto.randomUUID();
    const bookId = crypto.randomUUID();
    const files = request.ordered ? [...request.files] : naturalSort(request.files);
    const job: ImportJob = { id, stagingPaths: [], expectedFiles: files.length, receivedFiles: 0, state: "staging", error: null };
    let phase = "creating import journal";
    const checkAbort = () => { if (request.signal?.aborted) throw new ImportError("importing.stopped"); };
    checkAbort();
    const writer = this.getWriter();
    const onAbort = () => { void Promise.resolve(writer.cancel?.(id)).catch(() => {}); };
    request.signal?.addEventListener("abort", onAbort);
    try {
      checkAbort();
      await this.repository.saveImportJob(job);
      const assets: MediaAsset[] = [];
      const chapters: Chapter[] = [];
      let written = 0;
      let position = 0;
      const total = files.reduce((sum, file) => sum + file.size, 0);
      for (const file of files) {
        checkAbort();
        phase = "probing audio";
        const info = await this.analyze(file);
        checkAbort();
        const family = info.codec.startsWith("pcm-") ? "pcm" : info.codec;
        const prior = assets[0];
        if (prior && (prior.codec.startsWith("pcm-") ? "pcm" : prior.codec) !== family) throw new ImportError("form.mismatch");
        const assetId = crypto.randomUUID();
        const ext = family === "mp3" ? "mp3" : family === "aac" ? "m4a" : "wav";
        const path = `staging/${id}/${assetId}.${ext}`;
        job.stagingPaths.push(path);
        await this.repository.saveImportJob(job);
        const previousBytes = written;
        phase = "writing audio";
        const result = await writer.write(id, path, file, bytes => {
          try { request.onProgress?.(previousBytes + bytes, total); } catch { /* Progress listeners do not control persistence. */ }
        });
        checkAbort();
        if (result.bytes !== file.size || (await this.storage.read(path)).size !== file.size) throw new Error("Incomplete OPFS write");
        written += result.bytes;
        const asset: MediaAsset = { id: assetId, bookId, path, originalFilename: file.name, ...info, ...result };
        assets.push(asset);
        chapters.push({ id: crypto.randomUUID(), bookId, order: chapters.length, title: file.name.replace(/\.[^.]+$/, ""), globalStart: position, globalEnd: position + info.duration, kind: "imported", sourceRanges: [{ assetId, sourceStart: 0, sourceEnd: info.duration }] });
        position += info.duration;
        job.receivedFiles++;
        await this.repository.saveImportJob(job);
      }
      let coverAssetId: string | null = null;
      if (request.cover) {
        phase = "writing cover";
        checkAbort();
        const cover = await resizeCover(request.cover);
        coverAssetId = crypto.randomUUID();
        const path = `books/${bookId}/covers/${coverAssetId}.webp`;
        job.stagingPaths.push(path);
        await this.repository.saveImportJob(job);
        const file = new File([cover], "cover.webp", { type: "image/webp" });
        const result = await writer.write(id, path, file, () => {});
        if (result.bytes !== file.size || (await this.storage.read(path)).size !== file.size) throw new Error("Incomplete cover write");
      }
      checkAbort();
      const now = Date.now();
      const book: Book = { id: bookId, title: request.title, description: request.description ?? "", coverAssetId, revision: 1, createdAt: now, updatedAt: now, status: "ready" };
      phase = "committing metadata";
      await this.repository.commitImport(job, book, assets, request.generatedParts && assets.length === 1 ? generatedParts(assets[0]!) : chapters);
      await this.repository.removeImportJob(id).catch(() => {});
      return book;
    } catch (error) {
      const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
      const failure = request.signal?.aborted || name === "AbortError" ? new ImportError("importing.stopped", { cause: error }) :
        name === "QuotaExceededError" ? new ImportError("importing.quotaTitle", { cause: error }) :
        error instanceof ImportError ? error : new Error(`Import failed while ${phase}: ${String(error)}`, { cause: error });
      job.state = failure instanceof ImportError && failure.code === "importing.stopped" ? "cancelled" : "failed";
      job.error = failure instanceof ImportError ? failure.code : "error";
      try {
        await this.repository.saveImportJob(job);
        for (const path of job.stagingPaths) await this.storage.delete(path);
        await this.storage.delete(`staging/${id}`);
        await this.repository.removeImportJob(id);
      } catch { /* Journal remains for startup recovery. */ }
      throw failure;
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
      await Promise.resolve(writer.finish?.(id)).catch(() => {});
    }
  }
  async recover(isActivePath?: (path: string) => boolean | Promise<boolean>): Promise<void> {
    await this.lock(async () => {
      const { database } = this.repository;
      const assets = await database.assets.toArray();
      const books = await database.books.toArray();
      const transferJobs = await database.transfers.toArray();
      const sessions = await database.sessions.toArray();
      const protectedPaths = new Set([...assets.map(asset => asset.path), ...sessions.map(session => session.outputPath), ...books.filter(book => book.coverAssetId).map(book => `books/${book.id}/covers/${book.coverAssetId}.webp`)]);
      const jobs = await this.repository.listImportJobs();
      const deferredPaths: string[] = [];
      for (const job of jobs) {
        if (job.state === "ready") { await this.repository.removeImportJob(job.id); continue; }
        let deferred = false;
        for (const path of job.stagingPaths) {
          if (protectedPaths.has(path)) continue;
          if (!isActivePath || await isActivePath(path)) { deferred = true; deferredPaths.push(path); continue; }
          await this.storage.delete(path);
        }
        if (!deferred) await this.repository.removeImportJob(job.id);
      }
      if (!isActivePath) return;
      const hasActiveDescendant = async (path: string): Promise<boolean> => {
        if (await isActivePath(path)) return true;
        try { await this.storage.read(path); return false; } catch (error) {
          const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
          if (name !== "NotFoundError" && name !== "TypeMismatchError") throw error;
        }
        for (const child of await this.storage.list(path)) {
          if (await hasActiveDescendant(`${path}/${child}`)) return true;
        }
        return false;
      };
      for (const name of await this.storage.list("staging")) {
        const directory = `staging/${name}`;
        const prefix = `${directory}/`;
        if (transferJobs.some(job => job.id === name) || [...protectedPaths, ...deferredPaths].some(path => path === directory || path.startsWith(prefix))) continue;
        if (!await hasActiveDescendant(directory)) await this.storage.delete(directory);
      }
    });
  }
  dispose() { this.worker?.terminate(); this.worker = undefined; this.remote = undefined; }
}
