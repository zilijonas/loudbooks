# Loud Books — Implementation Plan and Acceptance Criteria

**Date:** November 6, 2026.  
**Language:** English throughout documentation, comments, sample content, and default UI copy.  
**Companion document:** [Architecture and Technical Specification](01-Architecture-EN.md).

The states, limitations, and platform capabilities in the architecture must not be replaced with simplified prototype assumptions. The tests below are work to be performed, not a report of tests already completed.

## 1. Project Structure

Use one repository with a straightforward pnpm workspace. Nx, Kubernetes, and a large collection of services are unnecessary.

```text
loud-books/
  apps/
    web/
      public/
        icons/
        fonts/
      src/
        app/                  # Shell, router, providers, startup and recovery
        pages/                # Welcome, library, add/edit, details, player, receive, settings
        components/
          ui/                 # Core design system
          books/
          player/
          transfer/
        features/
          library/
          import/
          playback/
          sessions/
          transfer/
          storage/
          settings/
        domain/               # Models and pure planning functions
        services/
          db/
          opfs/
          audio/
          media-session/
          signaling/
        workers/
          media.worker.ts
          storage.worker.ts
        styles/
          tokens.css
          globals.css
        locales/
          en.json
      tests/
      vite.config.ts
    signaling/
      src/
        index.ts
        PairRoom.ts
        validation.ts
      tests/
      wrangler.jsonc
  packages/
    contracts/                # Zod schemas, transfer protocol, and book manifest
  docs/
    architecture.md
    decisions.md
    testing.md
    privacy.md
  fixtures/
    README.md                 # Instructions for generating test media
  .github/workflows/
    checks.yml
    deploy-pages.yml
    deploy-signaling.yml
  pnpm-workspace.yaml
  pnpm-lock.yaml
  LICENSE
  THIRD_PARTY_NOTICES.md
```

Do not commit large real audiobooks or copyrighted test books. Generate long test media locally; commit only small, legally usable fixtures or their generators.

## 2. Phase A — Technical Prototype for Critical Integrations

**Goal:** Validate the actual audio-and-storage pipeline before connecting substantial UI.

Build a minimal screen that selects an MP3/M4A, streams it into OPFS, plays it through one HTML audio element, displays `currentTime`, and recovers position when returning to the application. Then generate one temporary 30-minute file from a long source and another from multiple chapters.

Required tests on a physical iPhone: installed PWA, fully prepared file, airplane mode, locked screen, and 30 minutes of listening until the file ends. Repeat at 1× and 1.5× using appropriately planned media lengths of 30 and 45 minutes. Test iPhone Safari separately rather than treating it as a substitute for the installed PWA.

**Acceptance:** No background change to another `src`; the final file ends naturally; the player safely restores the original book position. Measure compilation time and working memory to the extent supported by available tools. Media preparation must not block the UI.

**Codec gate:** Check for corruption at MP3/M4A cut points, invalid headers in subsequent chapters, and incorrect VBR seek duration. If one adapter produces invalid output, fix it or explicitly restrict that variant's support temporarily. Do not silently enable transcoding of a 20-hour book.

**Deliverable:** A short entry in `docs/testing.md` recording the actual iPhone model, iOS version, browser, media parameters, and measurements.

## 3. Phase B — Project Foundation and Offline Shell

Create the Vite React TypeScript application, hash routes, shared error boundary, theme management, and externalized English strings. Add the PWA manifest, application icons, precaching of every asset required offline, and an update prompt.

Configure the GitHub Pages subdirectory and HTTPS. Fonts, icons, Worker scripts, and WASM must be local application assets in the build, not runtime CDN dependencies.

**Acceptance:** After the first complete load, the PWA opens in airplane mode. Direct navigation to a deep hash route works. A new deployment does not reload the application while audio is playing. Applying an update preserves library data and progress in the database.

## 4. Phase C — Data and Import

Implement Dexie schemas and migrations, the OPFS adapter, storage estimate/persistence states, a staging journal, and startup recovery. Use Workers, locks, and bounded buffers for file writing. Allow only one large media-processing job at a time.

Build local book import, natural filename sorting, chapter reordering and renaming, cover generation/processing, and book editing. Keep audio files immutable; changing a title must not copy media.

Implement book revisions. Changing chapter order invalidates sessions that depend on the old order; source-file IDs and safely remappable listening positions should remain intact. Editing a book that is currently playing requires an explicit pause and session-rebuild flow.

**Acceptance:** A 13–20-hour MP3 can be imported without loading the entire decoded audio into RAM. Failed imports do not appear as ready books. `QuotaExceededError` does not corrupt existing books. Canceled jobs leave staging data that can be safely cleaned up. Generated 30-minute parts do not have to physically duplicate the original.

## 5. Phase D — SessionPlanner and SessionCompiler

Implement `SessionPlanner` and cover it with unit tests before connecting audio playback. Inputs: book revision, original position, session mode, playback speed, and chapter target. Outputs: source intervals, media duration, expected stop reason, and source map.

Move the compiler into a Worker. Start with AAC/M4A and MP3, then PCM WAV. Use small-packet reading, backpressure, container finalization, and a separate cancellation signal. The high-level `Conversion` API is not proof of automatic copy-only processing.

Provide preparation phases: analyzing, reading, writing, and finalizing. Progress must reflect actual completed work, not invented percentages. When a reliable time estimate is unavailable, show the current phase and an indeterminate progress indicator.

**Acceptance:** Test an interval within one chapter, an interval spanning chapters, three complete chapters, a partial final chapter, the entire remaining multi-file book without a timer, cancellation, insufficient space, 1.5× duration calculations, packet-boundary duration accuracy, and unchanged source files.

**Performance target:** Preparing a typical 30-minute session from an already imported compressed audiobook should not feel burdensome. A target of a few seconds must be measured on a real phone and documented; it is not a universal SLA promised in advance. Set a bounded working-buffer budget and do not load multiple full decoders or whole files into memory simultaneously.

## 6. Phase E — AudioController and Session Lifecycle

Keep one audio element above the route tree. Use one typed controller shared by the mini-player and full player. States: idle → preparing → ready → playing ↔ paused → ended, with separate interrupted, error, and rebuilding branches.

Implement −30/+15 seconds of original content, speed control, chapter navigation, Media Session integration, and progress mapping. If the `play()` promise rejects, show an explicit Play action requiring a user gesture.

The timer ends because the file ends: a JavaScript `setTimeout` must not be the actual stopping mechanism. The UI countdown is a representation of the real media position. Changes to speed or position that affect the remaining listening duration follow the replanning contract in the architecture.

Keep progress confirmation and cleanup separate. First reconcile the live audio element's state, then delete obsolete files. Apply the five-second rewind only once after a confirmed duration-based stop. Never mark a session fully heard based solely on `Date.now()`.

**Acceptance:** Moving between Library and Player does not interrupt audio. Pause/resume does not unnecessarily recompile a file. Timed stops and chapter-end stops resume differently. The book's final chapter completes cleanly. After iOS terminates the process, the application restores the last confirmed position.

## 7. Phase F — Cloudflare Signaling and Direct Transfer

Create a Worker and SQLite-backed `PairRoom` Durable Object on Cloudflare Free. Do not use R2, a file proxy, or TURN. Use Cloudflare's documented public STUN address. Apply strict schemas, limits, and roles to WSS messages.

Implement QR display on the sender, scanning within the installed PWA's Receive screen, and confirmation with a short code. Do not request microphone access; camera permission is required only for scanning. Stop the camera immediately after a successful scan or when the scanner closes.

Implement a small-message transfer format, receiver ACK/credit flow, progress, cancellation, and hash verification. `bufferedAmount` must not grow without bounds. Staging data becomes a book only after commit. Close the signaling room when it is no longer needed; never send the book itself through the Durable Object.

**Acceptance:** Transfer at least 500 MB from a computer into the installed iPhone PWA, covering both single-file and multi-file books and writing directly into OPFS. Disable internet access after transfer and play the book. Cancellation and disconnection must not corrupt the library or unnecessarily discard verified files. A failed guest-Wi-Fi connection must be explained as a connectivity problem, not an unsupported book format.

**Signaling security tests:** Reject a third participant, expired tokens, untrusted Origins, oversized messages, invalid offsets, and invalid file paths. Rate-limit attempts at the six-digit confirmation code. Logs must not contain tokens or book content.

## 8. Phase G — Design Integration

Import Claude Design outputs as tokens, SVG assets, component contracts, and screen specifications. Do not rebuild the same component separately on each page. Build the component catalog first, then screens, then workflow states.

Actual application states drive the UI. Fake upload/success timers from the design prototype must not reach production. Centralize animation presets; do not mix Motion with another full animation library without a specific need.

**Acceptance:** Every main scene has mobile/desktop and light/dark variants. All functionality is available without hover. Reduced motion removes substantial bounce, not functionality. Dialog opening and closing manage focus correctly. Long English titles, typographic punctuation, time displays, and larger text settings render without replacement glyphs, truncation errors, or broken layouts. Keep strings externalized for future localization, but all V1 content and deliverables remain English.

## 9. Phase H — Backups, Documentation, and Release

Add optional `.loudbook.zip` export/import through zip.js, avoiding additional compression for already compressed audio. This is a backup/fallback path, not a mandatory step in the primary transfer flow. Validate ZIP manifests and protect against path traversal, excessive extracted sizes, and mismatched hashes.

Prepare a README covering local setup, GitHub Pages base/scope, signaling Worker deployment, installing on iPhone before import, privacy, the meaning of storage persistence, supported format variants, and actual test results. Retain third-party licenses and notices.

CI pipeline: type checking → lint → unit tests → build → component/accessibility tests → browser integration tests → Pages deployment. Keep the Cloudflare API token in an Actions secret, never in a Vite environment variable. `VITE_SIGNALING_URL` is a public endpoint and may be included in the bundle; an API secret may not. Deploy the production Worker through a separate workflow.

## 10. Test Matrix

| Area | Required cases |
|---|---|
| Files | One 13–20-hour MP3; 20 chapters; M4A/AAC; PCM WAV; VBR MP3; corrupt file |
| Timer | 5/15/30/custom; current/next/following chapter end; insufficient remaining chapters; book end |
| Speed | 0.75/1/1.25/1.5/custom; changes within an already prepared session |
| Position | −30/+15 at the beginning and end; crossing a chapter boundary; seeking beyond a session; five-second rewind applied only once |
| Lifecycle | Pause, hidden/visible app, lock/unlock, normal close, forced process termination |
| Offline | Cold PWA launch in airplane mode; availability of every required JS/Worker/WASM asset |
| Insufficient storage | At import start and mid-import; compiler finalization; receiver commit; recovery after failure |
| Transfer | 500 MB+; multiple files; denied camera access; incorrect code; disconnection; retry; duplicate; hash mismatch |
| Origin/storage context | Receipt into the standalone PWA, not accidentally into Safari; installation guidance before the first import |
| Service Worker update | New version while playing; update after pause; Dexie migration without losing books |
| UI | 320/390/430/768/1440 px; dark/light; long English text; larger text settings; keyboard; screen reader; reduced motion |
| Security | Token TTL, roles, two-participant limit, Origin checks, message-size limits, ZIP traversal, escaped text |

Every test record must identify the device, OS, browser/PWA mode, codec parameters, file size, steps, result, and measurements. “Works in Safari” is not a sufficient test report.

## 11. V1 Definition of Done

A person creates a book on a computer, scans the computer's QR code from the installed iPhone PWA, confirms the code, and receives the book directly into the library. In airplane mode, they select 30 minutes, receive one prepared session file, start playback, and lock the screen; the recording stops because it ends. Following confirmed completion, the next Play follows the five-second rewind or next-chapter rule. The primary experience uses the design system's components, states, and animations throughout.

V1 is not complete if it is only a polished prototype, works only online, plays only while Safari remains unlocked, or merely simulates WebRTC. Conversely, V1 does not require a native wrapper, support for every audio format, or an internet file relay.
