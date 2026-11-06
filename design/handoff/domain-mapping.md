# Component ↔ domain state

| UI | Domain source | Notes |
|---|---|---|
| Player status | `AudioController` reducer + `PlaybackSession.state` | One union: idle, preparing, ready, playing, paused, rebuilding, endedTimer, endedChapter, completed, interrupted, error. "ready" = prepared but `play()` rejected. |
| "mm:ss of listening left" | `requestedListeningSeconds − heard` via `sourceMap` + `audio.currentTime` | Paused shows "Paused · mm:ss left". Never wall-clock. |
| Slider, elapsed, remaining | `PlaybackProgress.globalOffset` within current `Chapter` | Chapter time, not session time. |
| "x left in book" | duration − globalOffset | |
| Timer options | `SessionPlanner` inputs | Disabled when remaining chapters < needed. |
| Preparing phases | Media Worker: analyzing → reading → writing → finalizing | Indeterminate unless real progress exists. |
| 5-second rewind | `stopReason="duration"`, `rewindPending` | Once, clamped at 0. |
| Chapter-end resume | `stopReason="chapter"` | Next chapter at 0:00. |
| Completed | `Book.status=completed` | No rewind loop. |
| "Audio file missing" | startup OPFS check per `MediaAsset` | Offers re-import. |
| Import dialog | `ImportJob.state` | Bytes actually written; quota from `QuotaExceededError`. |
| Transfer panels | `TransferJob` state, offsets, verifiedFiles | Progress = receiver-acknowledged bytes. |
| Storage bar | `storage.estimate()` + per-category accounting | "about" wording only. |
| Protected / Standard | `storage.persisted()` / `persist()` | |
| Ready for offline use | Service worker precache complete | Not `navigator.onLine`. |
| Update banner | vite-plugin-pwa `needRefresh`, `registerType: "prompt"` | Disabled during playback, import, transfer. |
| Theme | `Settings.theme` → `data-theme` on `<html>` (absent = system) | |
