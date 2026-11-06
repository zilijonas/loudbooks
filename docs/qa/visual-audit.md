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

Covered matrix (what was actually rendered and looked at):

- Chromium and WebKit (Playwright), 390 and 1440, light and dark, every case of the tool (about 74 each; `final/<engine>/`). Three reviewers per sweep compared the pictures; I opened the ones they flagged and a sample of the rest myself.
- 320, 430 and 768, light and dark, both engines, for the key screens: welcome, library (empty, many), details, player (playing), settings, add, send (qr), receive (intro), timer sheet, delete dialog.
- Numeric text diff, Chromium, light: 390 and 1440 for every case (run before the last round of fixes, then re-run for the affected cases) and 320, 430 and 768 for every case (225 case-widths, after the fixes).
- 768, 1024 and 1280 pictures for player, details and library (`mid/`).
- Break-UI cases (very long title, one-letter title, 20 h book, 40 parts, long chapter title): 390 and 1440 in both engines (`final/<engine>/break-*`); the earlier 320 and 768 pictures are in `.qa/screens/` (LB-7).
- Not rendered through the tool: the playing state of Library and the delete-while-playing dialog (the dev fixture's fake assets clash with seeded books and seeded files are empty); they were checked in real Safari with imported audio and by `e2e/player.spec.ts`. Playwright WebKit cannot write the seeded session files to OPFS, so its Settings pictures show 0 MB temporary files and no Clear-temporary-files dialog; the Chromium and real-Safari Settings cover those.
- Firefox was not part of this task.

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
- Where the design breaks, ours is better on purpose: the player stays single column from 768 to 1099 px (design: controls squeezed into about 100 px) and the details page stays single column below 1024 (LB-7); the desktop player bar drops its duplicate "open player" icon and tightens at 768-1023 px (design: forward-15 hidden behind the speed chip, "30 min" wrapping).
- Placeholder text uses the muted text token (AA contrast); the design shows the browser's default light grey.
- Buttons never wrap (`white-space: nowrap`), so two long labels at 320 px (receive "Cancel and remove partial files", "Replace the one on this phone") stay on one line where the design wraps them.
- The "How to add to Home Screen" button wraps at 320 px like the design; the page is about 4 px taller there.

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

390 x 844, device scale 2, no reduced motion, headless engines on this Mac (M4). `max` is the longest rAF gap during the interaction and the following 900 ms; a 60 Hz frame is 16.7 ms. Reproduce: `apps/web/e2e/tools/with-servers.sh node e2e/tools/frames.mjs --browser chromium|webkit` through the memory queue.

| Interaction | Chromium frames / max | WebKit frames / max |
|---|---|---|
| library to details (shared cover) | 59 / 17 ms | 55 / 25 ms |
| details to library | 55 / 17 ms | 54 / 21 ms |
| open book menu sheet | 58 / 17 ms | 55 / 32 ms |
| close sheet (Escape) | 54 / 17 ms | 55 / 24 ms |
| open delete-library dialog | 58 / 17 ms | 54 / 37 ms |
| close dialog | 55 / 17 ms | 55 / 20 ms |
| dock to player (shared cover) | 56 / 17 ms | 55 / 22 ms |
| open / close speed sheet | 57 / 17, 55 / 17 ms | 53 / 18, 54 / 19 ms |
| open / close timer sheet | 57 / 17, 55 / 17 ms | 54 / 29, 55 / 18 ms |
| player to library (dock returns) | 55 / 17 ms | 54 / 17 ms |
| add book page (rows) | 55 / 17 ms | 55 / 19 ms |

No frame over 50 ms in either engine, no long task in Chromium (WebKit has no long-task API), and one WebKit frame between 34 and 50 ms (first dialog open). The style-mutation observer saw only `transform`, `opacity` and Motion's own bookkeeping. The `left` x2 on dock to player is `popLayout` pinning the exiting mini-player to its box (set once, not animated). Layout-animated properties found and removed in this audit: none were animating; the library cards now reflow with a `transform` (`layout="position"`) instead of jumping.

## Real Safari

Safari 26.6.2 on macOS 26.6.2 (Mac mini), production build with the data harness (`VITE_DATA_HARNESS=1 pnpm --filter web build`, `vite preview --port 4173`, both through the memory queue). Procedure per AGENTS.md: `with-display-awake`, a new window from AppleScript `make new document` (window id taken by diffing the window ids), only that id addressed, tab URL checked to start with `http://localhost:4173/` before every `do JavaScript`, `screencapture -l <id>`. The owner's windows were not touched (Safari had none open). The new window opened with Safari's Bookmarks sidebar, so the 1280 px window is a 1032 px viewport at first and 1280 px later; the 560 px window is a 328 px viewport (phone layout).

| Check | Result |
|---|---|
| Library, Details, Player, Settings, Receive at desktop and phone width, dark (system) and light (`loudbooks:theme`) | render correctly, fonts and layout as in WebKit/Chromium; Receive shows the Safari notice |
| Import real audio | The file picker cannot be driven from AppleScript without System Events, so the harness page got `window.__lbImportUrls`: the 3 Zeland MP3s were fetched from the same origin and imported through the real worker probe and OPFS import in Safari. SHA-256 read back from OPFS equals `shasum -a 256` of the sources. Book shows 3 chapters, 4 min |
| Real playback | Play from Details: session compiled to one file (249.7 s), `readyState` 4, `currentTime` advanced (5.9 s after 6 s), speaker icon in the tab, pause stops it; timer badge and counters correct |
| Service worker | registration scope `/loudbooks/`, `activated`, page controlled, `workbox-precache` cache holds 28 entries |
| Offline reload | preview server stopped, page reloaded: app shell loads from the worker, library lists the book, Resume plays it from OPFS (blob URL, `currentTime` advancing) with the server down |
| Re-check after fixes (new build) | dock cover visible on Details (`opacity` 1, no transform), cover title no longer splits mid-word, player single column at a 1050 px window with all three tool buttons whole |

Safari findings, all fixed: dock cover stuck at opacity 0 on Details (fix 3), "Browse/r test" cover split (fix 18), cramped player controls at ~1032 px viewport (fix 7). Not testable here: iOS standalone PWA and the lock screen (no device), Safari's Develop menu network toggle (the server was stopped instead). The AppleScript window id lingers in Safari's scripting list as an invisible zero-tab window after `close`; nothing is on screen.

Images: `.qa/lb11/safari/` (contains Safari chrome and the owner's Bookmarks sidebar in some frames, so do not publish them).

## Accessibility

axe-core 4.14 (WCAG 2.0/2.1 A and AA, cover art excluded) on every state of the tool, run with `screens.mjs --axe`.

| Run | Result |
|---|---|
| First sweep, Chromium, 390 and 1440, light and dark, all states | 0 critical; **serious**: `aria-hidden-focus` on 16 states (discard, delete, clear and delete-library dialogs) and `color-contrast` on the dark "New" badge (2 states) |
| After fixes 20 and 21: those states again at all four combinations plus Install sheet, menu sheet, send code, player, timer sheet, edit | 0 violations |
| After the fixes: all states, Chromium, 390 dark and 1440 light | 0 violations (80 + 80 states) |
| All states, WebKit, 390 and 1440 light | 0 violations (80 + 80; Settings states run separately, same result) |

Also by hand: Radix dialogs and menus, 44 px targets (`Button`, `IconButton`), visible focus ring, labelled reorder buttons, `aria-live` on status panels and timer summary (all from earlier tasks, unchanged). The component gallery axe spec (`gallery.spec.ts`) was not changed.

## Remaining open items

No open P0 or P1 difference. Not done, and why:

- iOS standalone PWA, lock-screen controls and the 500 MB iPhone acceptance (spec phase F): needs a device. Real Safari on the Mac stands in for Safari behaviour only.
- Backup progress, duplicate and error panels were not re-captured after the audit. They are `Dialog` + `StatusPanel`, which were checked in Send/Receive/Import; LB-10's pictures are in `.qa/backup/` (before fixes 9, 20 and 23). Their buttons keep the progress panels' layout unchanged.
- The Library playing state and the delete-while-playing dialog are not in the side-by-side tool (see matrix); Safari and `player.spec.ts` cover the behaviour. `isBookPlaying` was read and exercised through the player e2e, not photographed.
- Firefox: not in the scope of this task; the gallery axe spec and the e2e config still list it.
- Real Safari: Develop > Offline is not scriptable without System Events, so offline was tested by stopping the preview server. A user-gesture autoplay refusal was not provoked (the AppleScript click was accepted by Safari).
- In the dev tool the Send dialog calls the real pairing Worker and logs a CORS error from `127.0.0.1`; that is expected until LB-13 deploys it with the Pages origin allowed.
- The 28 px mini-player offset and the extra Cancel link are accepted above; nothing to fix.

## Image index (all under `.qa/lb11/`, gitignored)

- `final/chromium/`, `final/webkit/`: `<case>-<width>-<theme>-<engine>.png`, design left, ours right.
- `chromium/`: first sweep before the fixes (390 light, 1440 dark).
- `mid/`: 768, 1024, 1280 for player, details, library.
- `safari/`: real Safari captures (`library`, `details`, `player`, `settings`, `receive`, `offline-*`, widths 1280 and 560, dark and light).
- `*.log`: axe and text-diff output.
- Earlier tasks: `.qa/screens`, `.qa/lb8`, `.qa/lb9`, `.qa/backup`.
