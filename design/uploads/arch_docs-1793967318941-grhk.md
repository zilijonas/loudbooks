# Loud Books — Architecture and Technical Specification

**Specification date:** November 6, 2026.  
**Edition:** English. All documentation, prototype content, and default UI copy must be in English.  
**Status:** Implementation plan, not certification of an already tested application. Platform capabilities, pricing, and source references are retained from the original dated specification; this translation is not a new verification. Numeric performance targets are targets, not completed benchmark results.

## 1. Product Scope

Loud Books is a personal, free, open-source audiobook PWA. Application assets are hosted on GitHub Pages. The library, covers, audio files, settings, and listening progress are stored on the user's current device. There are no accounts, sign-in flows, subscriptions, library backend, analytics, recommendation algorithms, or automatic synchronization.

The primary platform is a PWA installed on an iPhone's Home Screen. The same application works in a desktop browser and on Android. The project does not require a separate native app, TestFlight, or an Apple Developer membership.

A book is created by importing personal files. A title and at least one audio file are required; a description and cover are optional. Multiple files become reorderable chapters. A single file remains one complete book; the user may choose to display generated 30-minute parts.

The central architectural principle is that a locked phone plays **one fully prepared local audio file**. The listening session ends because the file itself ends, not because a JavaScript timer must execute in the background. There is no volume-reduction or fade-out feature.

Sharing is a one-time copy between two devices using WebRTC, not cloud synchronization. The only server-side component is a small Cloudflare pairing service that exchanges connection information. This is serverless infrastructure, not literally an architecture with no servers whatsoever.

## 2. Findings Carried Over from the Original Specification

### 2.1. Local Storage

WebKit documents a per-origin quota of up to approximately 60% of device disk capacity for Safari and standalone PWAs; the combined quota across origins may reach 80%. These are upper limits, not reserved or guaranteed available space. Obtain an estimate with `navigator.storage.estimate()`, and still handle `QuotaExceededError` on every write operation. [S1, S2]

`navigator.storage.persist()` requests persistent storage; `navigator.storage.persisted()` reports whether it was granted. The browser can decline the request. When granted, persistence protects against ordinary automatic eviction under the browser's storage policy, but does not prevent the user from clearing website data and is not a backup. Using OPFS alone does not imply that persistence has been granted. [S1, S2]

Safari and an iOS PWA installed on the Home Screen have separate local storage. Do not import books into Safari and expect them to appear automatically in the installed PWA. [S3]

### 2.2. Audio File Preparation

Mediabunny provides partial file reading, encoded-packet reading and writing APIs, and streaming output to disk. This makes it a suitable foundation for a session compiler that does not need to decode an entire book to PCM. Its documented container support includes MP3, MP4/M4A, WAVE, and others. [S4–S9]

Do not assume that the high-level `Conversion` API guarantees trimming without re-encoding: the documentation describes restrictions on start trimming and MP3 copying. This project's fast path must use a lower-level encoded-packet pipeline, with codec-specific limitations verified through tests. The library is not an off-the-shelf audiobook session engine. [S6–S9]

### 2.3. Sharing

WebRTC requires SDP/ICE connection information to be exchanged through a separate signaling channel. A QR code containing a one-time token, followed by a short confirmation code, provides convenient pairing when Cloudflare handles signaling. Files travel over `RTCDataChannel`, not through Worker HTTP requests. [S10, S11]

V1 targets devices on the same home Wi-Fi network. Use Cloudflare's public STUN service, with TURN disabled. STUN is not a file relay. Direct peer-to-peer connectivity may fail on isolated guest or corporate networks; show a specific connection error and allow retrying on another network. [S10, S12]

## 3. Architecture Diagram

```text
GitHub Pages: HTML + JS + CSS + local fonts + icons + PWA manifest
                                |
                   React application / one AudioController
                    |            |                |
                Dexie/IDB       OPFS          Service Worker
                 metadata    audio files    application assets only
                    |            ^
                    +--- Media Worker --- session file preparation
                                 |
                         File -> Blob URL -> <audio>

Desktop PWA ---- HTTPS/WSS ---- Cloudflare Worker + PairRoom Durable Object
Phone PWA ------ HTTPS/WSS ----+         SDP/ICE and pairing state only

Desktop PWA ======== WebRTC DataChannel ======== Phone PWA
                 book files and manifest              |
                                              OPFS + IndexedDB
```

Listening, local import, editing, and session creation do not depend on Cloudflare. The Worker only needs to be available when establishing a new convenient pairing between devices. After a successful import, the user can enable airplane mode.

## 4. Technology Stack

| Area | Choice | Purpose |
|---|---|---|
| Application | React + TypeScript + Vite | Static SPA without SSR or server-rendered pages |
| Routing | `react-router`, `createHashRouter` | Reliable routes on GitHub Pages |
| Styling | `tailwindcss` + `@tailwindcss/vite` | Design tokens and responsive UI |
| UI foundation | Radix Primitives + custom components | Dialogs, menus, sliders, and focus management |
| Animation | `motion`, imported from `motion/react` | Springs, bounce, hover/tap feedback, shared-element transitions |
| Icons | `lucide-react` | Consistent SVG iconography; the logo remains original |
| Forms | `react-hook-form` + `zod` | Import forms, validation, and schemas |
| Chapter ordering | `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-and-drop with alternative reorder buttons |
| Transient UI state | `zustand` | Player and UI state; not a replacement for persistent library storage |
| Database | `dexie`, `dexie-react-hooks` | IndexedDB, migrations, and reactive queries |
| Files | OPFS | Audio sources, temporary sessions, and import staging |
| Media | `mediabunny` | Metadata, packet reading, and trim/remux/merge adapters |
| Processing while the app is active | Dedicated Web Worker + `comlink` | Media processing and file writing outside the UI thread |
| Player | One `HTMLAudioElement` + Media Session API | Actual playback and operating-system controls |
| PWA | `vite-plugin-pwa` + Workbox | App precaching, offline launch, and update prompts |
| Transfer transport | Native `RTCPeerConnection` / `RTCDataChannel` | No additional PeerJS server |
| QR | `qrcode` + `qr-scanner` | QR generation on the sender and scanning inside the PWA |
| File integrity | `hash-wasm` | Incremental SHA-256 without loading the entire file into RAM |
| Backups | `@zip.js/zip.js` | Optional `.loudbook.zip` packages; not the primary transfer method |
| Signaling | Cloudflare Workers + SQLite-backed Durable Objects | Short-lived rooms for two devices |
| Worker deployment | `wrangler` | Configuration and deployment |
| Component catalog | Storybook | Component variants and states |
| Testing | Vitest, Testing Library, Playwright, axe-core | Logic, components, integration, and accessibility |
| CI/CD | GitHub Actions | Checks and GitHub Pages deployment |

At implementation kickoff, select mutually compatible stable versions and commit the lockfile. Do not automatically update dependencies in production. The project's own code can use the MIT license; retain the licenses and notices of third-party dependencies rather than describing every dependency as MIT-licensed.

The choices of Radix, Motion, Dexie, Tailwind, and Vite are supported by their official documentation. [S13–S18] Primary project references for QR scanning, ZIP handling, and hashing are provided in [S24–S26].

## 5. Module Boundaries

`LibraryRepository` is the sole writer of library metadata. `MediaStorage` owns OPFS paths, write locks, and storage checks. `ImportCoordinator` manages file analysis, staging, and commit. `SessionPlanner` is a pure function: current position plus user selections produce a list of source intervals.

`SessionCompiler` materializes the planned intervals into one file inside a Web Worker. `AudioController` owns one audio element, which is never recreated when navigating between React pages. `ProgressTracker` maps session time back to the original book position. `TransferCoordinator` manages WebRTC, incremental writes, and commit. `StorageMaintenance` removes only inactive files that are no longer needed.

Use typed state machines or reducers instead of independent `isLoading`, `isPlaying`, and `isPreparing` flags that can contradict one another. A separate state-machine library is not required.

## 6. Data Model

| Entity | Important fields |
|---|---|
| `Book` | id, title, description, coverAssetId, revision, createdAt, updatedAt, status |
| `MediaAsset` | id, bookId, path, originalFilename, container, codec, channels, sampleRate, duration, bytes, sha256 |
| `Chapter` | id, bookId, order, title, globalStart, globalEnd, kind: imported/generated, sourceRanges |
| `PlaybackProgress` | bookId, bookRevision, sourceAssetId, sourceOffset, globalOffset, updatedAt, stopReason, rewindPending |
| `PlaybackSession` | id, bookId, revision, mode, rate, requestedListeningSeconds, actualMediaDuration, outputPath, state, sourceMap, lastObservedPosition |
| `ImportJob` | id, stagingPaths, expectedFiles, receivedFiles, state, error |
| `TransferJob` | id, manifestDigest, fileOffsets, verifiedFiles, state, expiresAt |
| `Settings` | theme, locale, defaultSpeed, generatedPartsPreference, schemaVersion |

A `sourceMap` is required even when the UI displays a single continuous timeline. Example:

```json
{
  "sessionId": "session-uuid",
  "bookId": "book-uuid",
  "mode": "duration",
  "rate": 1.5,
  "requestedListeningSeconds": 1800,
  "parts": [
    {"assetId": "a", "sourceStart": 600, "sourceEnd": 1200, "sessionStart": 0},
    {"assetId": "b", "sourceStart": 0, "sourceEnd": 1500, "sessionStart": 600},
    {"assetId": "c", "sourceStart": 0, "sourceEnd": 600, "sessionStart": 2100}
  ]
}
```

In this example, the file contains 2,700 seconds of media and takes 1,800 seconds to play at 1.5×. Store codec-specific trimming allowances, preroll, and actual packet boundaries separately; the UI timeline must not silently accumulate errors between chapters.

OPFS layout:

```text
/loud-books/v1/
  books/<bookId>/assets/<assetId>.<ext>
  books/<bookId>/covers/<coverId>.webp
  books/<bookId>/indexes/<assetId>.bin
  sessions/<sessionId>/audio.<ext>
  staging/<jobId>/...
```

A Blob URL is not a persistent file address. Store the OPFS path in the database, not `blob:...`. Create a new URL from `getFile()` when starting playback.

## 7. Import, Long Files, and Splitting

### Import Flow

The user selects files. The UI applies natural filename sorting (`2` before `10`) and allows manual reordering. A Worker checks the actual container and codec, extracts durations, and creates chapters. The title is required. Resize the cover to a suitable size; when no image is supplied, generate a deterministic typographic cover.

V1 support targets MP3, AAC-LC M4A/M4B, and PCM WAV. Treat `.m4b` as an audio MP4-family container, not as a promise to support every possible codec or DRM configuration. DRM is unsupported. Do not list FLAC, OGG, or other formats as supported merely because a browser sometimes plays them: their session-generation adapter must also be tested.

Under the agreed use case, a book's chapter files are expected to be compatible. The application checks this automatically. Do not ask users to understand sample rates or codec parameters. Show a clear error for an incompatible file; do not silently transcode the entire collection.

### A Long Book Does Not Necessarily Require Large Amounts of RAM

File size formula: `bytes = seconds × bitrate / 8`. Excluding small header overhead:

| Content | 64 kb/s | 128 kb/s |
|---|---:|---:|
| 30 minutes | 14.4 MB | 28.8 MB |
| 13 hours | 374.4 MB | 748.8 MB |
| 20 hours | 576 MB | 1,152 MB |

The problem would be loading the entire book through `arrayBuffer()` and `decodeAudioData()` into PCM, not its duration alone. Also avoid copying the entire file into the virtual RAM filesystem of `ffmpeg.wasm`. Keep working-buffer queues bounded. [S4, S5]

The primary storage model uses immutable original audio files and interval metadata. By default, 30-minute “parts” can be logical intervals, without making repeated copies of the content. Physical splitting is an optional import optimization when seeking or indexing a particular format would otherwise be too slow. Perform it once as a streaming operation, not every time Play is pressed.

Do not assume Mediabunny publicly exposes a persistable byte-offset index for every format. Integrate its seek API first. Only create a codec-specific indexing adapter or physical segments if measurements demonstrate the need. The first scan of a VBR MP3 may take longer than preparing a session from already indexed material.

Technical storage segments are not new semantic chapters unless the user enables generated parts. Changing the physical storage layout must not change the listening position or the book's chapter boundaries.

### Safe Commit

Create an `ImportJob` first. Write files into staging and verify their size, format, and hash. Only after all writes succeed should a Dexie transaction mark the book as `ready`. OPFS and IndexedDB do not share an atomic transaction; compensate with a journal, an idempotent recovery procedure, and cleanup of inactive staging files.

Do not require a file rename API as the only commit mechanism: `ready` metadata can start pointing to an already completed staging path. Later reorganization is optional. Never delete an original before verifying its complete replacement.

## 8. Session Planning and Compilation

### Time and Playback Speed

A duration-based timer means active listening time, not a wall-clock deadline measured from the initial button press. Manual pauses do not consume the session's listening budget.

At a constant rate, without seeking:

```text
mediaDuration = requestedListeningSeconds × playbackRate
sourceEnd = min(sourceStart + mediaDuration, bookEnd)
```

Thirty minutes at 1× requires 30 minutes of source audio; at 1.5×, 45 minutes; at 0.75×, 22.5 minutes. The end of the book takes precedence over a longer timer.

Options: 5 / 15 / 30 minutes, custom duration, end of this chapter, end of the next chapter, end of the chapter after next, and no timer. Disable unavailable future-chapter options with a short explanation.

### Preparation Algorithm

1. `SessionPlanner` selects source intervals on the original book timeline.
2. Check whether an existing file already satisfies the selection. A single complete file with no timer can play directly from the current position.
3. Otherwise, a Worker reads only the necessary intervals using `Input`, `BlobSource`, and `EncodedPacketSink`.
4. A codec adapter selects valid cut boundaries and handles required decoder preroll, encoder delay/padding, and packet timestamps.
5. `EncodedAudioPacketSource` receives the existing encoded audio and places its packets on a continuous new timeline. No full PCM decoding takes place.
6. `Output`, the appropriate muxer, and `StreamTarget` write to OPFS. Honor the supplied `position`: container headers may need to be rewritten rather than merely appended. [S5]
7. Finalize headers, verify the actual duration, close write handles, and save the `sourceMap` and `ready` state.
8. Only then hand the file to the single `<audio>` element. Set `loop=false`; a session's `ended` event must never automatically launch another file.

A Dedicated Worker's `FileSystemSyncAccessHandle` is suitable for OPFS writes with bounded buffers and explicit `flush`/`close`. `createWritable()` may be used where support has been verified. [S21]

### Format Accuracy

An MP3 cannot safely be cut at an arbitrary byte offset. In addition to frame boundaries, consider decoder dependencies and update duration/seek metadata. M4A requires correct sample tables and timestamps. WAV requires calculating PCM block boundaries and writing new headers. These are tested `CodecAdapter` responsibilities, not `Blob.slice(seconds)` operations.

V1 is not a professional sample-exact editing tool. A small, measured frame-boundary error is acceptable; accumulating drift, corrupt starts, digital noise, or skipped sentences are not. Validate the initial cut-accuracy target of no more than 250 ms with fixtures. Do not silently label unsupported files as successfully processed.

### No Timer with a Multi-File Book

Do not fall back to JavaScript playlist switching in the background. Prepare one file through the end of the book, or create a continuous-book cache once and reuse it. The second option consumes extra storage and needs a separate, clearly removable cache category. Never silently replace unrestricted listening with a 30-minute cap.

## 9. Player and Progress Recovery

One `HTMLAudioElement` lives above the route tree. React navigation does not unmount it. The player does not use Web Audio as its primary playback engine and does not treat the Service Worker as a continuously running audio process.

Use `File` from OPFS → `URL.createObjectURL(file)` → `audio.src`. An additional whole-book `arrayBuffer()` is unnecessary. Revoke the old URL only after detaching its source. Do not delete an OPFS file while it is in active use.

Playback is tied to a user action. Long asynchronous preparation can outlive the original gesture's playback permission, so catch a rejected `play()` call and display a real “Ready — play” button. Do not rely on hidden silent-audio “unlocking” tricks. [S23]

Player controls: Play/Pause; −30 seconds / +15 seconds of original content; a position slider; chapters; 0.75× / 1× / 1.25× / 1.5× / custom speed, with a proposed range of 0.5–3× to validate on devices; a timer; and book/chapter progress. Update Media Session titles, artwork, and supported actions while JavaScript is executing.

Use `sourceMap` and `audio.currentTime` to recover the actual original-file and book positions. Save a checkpoint approximately every five seconds and on pause, seeked, ratechange, visibilitychange, and pagehide when those events are available. Do not assume JavaScript will run every checkpoint while backgrounded.

When returning to a still-running application, first read `audio.currentTime` and `ended`, reconcile progress, and only then decide what to clean up. If the process was terminated, restore the last confirmed checkpoint. Elapsed wall-clock time alone does not establish how much was actually heard; do not mark an entire session as completed without evidence.

After a confirmed duration-based stop, subtract five seconds from the original position once, clamped at the book's beginning. After a chapter-boundary stop, resume at the start of the next chapter. After a normal manual pause, resume from the same position. At the actual end of the book, mark it `completed` instead of entering another automatic five-second rewind loop.

### Changing Speed or Position During an Active Session

The duration of a finite file is not a stopwatch independent of seeking and `playbackRate`. Define this explicitly rather than hiding it.

While the application is open, changes to speed, position, or timer settings that affect the remaining listening duration follow this sequence: pause → calculate the remaining listening budget → replan → prepare a replacement file → resume. For duration-based sessions, preserve the time actually heard, not merely the new position after a seek.

The V1 lock-screen contract for timed sessions is Play/Pause and the end of the current prepared session. Do not promise to generate a replacement segment, change the timer boundary, or switch books from the lock screen. If the OS independently allows scrubbing or speed changes without application coordination, the stop point remains the file's end, but the remaining real listening duration changes. The UI can show “Session remaining” instead of promising an inaccurate wall-clock countdown.

## 10. Storage Policy and Cleanup

Settings categories: books, covers, temporary sessions, optional continuous-book cache, and application assets. “Clear temporary files” never deletes books. “Delete library” requires a separate, explicit confirmation.

Before compiling a session, account for source files, new output, staging, and any old file still in use. Quota estimates can be imprecise; do not make definite claims such as “Your phone has exactly X GB available.” OPFS, IndexedDB, and Cache Storage share the origin's storage budget. [S1, S2]

On launch or return, restore the session and progress first; only then remove inactive temporary files that are no longer needed. One active file plus one replacement during a safe handover is a sufficient default limit. Do not clear a paused session merely because the application becomes visible.

Recommend installing the phone PWA before the first large import or Receive flow. Show “Protected from automatic cleanup” only when `persisted=true`; otherwise show “Standard storage.” Do not promise that files can never be lost.

## 11. WebRTC Transfer Protocol

### User Flow

On desktop: open a book → Send to another device → display a QR code.

On phone: open the installed Loud Books PWA → Receive a book → scan the QR code inside the PWA. The phone displays a short confirmation code to enter on the computer. Receipt then continues automatically. After verification, the book appears in the library, not in the Files app.

Scanning with the system Camera app is not the primary route: it can open Safari, which has separate storage. If camera access is denied, allow pasting the full pairing link into the PWA or use a specifically secured manual-pairing flow. Do not force users to transfer the book itself through Files. [S3]

### Signaling

A Cloudflare Worker validates requests. One `PairRoom` Durable Object per pairing coordinates both participants. Use a SQLite-backed class and the WebSocket Hibernation API, not an older KV-backed Durable Object. For small amounts of state, the `ctx.storage` key-value methods inside a SQLite-backed object are sufficient; no separate D1 database is required. [S19, S20]

Use a short room lifetime, such as five minutes for pairing, and a maximum of two participants. The QR contains a cryptographically random token with at least 128 bits of entropy, not just six digits. The six-digit code is an additional confirmation with attempt limits and a TTL. Use separate one-time tokens for each role. There are no user accounts, but pairing still requires authorization.

Keep tokens in the URL fragment and out of analytics, referrers, and logs. Authenticate WebSockets through the first message within a short deadline, then close invalid connections. Validate Origin, message schemas, size, and rate. Enforce room TTL and limits on every operation; a Durable Object alarm removes transient state.

Signaling messages: `join`, `approve`, `offer`, `answer`, `ice-candidate`, `reject`, and `close`. Send the transfer manifest and book metadata over the DataChannel; do not store them in a Workers library database.

### Files and Backpressure

Use a reliable, ordered DataChannel. An initial payload target is 16 KiB, without exceeding the negotiated `pc.sctp.maxMessageSize` after subtracting the protocol header. This is an initial tuning choice, not a universal standard limit. Never send a 500 MB file as one message. [S11]

Bound both the sender's `bufferedAmount` and the receiver's disk-write queue. Transport backpressure alone is insufficient when the phone writes more slowly: the receiver grants credits or ACKs only after successful chunk writes. Transfer binary buffers into Workers with transferable objects, not by copying them through JSON.

Transmit a manifest containing `schemaVersion`, book metadata, chapter order, and the file list. Each file has an ID, size, and SHA-256. Chunks carry `fileId`, offset, and payload. Validate byte-offset boundaries, final size, and hash. Never use a received file path directly as an OPFS path; generate paths locally.

Keep partial files and acknowledged checkpoints in staging. After a disconnection, offer to resume following a new pairing, verifying the same manifest digest and already validated offsets. In the simplest initial implementation, it is acceptable to restart only the unfinished file while retaining previously verified complete files. Do not claim byte-level resume until checkpoint behavior is reliably tested.

Commit through the same `ImportCoordinator` used for local imports. Do not transfer temporary playback sessions or automatically synchronize progress. An optional “Include listening position” feature transfers a one-time snapshot, not ongoing sync.

Keep both pages active during transfer and compilation. Where supported, Screen Wake Lock helps prevent the display from turning off automatically, but does not grant unlimited background execution. It is unnecessary during listening. [S22]

## 12. Cloudflare Pricing and Limits

Pricing snapshot retained from the original specification dated November 6, 2026. [S19, S20]

| Resource | Free allowance |
|---|---:|
| Workers requests | 100,000 per day |
| Workers CPU | 10 ms per invocation |
| SQLite-backed Durable Object requests | 100,000 per day |
| Durable Object execution duration | 13,000 GB-s per day |
| Durable Object SQLite rows read | 5 million per day |
| Durable Object SQLite rows written | 100,000 per day |
| Durable Object SQLite stored data | 5 GB |

Exceeding a Free-plan Durable Object limit causes operations to fail; it does not automatically enable unlimited paid scaling. Hibernation reduces execution costs for idle WebSocket rooms. A short-lived signaling service for one person's devices is designed to fit comfortably within these limits, but the public endpoint still needs abuse controls.

Workers Paid starts at USD $5 per month and includes Durable Object allowances. This does not establish that the user's existing “five-euro” subscription is that product. The account's billing has not been accessed; verify the product name. Paid-plan overages can incur additional charges, so an existing $5 subscription does not mean unlimited usage. This project does not require enabling a new paid plan. [S19]

V1 does not create an R2 bucket, server-side audio storage, a Queue for audio processing, or paid TURN infrastructure. Cloudflare's public STUN service is documented as free. [S12]

## 13. GitHub Pages and Offline Operation

GitHub Pages publishes only the application build; books never enter Git. A public open-source project can be hosted using GitHub Free. GitHub's website size and traffic limits are not limits on the phone's local library. [S27]

For a project site, use `base: '/loud-books/'` and align `manifest.id`, `start_url`, and `scope` with that path. Use hash-based routing. [S15, S18]

The Service Worker must precache the entire application package required offline, including dynamically imported JavaScript, Worker scripts, WASM, fonts, and SVGs. Show “Ready for offline use” only after precaching completes, not merely based on `navigator.onLine`. That property also does not guarantee actual internet or signaling availability.

Workbox `generateSW` is sufficient for the straightforward implementation; use `injectManifest` only when a concrete need for custom Service Worker logic arises. Audio files do not need to be duplicated in Cache Storage: the main playback path is OPFS File → Blob URL.

Use `registerType: 'prompt'`. A new application version must not automatically reload the page during playback, import, or transfer. Apply updates after active work reaches a safe stopping point. Version Dexie migrations. [S17]

Project paths under the same `username.github.io` host are not separate origin security boundaries. Namespace databases and directories, and do not deploy untrusted JavaScript under the same origin. A separate GitHub organization site is an option for stronger isolation. Changing domains does not automatically migrate the existing local library. [S2, S14]

## 14. Screens and States

Primary screens: Welcome / installation; Library; Add/Edit Book; Book Details; Full Player; Receive / QR; Settings / Storage / About. Sender sharing flows, timer settings, speed, chapters, confirmations, and errors use bottom sheets or dialogs when a dedicated page is unnecessary.

Library states: empty, single-book, populated, no search results, completed, and missing local asset. Import states: form, validation, analysis, progress, cancellation, error, and commit. Player states: idle, preparing, ready, playing, paused, seeking/rebuilding, ended, interrupted, and error. Transfer states: QR, permissions, waiting, approval, connecting, transferring, verifying, committing, done, disconnected, retry, and canceled.

Keep navigation minimal. On mobile, prioritize the library, clear Add / Receive actions, and settings. Show the mini-player only when a book is active. Welcome must not block returning users. Dark and light modes are complete themes, not merely background-color swaps.

## 15. Visual Direction

Create an original Loud Books identity combining books, pages, and sound rather than using a generic headphones icon. Use warm surfaces, expressive accents, large rounded controls, and editorial typography. Avoid SaaS dashboard styling and Spotify imitation.

Default motion should be energetic: springs and bounce, elastic press feedback, hover lift, a book-card-to-player transition, lively bottom sheets, chapter reordering, and brief success feedback. `motion/react` provides the interaction foundation. [S13]

Define explicit motion tokens: `springSoft`, `springPlayful`, `press`, `hoverLift`, `sheet`, `page`, and `reduced`. Persistent effects in the player must not interfere with reading timestamps or tracking progress. For reduced motion, replace substantial transforms with a short opacity transition or remove them. Do not depend on runtime CDNs for animations or fonts. [S28]

Accessibility: WCAG AA contrast, 44–48 px touch targets, visible keyboard focus, semantic buttons, screen-reader labels, dialog focus trapping, and keyboard-accessible chapter reordering. All default UI copy, sample content, and documentation are English. Keep strings externalized so localization can be added later, but do not require a second language or a bilingual prototype for V1.

## 16. Acceptance Principles and Confidence

The architecture is based on documented APIs and a clearly scoped use case. Overall design confidence: **0.91**. This is not a measured 91% successful-session rate.

The first implementation gate is an OPFS-generated MP3/M4A session playing on a physical iPhone with its screen locked and airplane mode enabled. The second is safe trimming and merging of 30-minute intervals. The third is transfer directly into the installed PWA's storage. Playwright WebKit results alone do not replace these checks.

Do not promise two unverified outcomes: universal sample-exact remuxing of all audio formats, or preparation of any file within a fixed number of seconds. These are concrete media-adapter and performance-testing tasks, not reasons to abandon the PWA approach.

## 17. Primary Sources

The original specification's reference date is November 6, 2026. The numbered references and URLs below are retained in this English edition, not newly checked as part of translation. References such as [S1] point to these documentation sources. Proposed technology choices and project-specific numeric limits are design decisions, not platform guarantees.

- S1. WebKit, Updates to Storage Policy — `https://webkit.org/blog/14403/updates-to-storage-policy/`
- S2. MDN, Storage quotas and eviction criteria — `https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria`
- S3. WebKit, Safari 17.2, Home Screen storage — `https://webkit.org/blog/14787/webkit-features-in-safari-17-2/`
- S4. Mediabunny, Reading media files — `https://mediabunny.dev/guide/reading-media-files`
- S5. Mediabunny, Writing media files — `https://mediabunny.dev/guide/writing-media-files`
- S6. Mediabunny, Media sinks — `https://mediabunny.dev/guide/media-sinks`
- S7. Mediabunny, Media sources — `https://mediabunny.dev/guide/media-sources`
- S8. Mediabunny, Converting media files — `https://mediabunny.dev/guide/converting-media-files`
- S9. Mediabunny, Supported formats — `https://mediabunny.dev/guide/supported-formats-and-codecs`
- S10. WebRTC, Getting started with peer connections — `https://webrtc.org/getting-started/peer-connections`
- S11. MDN, Using WebRTC data channels — `https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels`
- S12. Cloudflare, Realtime TURN FAQ / STUN — `https://developers.cloudflare.com/realtime/turn/faq/`
- S13. Motion, React transitions — `https://motion.dev/docs/react-transitions`
- S14. Dexie, React tutorial — `https://dexie.org/docs/Tutorial/React`
- S15. React Router, createHashRouter — `https://reactrouter.com/api/data-routers/createHashRouter`
- S16. Radix, Primitives introduction — `https://www.radix-ui.com/primitives/docs/overview/introduction`
- S17. Vite PWA, Prompt for update — `https://vite-pwa-org.netlify.app/guide/prompt-for-update`
- S18. Vite, Static deploy — `https://vite.dev/guide/static-deploy`
- S19. Cloudflare, Workers pricing — `https://developers.cloudflare.com/workers/platform/pricing/`
- S20. Cloudflare, Durable Objects pricing and Hibernation — `https://developers.cloudflare.com/durable-objects/platform/pricing/`; `https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/`
- S21. MDN, FileSystemSyncAccessHandle — `https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle`
- S22. MDN, Screen Wake Lock API — `https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API`
- S23. WebKit, media user gesture policy — `https://webkit.org/blog/6784/new-video-policies-for-ios/`
- S24. Nimiq, qr-scanner — `https://github.com/nimiq/qr-scanner`
- S25. zip.js — `https://gildas-lormeau.github.io/zip.js/`
- S26. hash-wasm — `https://github.com/Daninet/hash-wasm`
- S27. GitHub Pages — `https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages`; `https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits`
- S28. Motion, Accessibility — `https://motion.dev/docs/react-accessibility`
- S29. Claude Design — `https://support.claude.com/en/articles/14604416-get-started-with-claude-design`; `https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design`
- S30. Tailwind + Vite — `https://tailwindcss.com/docs/installation/using-vite`
