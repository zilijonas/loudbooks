// @vitest-environment node
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { createSHA256 } from "hash-wasm";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ books: [] as unknown[], chapters: [] as unknown[], assets: [] as unknown[], file: new Blob() }));
vi.mock("../../../src/services/db/LibraryRepository", () => ({ libraryRepository: { database: {
  books: { get: async () => state.books[0], toArray: async () => state.books },
  chapters: { where: () => ({ equals: () => ({ sortBy: async () => state.chapters }) }) },
  assets: { where: () => ({ equals: () => ({ toArray: async () => state.assets }) }) },
  progress: { get: async () => undefined },
} } }));
vi.mock("../../../src/services/opfs/MediaStorage", () => ({ MediaStorage: class { read() { return Promise.resolve(state.file); } } }));
import { exportBook } from "../../../src/features/backup/export";

beforeEach(async () => {
  state.file = new Blob(["audio data"]);
  const digest = await createSHA256();
  digest.update(new Uint8Array(await state.file.arrayBuffer()));
  state.books = [{ id: "book", title: "A/B", coverAssetId: null }];
  state.chapters = [{ id: "chapter", bookId: "book", order: 0, title: "First" }];
  state.assets = [{ id: "asset", path: "staging/audio", bytes: state.file.size, sha256: digest.digest("hex"), codec: "mp3" }];
});

it("exports readable stored audio and rejects corrupted source", async () => {
  const { blob, filename } = await exportBook("book");
  expect(filename).toBe("A_B.loudbook.zip");
  const reader = new ZipReader(new BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    const manifestEntry = entries.find(entry => entry.filename === "manifest.json");
    if (!manifestEntry || manifestEntry.directory) throw new Error("Missing manifest");
    const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
    expect(manifest.books[0].chapters[0].title).toBe("First");
    const audio = entries.find(entry => entry.filename === manifest.books[0].assets[0].name)!;
    if (audio.directory) throw new Error("Missing audio");
    expect(audio.compressionMethod).toBe(0);
    expect(await audio.getData(new TextWriter())).toBe("audio data");
  } finally { await reader.close(); }
  state.file = new Blob(["bad data!!"]);
  await expect(exportBook("book")).rejects.toThrow("integrity");
});
