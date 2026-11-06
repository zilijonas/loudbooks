# Loud Books

A personal audiobook player that runs in the browser and works offline. You import audio files you already own, they stay on your device, and you listen with the screen locked, in airplane mode, on a timer if you like.

Live app: https://zilijonas.github.io/loudbooks/

It is a free, open-source PWA. No accounts, no analytics, no cloud library. The only server is a tiny pairing service used when you copy a book from one device to another.

## How it works

**Books stay on the device.** Audio goes into the browser's private file storage (OPFS). Titles, chapters and listening progress go into IndexedDB. Nothing is uploaded.

**One prepared file per listen.** A locked phone plays reliably when it has a single local file to play. So when you press Play, Loud Books cuts the part you are about to hear (say 30 minutes at 1.5x, which is 45 minutes of audio) out of your book and writes it as one session file. The audio is copied packet by packet, never decoded or re-encoded. The session ends because the file ends, not because a JavaScript timer fired in the background. There is no fade-out.

**Moving a book between devices.** On your computer open a book and choose Send. It shows a QR code. On your phone, open Loud Books from the Home Screen, choose Receive and scan the code with the in-app scanner. The phone shows a 6-digit code, you type it on the computer (three tries), and the book copies straight across over WebRTC. A small Cloudflare Worker (https://loudbooks-signaling.lijonas-it.workers.dev) only introduces the two devices to each other. The book itself never touches it. Both devices need internet for the introduction and usually need to be on the same regular Wi-Fi. Guest and office networks often block the direct connection. See [docs/transfer-protocol.md](docs/transfer-protocol.md) and [docs/privacy.md](docs/privacy.md).

## Install on iPhone before you import anything

Safari and the Home Screen app are separate. Each has its own storage, and a book imported in Safari will not show up in the installed app.

1. Open https://zilijonas.github.io/loudbooks/ in Safari.
2. Share, then Add to Home Screen.
3. Open Loud Books from the Home Screen icon. From here on, always use that icon.
4. Import or receive your books there.

Scan transfer QR codes with the scanner inside Loud Books, not the system Camera app. The Camera app opens Safari, which is the wrong storage. If the camera is blocked you can paste the pairing link instead.

It also runs in desktop browsers and on Android. If you move to a different address later, the library does not come along. Export a backup first.

## Supported audio

| Format | What is accepted |
|---|---|
| MP3 | CBR and VBR |
| M4A / M4B | AAC-LC only |
| WAV | PCM only |

- All files in one book must share the same codec, sample rate and channel count. A book with mixed codecs is refused with a clear error rather than silently converted.
- DRM-protected files (for example Audible AAX/AA and most store-bought M4B) are not supported.
- Not supported yet: FLAC, OGG, Opus, ADTS `.aac`, anything else. A browser may play some of these, but Loud Books can't cut a session from them, so they're rejected.
- Nothing is ever transcoded.

A single file stays one book. You can switch on generated 30-minute parts for it. They are logical chapters over the same file, so no audio is duplicated.

## Storage and "Protected from automatic cleanup"

Settings shows how much space your books, covers, temporary sessions and the continuous-book cache use. These are browser estimates, not exact figures.

The browser decides whether to grant persistent storage. When it does, Settings says **Protected from automatic cleanup**. When it doesn't, it says **Standard storage**, and the browser may clear the data if the device runs low on space. Even when protected, you can still wipe everything by clearing website data, and a device failure takes the library with it. Protection is not a backup.

Clear temporary files never touches books. Delete library asks for its own confirmation.

## Backups

Export one book or the whole library from the app. You get a `.loudbook.zip` containing the audio, cover, chapters and metadata. Import checks every file's size and SHA-256 and refuses malformed archives. Keep these somewhere you control. They are not encrypted.

## Privacy

No accounts, no analytics, no tracking, no book data on any server. The pairing Worker sees room IDs and short-lived connection details for about five minutes and nothing else. The camera is used only to read a QR code. Full details are in [docs/privacy.md](docs/privacy.md).

## Local development

Needs Node 24 (see `.nvmrc`) and pnpm 11.

```sh
pnpm install
pnpm --filter web dev        # app at http://localhost:5173/loudbooks/
pnpm --filter web preview    # built PWA, served under /loudbooks/
pnpm typecheck
pnpm lint
pnpm test                    # Vitest, all packages
pnpm build
pnpm --filter web exec playwright install   # once, for browsers
pnpm e2e                     # Playwright
```

To run the pairing Worker locally use `pnpm --filter signaling dev`, then start the web app with `VITE_SIGNALING_URL` pointing at it (Wrangler serves on port 8787 by default). The Worker's `ALLOWED_ORIGINS` already includes `localhost:5173` and `localhost:4173`.

The compiler browser suite and the audio fixtures need extra setup. See [fixtures/README.md](fixtures/README.md) and [docs/testing.md](docs/testing.md).

## Deployment

**App (GitHub Pages).** The `Deploy Pages` workflow builds `apps/web` and publishes it on every push to `main`, and can be run by hand. Set the repository variable `VITE_SIGNALING_URL` (Settings, Secrets and variables, Actions, Variables) to the Worker's URL. It is a public address, not a secret. The site is built for the `/loudbooks/` path with hash routing, so renaming the repository means changing `base` in `apps/web/vite.config.ts`.

**Pairing Worker (Cloudflare).** Either deploy from your machine:

```sh
pnpm --filter signaling exec wrangler deploy
```

or run the manual `Deploy signaling Worker` workflow, which needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` and skips itself when the token is missing. The Worker is a SQLite-backed Durable Object and fits the Cloudflare free plan for one person's use. If you host the app on a different origin, add it to `ALLOWED_ORIGINS` in `apps/signaling/wrangler.jsonc`. The API token lives only in Actions secrets, never in a Vite variable.

Pull requests run typecheck, lint, unit tests, build and the Chromium end-to-end suite (`Checks` workflow).

## Repository layout

```text
apps/web/           React + TypeScript + Vite app (the PWA)
apps/signaling/     Cloudflare Worker and PairRoom Durable Object
packages/contracts/ Zod schemas shared by both: pairing messages, transfer manifest
docs/               architecture and plan (spec/), decisions, privacy, testing, transfer protocol
fixtures/           audio test fixtures: generators and a small committed set
design/             design system and handoff the UI is built from
.github/workflows/  checks, Pages deploy, Worker deploy
```

## Tests and current status

Unit tests, the browser suites and the session compiler measurements on Chromium, WebKit and Firefox are recorded in [docs/testing.md](docs/testing.md).

**Not done yet: physical-iPhone tests.** Nobody has yet run the installed PWA on a real iPhone through the full flow: airplane mode, locked screen, a 30-minute session at 1x and at 1.5x playing until the file ends. Phone compile times and a 500 MB transfer into the iPhone app are also unmeasured. Desktop WebKit is not Safari on iOS, so treat lock-screen behaviour as unverified until those records exist.

## Third-party software and license

Loud Books is MIT licensed, see [LICENSE](LICENSE). Dependencies and fonts carry their own licenses (MIT, ISC, Apache-2.0, BSD-3-Clause, MPL-2.0 and SIL OFL 1.1). They are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Design decisions and the reasons behind them are in [docs/decisions.md](docs/decisions.md).
