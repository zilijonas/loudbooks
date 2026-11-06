import { BlobReader, ZipReader, type Entry } from "@zip.js/zip.js";
import { backupManifestSchema, type BackupManifest } from "./manifest";

export class BackupError extends Error {
  constructor(readonly code: "invalid" | "size" | "hash" | "cancelled", options?: ErrorOptions) { super(code, options); this.name = "BackupError"; }
}
const manifestLimit = 8 * 1024 * 1024;

export function checkEntries(manifest: BackupManifest, entries: Entry[]) {
  const expected = new Map<string, number>();
  for (const book of manifest.books) for (const file of [...book.assets, ...(book.cover ? [book.cover] : [])]) expected.set(file.name, file.size);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.directory || seen.has(entry.filename)) throw new BackupError("invalid");
    seen.add(entry.filename);
    if (entry.filename === "manifest.json") continue;
    const size = expected.get(entry.filename);
    if (size === undefined) throw new BackupError("invalid");
    if (entry.uncompressedSize !== size) throw new BackupError("size");
  }
  if (seen.size !== expected.size + 1 || !seen.has("manifest.json")) throw new BackupError("invalid");
}

export async function inspectBackup(file: Blob) {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const manifests = entries.filter(entry => entry.filename === "manifest.json");
    const entry = manifests[0];
    if (manifests.length !== 1 || !entry || entry.directory) throw new BackupError("invalid");
    if (entry.uncompressedSize > manifestLimit) throw new BackupError("size");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    await entry.getData(new WritableStream<Uint8Array>({ write(chunk) {
      bytes += chunk.byteLength;
      if (bytes > manifestLimit || bytes > entry.uncompressedSize) throw new BackupError("size");
      chunks.push(new Uint8Array(chunk));
    } }));
    if (bytes !== entry.uncompressedSize) throw new BackupError("size");
    const parsed = backupManifestSchema.safeParse(JSON.parse(await new Blob(chunks).text()));
    if (!parsed.success) throw new BackupError("invalid");
    checkEntries(parsed.data, entries);
    return { reader, entries, manifest: parsed.data };
  } catch (error) {
    await reader.close().catch(() => {});
    if (error instanceof BackupError) throw error;
    throw new BackupError("invalid", { cause: error });
  }
}
