# Decisions

Short records of choices that shape the product. Each says what was decided and why. Details live in [spec/01-Architecture-EN.md](spec/01-Architecture-EN.md) and [testing.md](testing.md).

## 1. One prepared file per listening session

A locked phone can't be trusted to run JavaScript on a schedule. So Play builds one local audio file for the chosen duration and the session ends when the file ends. No background timer, no fade-out, no switching sources behind the player's back.

## 2. Copy encoded packets, never transcode

The session compiler cuts and joins existing encoded audio packets. It does not decode a book to PCM. That keeps memory bounded for 13-hour files and keeps quality identical to the source.

## 3. Codec restrictions

From the compiler measurements in `docs/testing.md`:

- Accepted: MP3, AAC-LC in MP4 (M4A and M4B), PCM WAV. Anything else is refused with an error, never converted.
- AAC in ADTS (`.aac`) is off because it is untested.
- All files in one book must match in codec, sample rate and channel count (and AAC configuration). A mixed book is refused. A different strategy would be needed to support it.
- `.m4b` sources produce an `.m4a` session file. Session files don't need chapter atoms.
- Cuts are frame or packet aligned (about 26 ms for MP3, 23 ms for AAC). Measured error stays inside the 250 ms target. This is not a sample-exact editor.
- DRM is unsupported.

## 4. Generated covers

Without an uploaded image, a book gets a deterministic cover drawn from its title. Same title, same cover, nothing stored and nothing fetched. A chosen cover is resized and saved as WebP. Removing it returns to the generated one.

## 5. 30-minute parts are logical chapters, off by default

A single long file stays one book and one chapter. If you switch on parts, the app adds 30-minute chapter ranges over the same file. No audio is copied or split on disk. Part titles are empty in storage and labelled by the screen from their order. (Owner decision: default off.)

## 6. Continuous-book cache

A multi-file book played with no timer needs one file that runs to the end of the book. Loud Books builds that file automatically the first time and reuses it. It costs extra storage, so it has its own line in Settings and can be removed. Playback never falls back to switching files in the background, and never quietly caps an unlimited listen at 30 minutes. (Owner decision.)

## 7. Open-question answers (owner decisions)

- Repository: https://github.com/zilijonas/loudbooks, MIT license.
- Duplicate on receive: Keep both, Replace or Cancel.
- Include listening position: off by default. It sends a one-time snapshot, not a sync.
- Pairing code: 6 digits, 3 tries, then the room closes.
- Receive works on desktop as well as phone.
- Backups: per-book export and whole-library export, both as `.loudbook.zip`.

## 8. Pairing through a small Worker, data directly between devices

WebRTC needs a way to exchange connection details. A Cloudflare Worker with a SQLite-backed Durable Object does that and nothing else. Rooms last five minutes, hold two devices, and use single-use random tokens (stored hashed) plus the 6-digit code. STUN only, no TURN. If a direct connection fails, the user is told it's a network problem and can try another network. No R2, no file relay, nothing that stores books. See [privacy.md](privacy.md).

## 9. Storage persistence is shown honestly

The app asks the browser for persistent storage. Settings says "Protected from automatic cleanup" only when the browser granted it and "Standard storage" otherwise. Neither means the library can't be lost, so backups exist.

## 10. Hash routing and base `/loudbooks/`

The app lives at `https://zilijonas.github.io/loudbooks/`, a project site on GitHub Pages. Vite `base` and the PWA `id`, `start_url` and `scope` are all `/loudbooks/`. Hash routes (`createHashRouter`) mean deep links work without server rewrites. Renaming the repository means changing `base`, and changing the origin does not carry the local library along.

## 11. Updates wait for the user

The service worker uses `registerType: 'prompt'`. A new version never reloads the page during playback, import or transfer. A book that is loaded but paused does not block the update. Restart always reloads onto the new worker. Every JS chunk, worker, WASM file, font and icon is precached, so the app opens in airplane mode after the first full load.

## 12. Test policy

Tests exist to catch real failures, not to describe the code. Covered: session planning and resume rules, import commit and recovery, quota handling, codec and compiler output validity, the transfer protocol, signaling security, and a handful of end-to-end flows (import, play, timer stop, offline launch, transfer). Not covered by tests: CSS, class names, static copy, snapshots, "component renders". Each behaviour is tested in one layer. UI parity with the design is judged from side-by-side screenshots. Physical-iPhone checks are recorded by hand in `docs/testing.md`, and the lock-screen ones are still pending.

## 13. Pinned dependencies, third-party licenses kept

Production dependencies are pinned to exact versions and the lockfile is committed. The project is MIT, but its dependencies are not all MIT, so [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) lists each license rather than lumping them together.
