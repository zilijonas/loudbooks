import { expose } from "comlink";
import { createSHA256 } from "hash-wasm";
import { MediaStorage } from "../services/opfs/MediaStorage";
import { probe } from "../features/import/probe";

const storage = new MediaStorage();
const cancelled = new Set<string>();
const api = {
  cancel(id: string) { cancelled.add(id); },
  finish(id: string) { cancelled.delete(id); },
  async probe(file: File) {
    try { return { ok: true as const, value: await probe(file) }; }
    catch { return { ok: false as const }; }
  },
  async write(id: string, path: string, file: File, progress: (bytes: number) => void) {
    let sync: FileSystemSyncAccessHandle | null = null;
    let writable: FileSystemWritableFileStream | null = null;
    let phase = "opening file";
    try {
      const handle = await storage.handle(path, true);
      const hash = await createSHA256();
      let offset = 0;
      phase = "opening write handle";
      if ("createSyncAccessHandle" in handle) {
        try { sync = await handle.createSyncAccessHandle(); }
        catch (error) {
          if (!(error instanceof DOMException && error.name === "NotSupportedError")) throw error;
        }
      }
      writable = sync ? null : await handle.createWritable();
      phase = "writing chunks";
      while (offset < file.size) {
        if (cancelled.has(id)) throw new DOMException("Cancelled", "AbortError");
        const bytes = new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer());
        hash.update(bytes);
        if (sync) {
          let written = 0;
          while (written < bytes.length) {
            const n = sync.write(bytes.subarray(written), { at: offset + written });
            if (!n) throw new Error("OPFS write made no progress");
            written += n;
          }
        } else await writable!.write(bytes);
        offset += bytes.length;
        await progress(offset);
      }
      if (cancelled.has(id)) throw new DOMException("Cancelled", "AbortError");
      phase = "closing write handle";
      if (sync) { sync.truncate(offset); sync.flush(); sync.close(); sync = null; } else { await writable!.close(); writable = null; }
      const sha256 = hash.digest("hex");
      phase = "verifying stored file";
      const stored = await handle.getFile();
      if (stored.size !== offset) throw new Error("Incomplete OPFS write");
      const verification = await createSHA256();
      for (let at = 0; at < stored.size; at += 1024 * 1024) {
        if (cancelled.has(id)) throw new DOMException("Cancelled", "AbortError");
        verification.update(new Uint8Array(await stored.slice(at, at + 1024 * 1024).arrayBuffer()));
      }
      if (verification.digest("hex") !== sha256) throw new Error("OPFS hash mismatch");
      return { bytes: offset, sha256 };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
      const forwarded = new Error(`${phase}: ${String(error)}`, { cause: error });
      if (typeof name === "string") forwarded.name = name;
      throw forwarded;
    } finally { sync?.close(); cancelled.delete(id); }
  },
};
export type StorageWorker = typeof api;
expose(api);
