// @vitest-environment node
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { expect, it } from "vitest";
import { inspectBackup } from "../../../src/features/backup/inspect";

const manifest = () => ({ schemaVersion: 1, app: "loudbooks", books: [{
  book: { id: "b", title: "Book", description: "", coverAssetId: null, revision: 1, createdAt: 1, updatedAt: 1, status: "ready" },
  chapters: [{ id: "c", bookId: "b", order: 0, title: "Chapter", globalStart: 0, globalEnd: 1, kind: "imported", sourceRanges: [{ assetId: "a", sourceStart: 0, sourceEnd: 1 }] }],
  assets: [{ id: "a", bookId: "b", name: "books/0/audio/0", size: 1, bytes: 1, sha256: "0".repeat(64), originalFilename: "a.mp3", container: "mp3", codec: "mp3", channels: 1, sampleRate: 44100, duration: 1 }],
}] });
async function archive(data: ReturnType<typeof manifest>, name: string, content: string) {
  const writer = new ZipWriter(new BlobWriter());
  await writer.add("manifest.json", new TextReader(JSON.stringify(data)));
  await writer.add(name, new TextReader(content), { level: 0 });
  return writer.close();
}
it("rejects traversal, unreferenced entries and oversized audio", async () => {
  const traversal = manifest();
  traversal.books[0]!.assets[0]!.name = "../audio";
  await expect(inspectBackup(await archive(traversal, "../audio", "a"))).rejects.toMatchObject({ code: "invalid" });
  await expect(inspectBackup(await archive(manifest(), "extra", "a"))).rejects.toMatchObject({ code: "invalid" });
  await expect(inspectBackup(await archive(manifest(), "books/0/audio/0", "ab"))).rejects.toMatchObject({ code: "size" });
  const result = await inspectBackup(await archive(manifest(), "books/0/audio/0", "a"));
  await result.reader.close();
});

it("rejects hash mismatch before extracted data can be committed", async () => {
  const { extractVerified } = await import("../../../src/features/backup/extract");
  const input = await archive(manifest(), "books/0/audio/0", "a");
  const { reader, entries } = await inspectBackup(input);
  let committed = false;
  let aborted = false;
  try {
    const entry = entries.find(item => item.filename === "books/0/audio/0")!;
    const output = new WritableStream<Uint8Array>({ close() { committed = true; }, abort() { aborted = true; } });
    await expect(extractVerified(entry, output, manifest().books[0]!.assets[0]!)).rejects.toMatchObject({ code: "hash" });
    expect(committed).toBe(false);
    expect(aborted).toBe(true);
  } finally { await reader.close(); }
});
