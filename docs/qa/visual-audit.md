# Visual, motion and cross-browser audit (LB-11)

Branch `lb-11-audit`, 2026-11-06. Design source: `design/Loud Books App.dc.html` (rendered by `Screens.dc.html` / `Prototype.dc.html`), `design/Component Library.dc.html`, `design/handoff/motion-spec.md`, `state-matrix.md`.
Images live in `.qa/` (gitignored). Verdicts below come from looking at the side-by-side images plus a numeric text-geometry diff, not from pixel counts.

## How it was checked

| Tool | What it does | Where |
|---|---|---|
| `apps/web/e2e/tools/screens.mjs` | Renders each design preset next to our route seeded with the same fixture books (`seed.ts`) and stitches design \| ours. 76 cases: welcome, library states, add/edit, details, player states, speed/timer/chapter sheets, send, receive, settings, dialogs, break-UI. Modes: images (default), `--textdiff`, `--axe`. | `.qa/lb11/final/<engine>/<case>-<width>-<theme>-<engine>.png` |
| `--textdiff` | Matches every visible text run between the design and our page by its text and prints dx/dy/dw/dh in px. Found the font, spacing and copy gaps that eyeballing missed. | `.qa/lb11/textdiff-*.log` |
| `--axe` | axe-core WCAG 2.x A/AA on every state (cover art excluded: 1.4.3 exception). | `.qa/lb11/axe-chromium*.log` |
| `apps/web/e2e/tools/frames.mjs` | Real interactions with a requestAnimationFrame trace, long-task observer and a style mutation observer that lists every inline CSS property Motion animates. | section "Motion" |
| Real Safari | Safari 26.6.2 on this Mac, production build (see "Real Safari"). | `.qa/lb11/safari/*.png` |

Design side of every picture is the design HTML served from `design/`. Its fonts come from Google Fonts with the `opsz` axis; ours are the self-hosted files (see fix 1).

Covered matrix: Chromium and WebKit (Playwright) at 390 and 1440 in light and dark for all 76 cases; 320, 430 and 768 in light and dark for the key screens (welcome, library, empty library, details, player, settings, add, send, receive, timer sheet, delete dialog); numeric text diff at 390 and 1440 for all cases and at 1024/1280 for player, details and library. Break-UI cases (very long title, one-letter title, 20 h book, 40 parts, long chapter title) at the same widths.

## Fixes made

| # | Gap found | Fix | Files |
|---|---|---|---|
| 1 | Display headings 3 % wider than the design, Receive/connecting titles and long details titles wrapped differently. Our bundled Bricolage Grotesque had no `opsz` axis; the design uses `opsz,wght`. | Replaced both subsets with the `opsz` 12..96 + `wght` 500..800 variable files from Google Fonts. | `apps/web/public/fonts/BricolageGrotesque-latin*.woff2` |
| 2 | `--lb-dock` was referenced but never set. The toast sat on top of the mini-player and the last row of every page (Settings "Delete library…") was hidden behind it. | `PlayerDock` sets `data-dock` on `<html>` while the phone mini-player shows; CSS turns that into `--lb-dock: 76px`. | `features/playback/PlayerDock.tsx`, `dock.css` |
| 3 | Dock cover vanished (opacity 0, stuck transform) on Library and on the details page of the playing book: two live members of one `layoutId` hide each other. Reproduced in real Safari. | The dock cover drops its `layoutId` on `/` and on that book's details page. | `components/player/Bars.tsx`, `PlayerDock.tsx` |
| 4 | Receive column ran the full 1120 px at desktop (design: 464 px). `.lb-screen`'s later `max-width` beat `.lb-receive`. | `.lb-screen.lb-receive`. | `features/transfer/transfer.css` |
| 5 | Player page animated twice (Shell and page both applied the `page` preset). | Page root is a plain div. | `pages/player/PlayerPage.tsx` |
| 6 | Real `/player` route narrower than its column (auto margins in a flex column). | `width: 100%`. | `pages/player/player.css` |
| 7 | Tablet widths (768 to 1099): two player columns left 100 to 250 px for the controls; Chapters label clipped (the design breaks the same way at 768). | Single column below 1100 px. | `pages/player/player.css` |
| 8 | Install sheet steps lacked the bold button names. | `emph()` helper (shared with Send/Receive), keys `install.share/addHome/add/appName`. | `components/emph.tsx`, `ui/Navigation.tsx`, `locales/en.json` |
| 9 | Progress panels without buttons (send connecting/verifying, receive verifying) were 18 px short at the bottom. | Empty actions row, as in the design. | `components/ui/Feedback.tsx` |
| 10 | Send code step: 17 px between input and button (design 11). | Own 10 px column. | `features/transfer/SendDialog.tsx` |
| 11 | Add book with no files: empty list added a 12 px flex gap. | `.lb-edit-list:empty { display: none }`. | `styles/components.css` |
| 12 | Settings rows: title/body gap 6 where the design uses 3 (offline row), 8 (update row, standard-storage card with action). | `StatusRow gap`. | `components/ui/Feedback.tsx`, `pages/settings/SettingsPage.tsx` |
| 13 | Speed sheet help lacked "Current speed: 1×"; timer summary used the speed-sheet sentence; custom row sub read "Listen for about 45 minutes"; chapter summaries 2 and 3 had no sub line. | Design copy as keys `speed.current`, `timer.coversPlain`, `timer.coversSpeed`, `timer.minutesSub`; `TimerSheet` takes `chapterLeftSec`. | `components/player/Sheets.tsx`, `features/playback/PlayerSheets.tsx`, `locales/en.json` |
| 14 | Paste field had no placeholder (design shows one). "Adds 1 parts". | `receive.pastePlaceholder`; ICU plural in `form.partsOn`. | `locales/en.json`, `pages/receive/ReceivePage.tsx` |
| 15 | A8 "library couldn't be opened" replaced the whole shell; the design keeps the desktop sidebar. | `ErrorFallback embedded` inside the Shell's `<main>`. | `app/Shell.tsx`, `app/ErrorFallback.tsx` |
| 16 | "This book is playing now" notes showed for a book that was only loaded (paused after a reload). | `isBookPlaying` (playing/preparing/rebuilding). | `features/playback/controller.ts`, `api.ts`, BookActions, Settings, BookForm |
| 17 | Settings version read 0.0.0 (design 1.0.0). | `apps/web/package.json` version 1.0.0. | `apps/web/package.json` |
| 18 | Generated cover split a 7-letter word mid-word ("Browse/r test", seen in real Safari). | Title size also fits the longest word; unchanged for every design title. | `components/books/cover.ts`, `BookCover.tsx` |
| 19 | New book's first chapter number was muted (design: accent). | `ChapterRow next`. | `components/books/Chapters.tsx`, `DetailsPage.tsx` |
| 20 | axe serious `aria-hidden-focus`: Radix hides the page behind a modal but its buttons stay focusable. | `inert` on `.lb-app` while a modal is open. | `components/ui/Overlays.tsx` |
| 21 | axe serious `color-contrast`: white text on the dark theme's light-green "New" badge (1.9:1). | `--lb-on-success` token (white light, `#1C1512` dark). | `styles/tokens.css`, `components.css` |
| 22 | Motion gaps (see checklist): Settings rows, storage estimate, update row, files summary, import/quota panel, library search/actions/grid/empty/single note, card reflow when a card leaves. | `Swap` (new) and `Reveal`; cards `layout="position"` with `popLayout`. | see checklist |
| 23 | No press feedback on sidebar items, chapter rows, action-list rows, mini-player and player bar. | `:active` background or `scale(.98)` (opacity under reduced motion). | `styles/components.css` |
| 24 | Harness could not import without a file picker (real Safari via AppleScript). | `window.__lbImportUrls(urls)` in the harness (only exists in builds with `VITE_DATA_HARNESS=1`). | `e2e/ImportHarness.tsx` |

## Parity table

Legend: **match** = no difference besides the accepted ones; **fixed** = differed before this audit, matches now; **tool** = difference comes from how the screenshot tool sets up the state (not the app); **dev** = accepted deviation, see below. "Eng." is Chromium / WebKit; both engines were rendered for every row at 390 light and 1440 dark, and for the key rows at 320, 430, 768 (both themes).

| Screen / state | Verdict | Notes |
|---|---|---|
| welcome, sheet-install | match (fixed: install bold, heading font) | |
| library: empty, empty (Safari note), one, many, missing, new, no-results, offline, update | match (fixed: toast over dock, heading font, dock offset) | offline/update: design shows "playing"; tool does not start playback. library-playing covers the real playing state. |
| library: playing (mini-player, continue card) | match | fixture route + real `/` |
| data-unavailable (A8) | fixed (sidebar kept) | |
| add: empty, multi, single, errors, discard | match (fixed: empty-list gap, "1 parts") | focus ring on Title is real (I2) |
| add: reorder | tool | drag captured under reduced motion; real drag checked by hand and in `library-flow` |
| edit | dev | no dropzone/Remove/parts switch (LB-4 API) |
| details: default, long, single, completed, new | match (fixed: title wrap, first-chapter number, toast) | |
| menu sheet, delete dialog, delete (playing) | match | playing note only when audio is playing |
| settings, settings-standard, settings-update | match (fixed: row gaps, version) | extra "Export library" is LB-10 |
| clear / delete-library dialogs | match | |
| player: preparing, gesture, playing, paused, speed, chapter-timer, no-timer, rebuilding, ended-timer, ended-chapter, completed, interrupted, error | match (fixed: width, double animation) | preparing/rebuilding show a Cancel link (state matrix P1) |
| sheets: speed, speed custom, timer, timer custom, chapters | match (fixed: copy) | |
| send: qr, code, wrong, connecting, sending, verifying, done, failed, signaling | match (fixed: gaps) | real QR |
| receive: intro, permission, denied, scanning, expired, paste, paste error, code, connecting, receiving, verifying, success, disconnected, storage, duplicate, signaling, safari | match (fixed: column width, placeholder) | "Paste pairing link instead" follows `ui-strings.en.json`, the design preset says "Paste link instead" |
| backup panels (export/import progress, duplicate, error), per-book menu | match | no design preset; built from the Status Panel and Dialog; checked in `.qa/backup` and `.qa/lb11` at 390 and 1440 |
| break-UI: long title, one letter, 20 h, 40 parts, long chapter | match | titles clamp, no overflow at 320; mid-word cover break fixed |

## Accepted deviations

- Generated cover art instead of the design's hand-picked art (real library data has no art).
- Real QR code; real storage figures; version string from `package.json`.
- Design phone mock's status bar and its safe-area gap: our dock sits about 28 px lower in the 390 captures (the app pads with `env(safe-area-inset-bottom)`).
- Mini-player subtitle "30-minute session" after a reload (no session file yet) instead of the design's "Paused · 28:14 left".
- Session preparation shows a Cancel link (state matrix P1); the design frame omits it.
- Settings has "Export library" next to "Import a backup" (owner decision: whole-library export).
- Edit mode has no add/remove files or parts switch.
- Prototype-only controls ("simulate Don't allow", "tap to simulate a scan") are not built.
- Receive "Paste pairing link instead" copy from the strings file.
- Details description "Show more" swaps the clamp instantly (line-clamp cannot animate with transform/opacity).

## Motion checklist

Presets from `src/motion/presets.ts` (copy of `design/design-system/motion.ts`); `usePreset()` strips transforms under `prefers-reduced-motion`. Enter ease-out, exit shorter, no ease-in anywhere (`grep ease-in` finds only a comment), no `transition: all`, no animated width/height/top/left/margin in CSS or Motion.

| Conditionally rendered element | Enter / exit |
|---|---|
| Route pages | Shell `AnimatePresence popLayout`, `page` preset, 120 ms fade exit |
| Sheets, dialogs, alert dialogs, install sheet | `Stage` spring or tween in, faster out, scrim fade 200/140 ms |
| Dropdown / action menus | `menu` preset |
| Toast | `toast` preset, `AnimatePresence popLayout` |
| Mini-player, player bar | rise 40 px with overshoot, exit 200 ms drawer curve; bar uses `page` |
| Library: update banner, Continue card, add/receive actions, search, grid group, no-results, single-book note, empty state | `Reveal` (fade + 6 px, exit 120 ms) |
| Library cards | exit fade 150 ms in `AnimatePresence popLayout`, neighbours slide with `layout="position"`, new card `success` pop, New badge pop and fade |
| Details: cover pop for a new book, single-file note | `success`, `Reveal` |
| Add/edit: field errors, file error, files summary, edit-playing note, parts switch | `Reveal` |
| Add/edit: chapter rows | `AnimatePresence`, `reveal` (no animation for keyboard moves/removals) |
| Add/edit: importing and quota panels | `Swap` |
| Player: session badge, preparing/ready card, transport vs outcome panel, Cancel link, custom speed/timer fields, field errors | `AnimatePresence`/`Reveal`, popLayout |
| Play/pause glyph | cross-fade with scale .6 to 1 (`Playback.tsx`) |
| Send/Receive step switches, scanner/paste, panels | `AnimatePresence mode="wait"` with `reveal` |
| Backup panels | `AnimatePresence mode="wait"` |
| Settings: protected/standard storage card, offline-ready row, update row, storage estimate | `Swap` / `Reveal` |
| Press feedback | Buttons, icon buttons, cards, play buttons, tools, badges: Motion `whileTap`; rows and bars: CSS `:active` |
| Hover | card lift only for `pointerType === 'mouse'`; CSS hover under `(hover:hover) and (pointer:fine)` |
| Reduced motion | opacity-only presets, press becomes opacity .7 |

Left without animation on purpose: details "Show more" (see above); badges "Finished"/"Missing" on Details (state is known at first paint); the disabled/enabled colour of buttons (colour transition only).

### Frame traces

FRAMES_TABLE

## Real Safari

REAL_SAFARI

## Accessibility

AXE_SECTION

## Remaining open items

OPEN_ITEMS

## Image index (all under `.qa/lb11/`, gitignored)

- `final/chromium/`, `final/webkit/`: `<case>-<width>-<theme>-<engine>.png`, design left, ours right.
- `chromium/`: first sweep before the fixes (390 light, 1440 dark).
- `mid/`: 768, 1024, 1280 for player, details, library.
- `safari/`: real Safari captures (`library`, `details`, `player`, `settings`, `receive`, `offline-*`, widths 1280 and 560, dark and light).
- `*.log`: axe and text-diff output.
- Earlier tasks: `.qa/screens`, `.qa/lb8`, `.qa/lb9`, `.qa/backup`.
