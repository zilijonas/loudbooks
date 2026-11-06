# Backup API

`exportBook(bookId)` and `exportLibrary()` return `{ blob, filename }`. `importBackup(blob, { onDuplicate, onProgress?, signal?, isActivePath? })` returns imported books. `onDuplicate` receives the existing book and returns `"keep-both"`, `"replace"`, or `"cancel"`.

Replacement requires `isActivePath` and the same playback coordination as `LibraryCommands`: callers must prevent a path becoming active during deletion. Without the guard, replacement fails closed. A replacement is imported before the old book is deleted; if deletion fails, both books remain and the import rejects. Library imports commit one book at a time.

Backup validation failures expose `BackupError.code` (`invalid`, `size`, `hash`, or `cancelled`). The import coordinator may also throw its existing `ImportError` codes. Export and import use bounded chunks, though the browser must retain the returned ZIP Blob.
