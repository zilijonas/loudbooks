import { BlobReader, BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { createSHA256 } from "hash-wasm";
import type { Book } from "../../domain/models";
import { libraryRepository } from "../../services/db/LibraryRepository";
import { MediaStorage } from "../../services/opfs/MediaStorage";
import { coverPath } from "../library/LibraryCommands";

const storage = new MediaStorage();

async function hash(file: Blob) {
  const digest = await createSHA256();
  for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
    digest.update(new Uint8Array(await file.slice(offset, offset + 1024 * 1024).arrayBuffer()));
  }
  return digest.digest("hex");
}

async function archive(books: Book[], filename: string, onProgress?: (written: number, total: number) => void) {
  const total = (await Promise.all(books.map(book => libraryRepository.database.assets.where("bookId").equals(book.id).toArray()))).flat().reduce((sum, asset) => sum + asset.bytes, 0);
  let done = 0;
  const zip = new ZipWriter(new BlobWriter("application/zip"));
  const manifest = { schemaVersion: 1, app: "loudbooks", books: [] as object[] };
  for (const [index, book] of books.entries()) {
    const [chapters, assets, progress] = await Promise.all([
      libraryRepository.database.chapters.where("bookId").equals(book.id).sortBy("order"),
      libraryRepository.database.assets.where("bookId").equals(book.id).toArray(),
      libraryRepository.database.progress.get(book.id),
    ]);
    const files = [];
    for (const [assetIndex, asset] of assets.entries()) {
      const file = await storage.read(asset.path);
      if (file.size !== asset.bytes || await hash(file) !== asset.sha256) throw new Error("Backup source integrity check failed");
      const name = `books/${index}/audio/${assetIndex}`;
      await zip.add(name, new BlobReader(file), { level: 0, onprogress: async written => { onProgress?.(done + written, total); } });
      done += file.size;
      files.push({ id: asset.id, bookId: asset.bookId, originalFilename: asset.originalFilename, container: asset.container, codec: asset.codec, channels: asset.channels, sampleRate: asset.sampleRate, duration: asset.duration, bytes: asset.bytes, sha256: asset.sha256, name, size: file.size });
    }
    let cover: { name: string; size: number; sha256: string } | undefined;
    if (book.coverAssetId) {
      const file = await storage.read(coverPath(book.id, book.coverAssetId));
      cover = { name: `books/${index}/cover.webp`, size: file.size, sha256: await hash(file) };
      await zip.add(cover.name, new BlobReader(file), { level: 0 });
    }
    manifest.books.push({ book, chapters, assets: files, ...(progress ? { progress } : {}), ...(cover ? { cover } : {}) });
  }
  await zip.add("manifest.json", new TextReader(JSON.stringify(manifest)));
  return { blob: await zip.close(), filename };
}

function safeTitle(title: string) {
  return [...title].map(char => char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? "_" : char).join("").replace(/[. ]+$/g, "").slice(0, 160) || "book";
}

export async function exportBook(bookId: string, onProgress?: (written: number, total: number) => void) {
  const book = await libraryRepository.database.books.get(bookId);
  if (!book) throw new Error("Book not found");
  return archive([book], `${safeTitle(book.title)}.loudbook.zip`, onProgress);
}

export async function exportLibrary(onProgress?: (written: number, total: number) => void) {
  const books = await libraryRepository.database.books.toArray();
  return archive(books, `loudbooks-library-${new Date().toISOString().slice(0, 10)}.loudbook.zip`, onProgress);
}
