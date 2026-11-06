# Loud Books — agent rules (Claude Code and Codex)

This file is the single ruleset for every agent working in this repo. `CLAUDE.md` imports it; Codex reads it directly. Read it fully before your first edit.

## What we are building
Loud Books: a personal, offline-first audiobook PWA (React + TS + Vite), hosted on GitHub Pages at `https://zilijonas.github.io/loudbooks/` (Vite `base: '/loudbooks/'`, hash routing). Books live only on the device (OPFS audio + Dexie metadata). The only server is a Cloudflare Worker + SQLite-backed `PairRoom` Durable Object for WebRTC pairing (`apps/signaling`).

## Sources of truth (read before work, in this order)
1. `docs/spec/01-Architecture-EN.md` — architecture, data model, session planning/compiling, player, transfer, offline. Binding.
2. `docs/spec/02-Implementation-Plan-EN.md` — repo layout, phases, test matrix, V1 definition of done. Binding.
3. `design/` — Claude Design handoff, direction "1a Paperback Pop". Binding for every pixel:
   - `design/design-system/` tokens (`tokens.css`, `tailwind.theme.css`, `fonts.css`, `motion.ts`, `tokens.json`).
   - `design/components/api.d.ts` + `README.md` component contracts; `design/Component Library.dc.html` visual catalogue.
   - `design/handoff/*` (screen map, state matrix, motion spec, component map, implementation notes, `ui-strings.en.json`).
   - `design/Loud Books App.dc.html` is the single source the gallery/prototype render from: its markup, CSS and `artOf` cover generator are the reference implementation for visuals. `Screens.dc.html` / `Prototype.dc.html` load it. Open them in a browser (serve `design/` over http) to compare.
   - `design/brand/` logos and icons (use these files, do not redraw).
   - `design/CLAUDE.md` — design rules (motion, anti-slop). Binding.
4. Workbench board project **LB** — task scope, acceptance (`doneWhen`), status. Claim with `set_status doing`, attach evidence, set `review`.

Owner decisions on `design/handoff/open-questions.md` (lead-decided defaults, do not reopen): repo URL `https://github.com/zilijonas/loudbooks`, MIT license; continuous-book cache created automatically and listed as removable in Settings; duplicate on receive offers Keep both / Replace / Cancel; "Include listening position" defaults off; 30-minute generated parts default off; pairing code 6 digits, 3 tries; Receive works on desktop too; backups per-book export plus whole-library export.

## Repo layout
pnpm workspace exactly as plan §1: `apps/web`, `apps/signaling`, `packages/contracts`, `docs/`, `fixtures/`. Do not invent other top-level packages.

## Non-negotiable product rules
- Pixel parity with the design: same tokens, spacing, radii, type scale, shadows, copy (`ui-strings.en.json`), icons, cover art. Compare side by side with the design HTML at 390, 320, 768 and 1440 px in light and dark before calling UI done. Do not "improve" the design.
- Every element that appears or disappears animates in and out (Motion `AnimatePresence`, presets from `src/motion/presets.ts` copied from `design/design-system/motion.ts`). Exits faster than enters; never ease-in; never scale from 0; only transform/opacity (progress via scaleX). Reduced motion: opacity-only, never removes function. Keyboard-initiated actions do not animate.
- Must work in Safari (macOS + iOS 17+ standalone PWA), Chrome, Firefox, Edge. No APIs without a fallback/feature check (OPFS `createSyncAccessHandle` only in Workers; `showOpenFilePicker` is not available — use `<input type=file>`). Use `100dvh`, safe-area insets, `-webkit-` prefixes Tailwind/Lightning CSS add; test WebKit.
- Offline: every JS chunk, worker, WASM, font, SVG and icon is precached by `vite-plugin-pwa` (`registerType: 'prompt'`). No runtime CDN anything. Updates never reload during playback/import/transfer.
- Real states only: no fake timers, fake progress or "Prototype:" toasts in production code.
- Audio: one `HTMLAudioElement` above the router; sessions compiled to ONE file by the media worker (mediabunny encoded-packet pipeline, no full PCM decode); stop happens because the file ends.
- Accessibility: WCAG AA, 44 px targets, visible focus ring, Radix for dialogs/menus/sliders, labelled reorder buttons.
- Strings only via the i18n layer from `ui-strings.en.json`. No hard-coded copy.

## Skills to load (both Claude and Codex have them in `~/.agents/skills` / `~/.claude/skills`; project extras in `.claude/skills` + `.agents/skills`)
- UI/motion work: `emil-design-eng`, `impeccable`, `design-taste-frontend`, `unslop` (all four on every UI pass; if a skill is not offered by your skill tool, read its SKILL.md directly from `~/.agents/skills/<name>/SKILL.md`), plus `animate`, `review-animations`, `apple-design`, `break-ui`, `animation-performance` as needed.
- PWA/offline: `pwa-development`. Browser tests: `playwright-best-practices`. Cloudflare: `durable-objects`, `wrangler`, `workers-best-practices`.
- Coding style: `ponytail` (smallest complete change). Delivery: `session-delivery`.

## Commands
- `pnpm install` (lockfile committed; pin exact versions, no `^` drift in prod deps).
- `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` (Vitest), `pnpm --filter web build`, `pnpm --filter web e2e` (Playwright).
- `pnpm --filter web dev` / `preview` for local runs (preview serves the built PWA under `/loudbooks/`).

## Machine safety (24 GB Mac, shared with other agents) — mandatory
- Every build, full test suite, Playwright run, Storybook build, dev/preview server or any browser launch goes through the shared queue:
  `~/ai/bin/memory-queue run --owner <your-session-or-task-id> --label 'loudbooks <what>' --need-gb 3 --restartable --wait 1800 -- <command>`
  (browser-only launch: `--need-gb 1`). Exit 75 = deferred, retry later; do light work meanwhile.
- One heavy job at a time machine-wide. Playwright `--workers=1`, one browser engine per run; Vitest `--maxWorkers=1 --no-file-parallelism` for full suites. Single small targeted unit tests are exempt.
- Close browser contexts/pages in `finally`. Kill only processes you started (exact PID). Stop dev servers when done.

## Git
- Work on your task branch/worktree as instructed by the lead; small focused commits with clear messages. Never push, never force; the lead pushes once per batch.
- Never commit audio from `audio_samples/` or downloaded books. Small generated fixtures go under `fixtures/small/` only if under 200 KB; otherwise commit the generator script.
- Never commit secrets. Cloudflare API tokens live only in GitHub Actions secrets.

## Done means
Typecheck + lint + relevant tests pass, behaviour verified in a real browser (WebKit included for UI/audio), screenshots compared with the design for UI, evidence attached to the LB task. If blocked, set the LB task `blocked` with the exact question; do not guess around spec rules.

## Known gotchas (from earlier design-parity projects on this machine)
- Visual parity is proven only by looking at side-by-side screenshots (design | ours) at each width and theme; pixel-diff numbers alone are not evidence. Build a small compare script (Playwright: screenshot design/*.dc.html preset and our route, stitch side by side) and reuse it.
- Tailwind preflight sets `line-height: 1.5`; the design uses its own line-heights — set base values from tokens, check text metrics.
- Load the exact font weights the design uses, or the browser synthesises bold and glyph widths differ.
- Tailwind v4 shadow utilities inline the @theme value, so dark-mode overrides need a CSS-variable indirection.
- Radix Collapsible/Accordion zero `transition-duration` inline while measuring: animate a child. Radix Tabs focus() on mousedown shows a focus ring in Chromium: pre-focus with `{focusVisible:false}`.
- Motion exits hang under jsdom without WAAPI; mock `motion` or test exits in Playwright.
- Playwright WebKit is not Safari. Real Safari checks: `~/ai/bin/with-display-awake`, create a new window via AppleScript `make new document`, remember its `window id`, address only that id, check the tab URL is localhost before injecting JS, capture only that window with `screencapture -l <id>`. Never use `front window`, `current tab` or System Events keystrokes; the owner's own Safari windows must stay untouched.

## Test policy (owner rule)
Write only tests that catch real failures: domain logic (session planning, progress/resume rules, import commit/recovery, quota), codec/compiler output validity, transfer protocol + signaling security, and a few end-to-end user flows (import, play, timer stop, offline launch, transfer). No tests of CSS, class names, static copy, snapshots, prop pass-through, or "component renders". One owning layer per behaviour; no duplicate matrices across layers. Visual parity is checked by screenshots, not by tests.
