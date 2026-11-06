import { createSHA256 } from "hash-wasm";
import type { Entry } from "@zip.js/zip.js";
import { BackupError } from "./inspect";

export async function extractVerified(entry: Entry, output: WritableStream<Uint8Array>, expected: { size: number; sha256: string }, signal?: AbortSignal) {
  if (entry.directory) throw new BackupError("invalid");
  const hash = await createSHA256();
  const writer = output.getWriter();
  let count = 0;
  try {
    await entry.getData(new WritableStream<Uint8Array>({ async write(chunk) {
      if (signal?.aborted) throw new BackupError("cancelled");
      count += chunk.byteLength;
      if (count > expected.size) throw new BackupError("size");
      hash.update(chunk);
      await writer.write(chunk);
    } }));
    if (signal?.aborted) throw new BackupError("cancelled");
    if (count !== expected.size) throw new BackupError("size");
    if (hash.digest("hex") !== expected.sha256) throw new BackupError("hash");
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  } finally { writer.releaseLock(); }
}
