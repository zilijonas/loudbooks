# Library data API

All persistent metadata writes go through `LibraryRepository` in `services/db/LibraryRepository.ts`. The shared instance is `libraryRepository`; `LibraryDatabase` accepts an alternate name for isolated tests. Schema version 1 is `loud-books-v1`. The reactive hooks in `services/db/queries.ts` are `useBooks()`, `useBook(id)`, `useChapters(bookId)`, `useSettings()`, and `useProgress(bookId)`. Hook values are initially `undefined` while loading. Chapter order is explicit.

## Import and recovery

Create an `ImportCoordinator` from `features/import/ImportCoordinator.ts`. Call `importBook({ title, files, description?, cover?, generatedParts?, ordered?, signal?, onProgress? })`. By default files are naturally sorted; set `ordered` when the user has arranged them. Progress is actual audio bytes written and total audio bytes. Errors expose `ImportError.code` for existing i18n keys including `form.unsupported`, `form.mismatch`, `form.titleError`, `form.filesNone`, `importing.quotaTitle`, and `importing.stopped`. The promise resolves only after metadata commits. Call `recover(isActivePath)` on startup before import or maintenance, supplying the same player guard used for commands. Without a guard, recovery conservatively retains unreferenced paths for a later guarded retry. Call `dispose()` when its worker is no longer needed. Original files stay in OPFS paths; no file needs a Blob URL until playback.

`generatedParts(asset)` produces logical 30-minute chapter ranges for a single asset without copying audio. Generated chapter titles are empty: the screen must localize a part label using the chapter order. A missing `coverAssetId` means the UI renders its deterministic title-based fallback. A present ID resolves to `books/<bookId>/covers/<coverId>.webp` through `MediaStorage.read(path)`.

## Editing and deletion

Construct `new LibraryCommands(isActivePath, repository?, storage?)`. `isActivePath(path)` must report every path currently used by playback or an in-flight handover. Coordinate with the player so a file cannot become active between this check and the operation. Pause playback and prepare a replacement session before editing the playing book. The guard is required, not a default false predicate.

- `renameBook(id, title)`, `updateDescription(id, description)`, and `renameChapter(id, title)` update metadata.
- `reorderChapters(bookId, orderedChapterIds)` validates the complete permutation, increments book revision and remaps progress by source asset and source offset where possible. Consumers must discard session outputs whose revision differs from the book revision.
- `setCover(bookId, blobOrNull)` journals and writes a new WebP before switching metadata. The previous cover stays journaled until inactive; null returns to the generated-cover fallback.
- `deleteBook(id)` rejects if any related file is active. It removes metadata transactionally, then deletes associated audio, cover and session files. A cleanup failure can leave orphan files but cannot leave a ready book pointing at deleted audio.

## Storage

`new StorageMaintenance(isActivePath, repository?, storage?)` uses the same player guard. `estimate()`, `persist()` and `persisted()` expose browser estimates and persistence state; a declined request is normal. `categories()` returns byte counts for `books`, `covers`, `sessions`, and `continuousCache`. Sessions intended as continuous-book caches use `PlaybackSession.kind = "continuous-cache"`; unspecified kind counts as a temporary session. Browser usage estimates include other origin storage and need not equal these sums.

`clearTemporary()` removes only inactive session and cache files, preserves paused/playing/preparing/rebuilding sessions, and returns bytes removed. Restore the player and register active paths before calling it. `deleteLibrary()` rejects when a referenced file is active, then removes all book, chapter, asset, progress and session metadata and files; settings stay. Both are explicit user actions and serialize with imports and recovery. Do not call either merely because the page becomes visible.

OPFS and IndexedDB do not share a transaction. Import journals and recovery protect incomplete imports. Deletion commits a cleanup journal with metadata removal. If file deletion fails or the app closes, guarded recovery retries journaled cleanup while preserving active paths and paths still referenced by the library or a session.
