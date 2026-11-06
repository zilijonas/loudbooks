# Testing records

Every record names device, OS, browser, codec parameters, file size, steps, result and measurements (plan §10).

Contents: [Release pass (LB-12)](#release-pass-lb-12), [Physical iPhone (pending)](#physical-iphone-pending-owner-gate-lb-14), [Session compiler (LB-5)](#session-compiler-lb-5).

## Release pass (LB-12)

Run on 2026-11-06 and 2026-11-07 from branch `lb-12-e2e`, one suite at a time through the shared memory queue
(`--need-gb 3`, `--workers=1`, one engine per run).

**Device:** Mac mini (`hw.model` Mac16,10), Apple M4, 24 GB. **OS:** macOS 26.6.2 (25G83). **Tools:** Node 26.8.1,
pnpm 11.9.0, Playwright 1.65.0. **Engines:** Playwright Chromium 158 (headless shell), WebKit 27.2 (Playwright build,
not Safari), Firefox 159.0, all headless. The transfer suite uses Google Chrome 156.0.8078.80 for the Chromium side
(see "Notes on the runs"). **Audio fixtures** (see `fixtures/README.md`):

| Fixture | Codec parameters | Size | Duration |
|---|---|---|---|
| Zeland 001-012 | MP3 CBR 44.1 kHz mono 56 kb/s, 12 files | 44.9 MB total | 106:47 total |
| audio_samples/book-long.mp3 | MP3 48 kHz stereo ~85 kb/s | 29.7 MB | 46:12 |
| audio_samples/book-short.mp3 | MP3 48 kHz stereo ~83 kb/s | 7.5 MB | 11:59 |

### Results

| Suite and command | Engine | Result | Time |
|---|---|---|---|
| Main app: `pnpm --filter web e2e --project=<e> --workers=1` (builds, then serves the preview build on :4173) | Chromium | 9 passed, 1 skipped | 1.6 min |
| | WebKit | 8 passed, 2 skipped | 1.1 min |
| | Firefox | 8 passed, 2 skipped | 1.2 min |
| Session compiler: `pnpm --filter web e2e:compiler --project=<e>` | Chromium | 13 passed | 22 s |
| | WebKit | 12 passed, 1 skipped | 29 s |
| Backup harness: `playwright test -c e2e/harness/backup.config.ts --project=<e>` | Chromium | 1 passed, 1 skipped | 1.4 s |
| | WebKit | 1 passed, 1 skipped | 1.8 s |
| Transfer, two devices against local `wrangler dev`: `playwright test -c playwright.transfer.config.ts --project=<e>` | Chromium (Chrome sender and receiver) | 1 passed | 33 s |
| | WebKit (Chrome sender, WebKit receiver) | 1 passed | 27 s |
| Unit and integration (Vitest, `--maxWorkers=1 --no-file-parallelism`), `pnpm -r typecheck`, `pnpm -r lint` | web 14 files / 93 tests, signaling 7, contracts 2 | all passed, typecheck and lint clean | web 3.2 s |

Skips, each with its reason in the spec:

- The harness-only backup case skips in the main config (it needs the standalone backup page) and the UI backup case
  skips in the harness config. Both ran in their own configs above.
- The storage quota case skips on WebKit and Firefox: forcing a small quota needs the Chrome DevTools Protocol
  (`Storage.overrideQuotaForOrigin`). It ran on Chromium. The compiler's quota case follows the same rule.
- The compiler suite on Firefox, and the transfer suite on Firefox, were not re-run in this pass. The compiler
  numbers for Firefox below come from the earlier LB-5 run. Transfer has no Firefox project.

### Records

Every record below ran on the device, OS and engines listed above, with the fixtures in the fixture table.

**R1. Import of the Zeland 12 chapters and book-long.mp3** (`e2e/data-layer.spec.ts`; Chromium 2.3 s,
WebKit 6.8 s, Firefox 8.5 s). Steps: open the import harness in a persistent profile, add the 12 Zeland files
(44.9 MB, MP3 44.1 kHz mono 56 kb/s) in one import, then `book-long.mp3` (29.7 MB, MP3 48 kHz stereo) as a second
book. Result: pass in all three engines. The SHA-256 of every file read back from OPFS equals the SHA-256 of the
source computed in Node. The suite skips when the fixtures are missing (CI).

**R2. Offline cold launch of the preview build** (`e2e/offline.spec.ts`; Chromium 1.8 s, WebKit 3.2 s, Firefox 3.5 s).
Steps: import `book-short.mp3` (7.5 MB, MP3 48 kHz stereo) in a persistent profile, open the library so the app
registers its service worker, wait until the worker controls the page, read the build's precache manifest from
`sw.js`, check each entry is in the precache cache, close the page, `context.setOffline(true)`, open a new page,
open the app, wait for the library to list the book and press Play. Result: pass in all three engines. All 33
manifest entries of this build were cached, the offline page made no failed requests and raised no page errors, the book
started playing (audio `paused === false`). A second, cheaper case checks that the shell reloads offline on first
launch without any book (all engines, under 1 s).

**R3. Service worker update while listening** (`e2e/offline.spec.ts`; Chromium 5.7 s, WebKit 5.9 s, Firefox 6.9 s).
Steps: import and play `book-short.mp3`, set a marker on `window`, then publish "build B" by appending a comment to
`dist/sw.js` (different bytes, same assets; the file is restored afterwards) and call `registration.update()`.
Prompt mode puts the new worker in `waiting`. Result: pass in all three engines. While audio plays, the library
banner says the update installs after listening and Restart is disabled; after 1.5 s the marker is still set and
the audio is still playing (no reload). After pausing, Restart enables, the page reloads onto the new worker (marker
gone, no worker left waiting) and the book is still in the library (Dexie metadata and OPFS audio survive). This is
a simulated second build, not two real builds, and it ran against the preview server, not GitHub Pages.

**R4. Insufficient storage** (`e2e/library-flow.spec.ts`; Chromium 2.2 s, other engines skipped). Steps: open Add
book, add Zeland 001-006 (26.3 MB), override the origin quota to current usage plus 8 MB through CDP, press Save.
Result: pass. The "Not enough space" panel appears with the "Nothing was added" copy, and OPFS holds no `books/` or
`staging/` file afterwards. Restoring the quota and opening the library shows it empty (no partial book).

**R5. Timer stop, resume rules and lifecycle reload** (`e2e/player.spec.ts`; Chromium 10.4 s, WebKit 12.6 s,
Firefox 14.7 s; unchanged by this pass, still the owning test). Steps: `book-short.mp3` at 2x with a 5-minute
timer (session of 600 s of book), let the file end, Keep listening resumes 5 s earlier once, pause and play does not
rewind again, Library and Player navigation keeps audio running, reload restores the last position, and an
end-of-chapter stop on three Zeland chapters resumes at the start of the next chapter. Result: pass in all three.

**R6. Create, reorder, rename, delete, edit chapters, 30-minute parts** (`e2e/library-flow.spec.ts` first case,
`e2e/edit-book.spec.ts`; Chromium 7.1 s and 13.7 s, WebKit 6.0 s and 14.8 s, Firefox 7.0 s and 16.0 s).
Result: pass; deleting a book removes its audio from OPFS.

**R7. Backup export and restore** (`e2e/backup.spec.ts`). UI case, main config: book menu export, delete, Settings
import, duplicate prompt with Replace while the book is playing, edit and delete while loaded (Chromium 51 s, WebKit 9.8 s,
Firefox 9.8 s; the Chromium time is five times the others and was 51 s in both full runs, not investigated). Harness
case: three real Zeland files exported, deleted, imported, hashes, chapter order and progress compared, first asset
played (Chromium 0.8 s, WebKit 1.2 s). Result: pass.

**R8. Transfer** (`e2e/transfer.spec.ts`; Chromium 26.3 s, WebKit receiver 22.4 s). Steps: computer (1280 px) and
phone (390 px) contexts against `wrangler dev`; three wrong codes lock the pairing; a 3-file Zeland book and the
29.7 MB `book-long.mp3` transfer with matching SHA-256 and play; cancel at more than 5 percent leaves no partial
book; pair again and Keep both. Result: pass in both configurations. No camera in headless runs, so the pairing
link is pasted.

**R9. Session compiler.** 13 cases (12 on WebKit): duration, ffprobe, ffmpeg decode and `<audio>` checks for every
codec and join, cancellation, quota (Chromium only), source hashes unchanged. Chromium and WebKit re-ran green in
this pass (22 s, 29 s). The measurements are in the Session compiler section below; they were not changed.

### Notes on the runs

- **Display sleep hangs headless WebKit.** With the Mac's display asleep, Playwright's WebKit never settles
  (`element is not stable`), so persistent-context WebKit cases hang until their timeout. Two full WebKit runs on
  2026-11-07 failed that way (7 of 10 cases timed out, 25 minutes). Run WebKit through
  `~/ai/bin/with-display-awake`; with it the same suite passes in 1.1 minutes. Those two failed runs are not counted
  in the table.
- **One flaky WebKit run.** In the first WebKit run under `with-display-awake`, `e2e/edit-book.spec.ts` failed once
  (two "Title" fields in the DOM, so the previous Add page was still mounted when the next one opened). It passed in
  3 of 3 isolated repeats and in the following full run. Cause not found; if it returns, look at
  `AnimatePresence mode="popLayout"` page exits in `Shell.tsx` under WebKit.
- **Chrome for the transfer suite.** The two peers exchange UDP on one machine, and this Mac's firewall blocks
  incoming connections for `chrome-headless-shell`, so the transfer spec launches Google Chrome for the Chromium side.
- **Playwright WebKit is not Safari.** None of these runs used a real Safari window or a phone.

### App bugs found and fixed in this pass

- **Update banner stayed disabled after pausing.** Library and Settings treated any book loaded in the player as
  "listening", so Restart never enabled once a book had been opened (after any reload the last book is loaded again).
  They now wait only while audio is playing, preparing or rebuilding, or an import or transfer is running. Found by R3.
- **Restart did not reload in a session that was open since the first install.** The library's own reload only
  fires when the worker swap counts as an update, which it does not for a page that saw the very first install.
  Restart now also reloads on the controller change. Found by R3.

## Live deployment smoke (LB-13)

Run after every deploy: `pnpm --filter web exec playwright test -c playwright.live.config.ts --project=<engine>` (one engine per run, through the memory queue). It needs no local servers: it opens https://zilijonas.github.io/loudbooks/ and uses the production signaling Worker https://loudbooks-signaling.lijonas-it.workers.dev.

Steps, real UI only (the production build has no test harness), committed `fixtures/small/chapter-{1,2,3}.mp3` (24 KB each, MP3):
1. Welcome, Open my library, Add book, three files, Save book; details page shows the title.
2. Play from the start; the audio element's `currentTime` passes 0.5 s; pause.
3. Wait until the service worker controls the page, go offline, open a new tab on the live URL: the library lists the book.
4. A second device (always Google Chrome, see the firewall note in `playwright.transfer.config.ts`) adds a book and sends it; the device under test pastes the pairing link, shows the 6-digit code, the sender types it, the book arrives verified, opens and plays.

| Date | Commit | Device | Engine | Result | Time |
|---|---|---|---|---|---|
| 2026-11-07 | 8e81c06 (deployed) | Mac mini M4, macOS 26.6.2 | Google Chrome (Playwright 1.65.0 `channel: chrome`) | passed | 14.0 s |
| 2026-11-07 | 8e81c06 (deployed) | Mac mini M4, macOS 26.6.2 | Playwright WebKit | passed | 10.8 s |
| 2026-11-07 | 8e81c06 (deployed) | Mac mini M4, macOS 26.6.2 | Playwright Firefox (receiver; Chrome sender) | passed | 13.3 s |

Real Safari 26.6.2 on the same Mac, own window via AppleScript: the live page renders the Welcome screen with "Ready for offline use", the service worker controls the page after a reload, and the precache holds all 27 unique manifest URLs (the manifest lists 32 entries, 5 of them duplicates of icons and the web manifest). GitHub Actions for the deployed commit: Deploy Pages passed (build 41 s, deploy 19 s), Checks passed (1 min 23 s).

## Physical iPhone (pending, owner gate LB-14)

Not run. None of these has a record yet and none may be read as passed. Desktop WebKit is not Safari on iOS.

| Item | Status |
|---|---|
| Install from Safari with Add to Home Screen, open the standalone PWA, import books there | pending owner gate (LB-14) |
| Airplane-mode cold launch of the installed PWA, library and playback | pending owner gate (LB-14) |
| Locked-screen playback of a 30-minute session at 1x and at 1.5x, playing until the file ends, no fade-out | pending owner gate (LB-14) |
| Lock-screen and control-centre controls (play, pause, seek, chapter) | pending owner gate (LB-14) |
| Session compile time and memory for 30 minutes of a multi-file book on the phone (plan §5) | pending owner gate (LB-14) |
| 500 MB book transfer into the installed iPhone app over regular Wi-Fi | pending owner gate (LB-14) |
| Service worker update on the installed PWA while paused | pending owner gate (LB-14) |
| Persistent-storage grant ("Protected from automatic cleanup") on iOS 17+ | pending owner gate (LB-14) |


## Session compiler (LB-5)

### How to run

- Unit (planner + progress/resume rules): `pnpm --filter web test` (`apps/web/tests/session-planner.test.ts`).
- Browser: `pnpm --filter web e2e:compiler --project=<chromium|webkit|firefox>` through the memory queue, one engine per run.
  Uses `apps/web/playwright.compiler.config.ts`, which starts the Vite dev server and opens the dev-only harness
  `apps/web/e2e/harness/compile.html` (never part of the build). Needs the local fixtures from `fixtures/README.md`
  (`fixtures/generated`, `fixtures/downloads/zeland`, `audio_samples/book-long.mp3`); the suite skips without them.
  Set `LB_COMPILER_RESULTS=<file>` to collect one JSON line per compile.

Each case copies the fixtures into OPFS (persistent browser profile: WebKit refuses OPFS in ephemeral contexts),
plans with `planSession`, compiles in the media worker, downloads the output to node and checks:
`ffprobe` header duration within 250 ms of the planned media duration, `ffmpeg -v error -i out -f null -` prints
nothing, mediabunny re-read duration within 250 ms, `<audio>` `loadedmetadata` duration within 250 ms and one second
of muted playback. Separate cases: cancellation mid-write (error `AbortError`, session folder gone), quota
exhaustion (Chromium only, CDP `Storage.overrideQuotaForOrigin`; error `QuotaExceededError`, folder gone), and the
SHA-256 of every source in OPFS unchanged after all compiles.

### Environment (2026-11-06)

Mac mini, Apple M4, 24 GB, macOS 26.6.2 (25G83). Playwright 1.65.0: Chromium 158.0.8127.18 (headless shell),
WebKit 27.2, Firefox 159.0, all headless. Node 26.8.1, ffmpeg/ffprobe 8.1.2, mediabunny 1.65.2.

### Fixtures

| Fixture | Codec | Params | Size |
|---|---|---|---|
| mp3-cbr-64k.mp3 | MP3 CBR | 44.1 kHz mono 64 kb/s, 10:00 | 4.8 MB |
| mp3-vbr.mp3 | MP3 VBR | 44.1 kHz stereo ~97 kb/s, 10:00 | 7.3 MB |
| m4a-aac.m4a | AAC-LC in MP4 | 44.1 kHz stereo 128 kb/s, 10:00 | 9.8 MB |
| m4b-aac.m4b | AAC-LC in MP4 | 44.1 kHz stereo 96 kb/s, 10:00 | 7.3 MB |
| wav-pcm.wav | PCM s16le | 44.1 kHz stereo, 3:00 | 31.8 MB |
| Zeland 001-006 | MP3 CBR | 44.1 kHz mono 56 kb/s, 25 s to 42:46 per file, 62:37 total | 26.3 MB total |
| audio_samples/book-long.mp3 | MP3 | 48 kHz stereo ~85 kb/s, 46:12 | 29.7 MB |

Two-file books (`m4a+m4a`, `m4b+m4b`, `wav+wav`) reuse one OPFS copy twice to exercise a file join per codec.

### Results (all passed in all three engines; quota case Chromium only)

Δ = ffprobe duration minus planned media duration. "audio" = `<audio>.duration` after `loadedmetadata`.

| Case | Parts | Planned s | ffprobe s | Δ s | Chromium audio s | WebKit audio s | Firefox audio s |
|---|---|---|---|---|---|---|---|
| MP3 CBR within a chapter, mid-file cut | 1 | 60.000 | 60.037 | +0.037 | 60.037 | 60.108 | 60.037 |
| MP3 VBR mid-file cut, 2 min at 1.5x | 1 | 180.000 | 180.033 | +0.033 | 180.033 | 180.088 | 180.033 |
| M4A spanning a file join | 2 | 90.000 | 90.039 | +0.039 | 90.039 | 90.019 | 90.039 |
| M4B 3 full chapters across a join | 2 | 450.000 | 450.024 | +0.024 | 450.024 | 450.021 | 450.024 |
| WAV whole remaining book across a join | 2 | 189.990 | 189.990 | 0.000 | 189.990 | 189.990 | 189.990 |
| Zeland 004 -> 005 spanning chapters | 2 | 300.000 | 300.065 | +0.065 | 300.065 | 300.121 | 300.065 |
| Zeland 3 full chapters (004-006) | 3 | 3507.595 | 3507.671 | +0.076 | 3507.671 | 3507.670 | 3507.671 |
| Zeland partial final chapter | 1 | 76.816 | 76.842 | +0.026 | 76.842 | 76.904 | 76.842 |
| Zeland whole book 001-006, no timer | 6 | 3757.198 | 3757.350 | +0.152 | 3757.350 | 3757.349 | 3757.350 |
| book-long.mp3 30-minute cut | 1 | 1800.000 | 1800.025 | +0.025 | 1800.025 | 1800.096 | 1800.025 |

Where the Δ comes from (all measured, all inside 250 ms):

- MP3 files read about one frame (26 ms) longer in ffprobe than the written timeline: mediabunny's Xing frame
  count includes the Xing frame itself.
- Each file join keeps the next file's first frame/packet (MP3 encoder priming ~25 ms, AAC priming packet 23 ms)
  so the decoder starts that file cleanly. The source map records it, so the UI timeline does not drift; the file
  grows by that much per join (Zeland 001-006: 5 joins, +0.152 s total). A book with many short files accumulates
  ~25 ms per join in file length only.
- WebKit ignores the MP3 LAME encoder-delay field, so it plays the 1-3 preroll frames at the start of an MP3
  session (up to ~0.1 s of audio before the planned start; `audio.duration` +0.05-0.07 s). Chromium and Firefox
  honour it. AAC edit lists are honoured by all three.
- PCM WAV is sample-exact (block-aligned slicing).

### Compile time and peak memory

Time = `compileInWorker` call to resolved result in the page (includes worker start, analysis, copy, finalize and
the verification re-read). Memory = peak RSS of all of the engine's browser processes during the compile minus the
level just before (sampled every 100 ms with `ps`); `performance.measureUserAgentSpecificMemory` is unavailable
because the page is not cross-origin isolated, and the worker heap is not separately observable in WebKit.

| Engine | 30 min from book-long.mp3 (19.2 MB out) | 3 Zeland chapters, 58:28 (24.6 MB out) | Zeland 001-006, 62:37 (26.3 MB out) |
|---|---|---|---|
| Chromium 158 | 337 ms, +52 MB | 474 ms, +130 MB | 522 ms, +147 MB |
| WebKit 27.2 | 811 ms, +11 MB | 1546 ms, +289 MB | 1626 ms, +149 MB |
| Firefox 159 | 4309 ms, +240 MB | 8920 ms, +146 MB | 9791 ms, +258 MB |

Repeat Chromium runs of the same cases: 30 min 278-335 ms, 3 chapters 474-505 ms. Firefox is ~10x slower than
Chromium on the same work; not investigated yet (Firefox is not a primary target for the locked-phone flow). These
are desktop numbers; the phone measurement required by plan §5 is still to be recorded on a real device.

Memory is bounded by design: packets are streamed one at a time, output goes through a 1 MiB chunked
`StreamTarget` with positioned writes, sources are read through `BlobSource` (no whole-file `arrayBuffer`). The
growth seen is mostly mediabunny's MP3 frame index (one entry per frame up to the cut end, kept until the part's
input is disposed) and the MP4 sample tables.

### Restrictions found

- Packet copy only for MP3 in MP3, AAC in MP4/M4A/M4B, PCM in WAV. Anything else is refused with
  `UnsupportedMediaError` (never transcoded). AAC in ADTS (.aac) is not enabled because it is untested.
- All files of one session must share codec, sample rate, channel count and (AAC) AudioSpecificConfig; otherwise
  `UnsupportedMediaError`. Mixed-format multi-file books need a different strategy.
- `.m4b` sources produce an `.m4a` session file (mediabunny writes plain MP4; no chapter atoms, not needed for a
  session).
- MP3 start trim is limited to 4624 samples (12-bit LAME delay + 529); the preroll is capped to fit, so a start
  frame whose bit reservoir reaches further back than that decodes its first granule from partial data. Not
  observed with the fixtures (`ffmpeg -v error` clean everywhere).
- MP3 end is frame-aligned (up to one frame, 26 ms, past the planned end); AAC packet-aligned (23 ms).
- Very long single MP3 files: mediabunny indexes MP3 frames from the file start up to the cut, so a cut deep into
  a 13 h file scans and holds that index. Not measured here; the `indexes/<assetId>.bin` from the spec is the fix.
- Cancellation terminates the per-compile worker (the copy loop finishes 30 min in ~0.3 s and never yields a task
  for a message to arrive; yielding cost 3-4x throughput), then deletes the session folder from the main thread.
