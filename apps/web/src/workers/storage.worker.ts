import { expose } from "comlink";
import { createSHA256 } from "hash-wasm";
import { MediaStorage } from "../services/opfs/MediaStorage";

const storage = new MediaStorage();
const cancelled = new Set<string>();
const api = {
  cancel(id: string) { cancelled.add(id); },
  async write(id: string, path: string, file: File, progress: (bytes: number) => void) {
    const handle = await storage.handle(path, true);
    const hash = await createSHA256();
    let offset = 0;
    let sync: FileSystemSyncAccessHandle | null = null;
    if ("createSyncAccessHandle" in handle) {
      try { sync = await handle.createSyncAccessHandle(); }
      catch (error) {
        if (!(error instanceof DOMException && error.name === "NotSupportedError")) throw error;
      }
    }
    const writable = sync ? null : await handle.createWritable();
    try {
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
        progress(offset);
      }
      if (sync) { sync.truncate(offset); sync.flush(); } else await writable!.close();
      return { bytes: offset, sha256: hash.digest("hex") };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      throw error;
    } finally { sync?.close(); cancelled.delete(id); }
  },
};
export type StorageWorker = typeof api;
expose(api);
