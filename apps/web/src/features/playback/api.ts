/* eslint-disable @typescript-eslint/no-unused-vars -- stub keeps the real signatures */
// Temporary stub (LB-7). LB-8 owns this file and replaces it; the screens only rely on these exports.

/** Starts (or resumes) listening to a book, optionally from the start of a chapter. */
export async function startListening(_bookId: string, _chapterId?: string): Promise<void> {}

/** Opens the full player route. */
export function openPlayer(): void {}

/** Pauses playback (before editing or deleting the playing book). */
export async function pause(): Promise<void> {}

/** True while this book is playing, paused with a prepared session, or preparing one. */
export function isBookActive(_bookId: string): boolean { return false }

/** Player guard for LibraryCommands / StorageMaintenance / recovery: true for every OPFS path the player is using. */
export function isActivePath(_path: string): boolean { return false }
