import { ImportCoordinator } from "../../src/features/import/ImportCoordinator";
import { exportBook } from "../../src/features/backup/export";
import { importBackup } from "../../src/features/backup/import";
import { LibraryCommands } from "../../src/features/library/LibraryCommands";
import { libraryRepository } from "../../src/services/db/LibraryRepository";
import { MediaStorage } from "../../src/services/opfs/MediaStorage";

const input = document.querySelector<HTMLInputElement>("#files")!;
const audio = document.querySelector<HTMLAudioElement>("#audio")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
let url: string | undefined;
button.onclick = async () => {
  const coordinator = new ImportCoordinator();
  try {
    const book = await coordinator.importBook({ title: "Zeland", files: [...input.files!], ordered: true });
    const before = await libraryRepository.database.assets.where("bookId").equals(book.id).toArray();
    const initial = await libraryRepository.database.chapters.where("bookId").equals(book.id).sortBy("order");
    await libraryRepository.reorderChapters(book.id, initial.map(ch => ch.id).reverse());
    await libraryRepository.renameChapter(initial[2]!.id, "Renamed chapter");
    const beforeChapters = await libraryRepository.database.chapters.where("bookId").equals(book.id).sortBy("order");
    await libraryRepository.saveProgress({ bookId: book.id, bookRevision: 2, sourceAssetId: beforeChapters[0]!.sourceRanges[0]!.assetId, sourceOffset: 1, globalOffset: 1, updatedAt: Date.now(), stopReason: null, rewindPending: false });
    const archive = await exportBook(book.id);
    await new LibraryCommands(() => false).deleteBook(book.id);
    const [restored] = await importBackup(archive.blob, { onDuplicate: () => "cancel" });
    if (!restored) throw new Error("No restored book");
    const after = await libraryRepository.database.assets.where("bookId").equals(restored.id).toArray();
    const afterChapters = await libraryRepository.database.chapters.where("bookId").equals(restored.id).sortBy("order");
    const progress = await libraryRepository.database.progress.get(restored.id);
    const progressHash = after.find(asset => asset.id === progress?.sourceAssetId)?.sha256;
    const expectedProgressHash = before.find(asset => asset.id === beforeChapters[0]!.sourceRanges[0]!.assetId)?.sha256;
    const first = after.find(asset => asset.sha256 === before[0]?.sha256);
    if (!first) throw new Error("First asset missing");
    url = URL.createObjectURL(await new MediaStorage().read(first.path));
    audio.src = url;
    await audio.play();
    (window as unknown as { backupResult: unknown }).backupResult = { before: before.map(asset => asset.sha256).sort(), after: after.map(asset => asset.sha256).sort(), beforeChapters: beforeChapters.map(ch => [ch.order, ch.title, ch.globalStart, ch.globalEnd]), afterChapters: afterChapters.map(ch => [ch.order, ch.title, ch.globalStart, ch.globalEnd]), progressHash, expectedProgressHash, progressOffset: progress?.sourceOffset, playing: !audio.paused };
  } catch (error) { (window as unknown as { backupError: string }).backupError = String(error); }
  finally { coordinator.dispose(); }
};
window.addEventListener("pagehide", () => { if (url) URL.revokeObjectURL(url); });
