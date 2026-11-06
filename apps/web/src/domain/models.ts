export interface Book {
  id: string; title: string; description: string; coverAssetId: string | null;
  revision: number; createdAt: number; updatedAt: number; status: "ready" | "completed" | "missing";
}
export interface MediaAsset {
  id: string; bookId: string; path: string; originalFilename: string;
  container: string; codec: string; channels: number; sampleRate: number;
  duration: number; bytes: number; sha256: string;
}
export interface SourceRange { assetId: string; sourceStart: number; sourceEnd: number }
export interface Chapter {
  id: string; bookId: string; order: number; title: string; globalStart: number;
  globalEnd: number; kind: "imported" | "generated"; sourceRanges: SourceRange[];
}
export interface PlaybackProgress {
  bookId: string; bookRevision: number; sourceAssetId: string; sourceOffset: number;
  globalOffset: number; updatedAt: number; stopReason: string | null; rewindPending: boolean;
}
export interface SessionSourceRange extends SourceRange { sessionStart: number }
export interface PlaybackSession {
  id: string; bookId: string; revision: number; mode: string; rate: number;
  requestedListeningSeconds: number | null; actualMediaDuration: number; outputPath: string;
  state: string; sourceMap: SessionSourceRange[]; lastObservedPosition: number;
  kind?: "session" | "continuous-cache";
}
export interface ImportJob {
  id: string; stagingPaths: string[]; expectedFiles: number; receivedFiles: number;
  state: "staging" | "ready" | "failed" | "cancelled"; error: string | null;
}
export interface TransferJob {
  id: string; manifestDigest: string; fileOffsets: Record<string, number>;
  verifiedFiles: string[]; state: string; expiresAt: number;
}
export interface Settings {
  id: "settings"; theme: "system" | "light" | "dark"; locale: string;
  defaultSpeed: number; generatedPartsPreference: boolean; schemaVersion: number;
  /** Set once "Open my library" is pressed on Welcome. */
  welcomeDone?: boolean;
}
