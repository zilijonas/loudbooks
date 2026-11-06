/** Minimal OPFS test double: paths and quota persist across coordinator instances. */
export class MemoryStorage {
  readonly files = new Map<string, File>();
  async read(path: string) {
    const file = this.files.get(path);
    if (!file) throw new DOMException("Missing", "NotFoundError");
    return file;
  }
  async delete(path: string) {
    for (const key of this.files.keys()) if (key === path || key.startsWith(`${path}/`)) this.files.delete(key);
  }
  async list(path: string) {
    const prefix = path ? `${path}/` : "";
    return [...new Set([...this.files.keys()].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length).split("/")[0]!))];
  }
}
export class MemoryWriter {
  quota = false;
  cancelled = new Set<string>();
  onWrite?: () => void;
  constructor(readonly storage: MemoryStorage) {}
  async cancel(id: string) { this.cancelled.add(id); }
  async write(id: string, path: string, file: File, progress: (bytes: number) => void) {
    if (this.quota) throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.storage.files.set(path, file);
    this.onWrite?.();
    if (this.cancelled.has(id)) throw new DOMException("Cancelled", "AbortError");
    progress(file.size);
    return { bytes: file.size, sha256: `digest-${file.name}` };
  }
}
