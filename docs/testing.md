# Testing records

Every record names device, OS, browser, codec parameters, file size, steps, result and measurements (plan §10).

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
