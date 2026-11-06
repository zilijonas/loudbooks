# Loud Books — design handoff

Direction **1a Paperback Pop**. English only (strings in `handoff/ui-strings.en.json`). Everything here is a design deliverable; nothing has been tested on a physical iPhone.

## What's in the package

| Folder / file | Contents |
|---|---|
| `brand/` | Logo SVGs (symbol, wordmark, compact lockup, light/dark/mono), app icons (192, 512, maskable 192/512, Apple 180, favicon SVG/16/32). **Brand Guidelines.dc.html** shows clear space, minimum sizes, misuse, colour, type, covers. |
| `design-system/` | `tokens.json`, `tokens.css`, `fonts.css`, `tailwind.theme.css` (Tailwind v4 `@theme`), `motion.ts` (Motion for React presets), `README.md` (type, spacing, grid, responsive, a11y). |
| `components/` | `README.md` inventory, `api.d.ts` proposed React/TS props. **Component Library.dc.html** is the visual catalogue (light/dark). |
| `screens/` | `README.md` index. **Screens.dc.html** renders every screen/state from fixtures: phone 390, 320, tablet 768, desktop 1440, light/dark. |
| `prototype/` | `README.md`. **Prototype.dc.html** is the connected prototype with the four scenarios and scenario controls. |
| `handoff/` | This README, screen map, component map, state matrix, motion spec, UI strings, domain mapping, implementation notes, open questions. |

The `.dc.html` files open directly in a browser. `Loud Books App.dc.html` is the single source the gallery and prototype load; its logic class holds the fixtures (`PRE`) and the simulated state machine.

## Simulated in the prototype (do not ship)

- **File picking / drag-and-drop**: "Choose audio files" inserts fixture files and fakes analysis (900 ms).
- **Import progress**: timer-driven. Production must report real bytes written to OPFS.
- **Session preparation**: fixed 1.65 s with three named phases. Production shows real phases from the Media Worker, indeterminate when no estimate exists.
- **Playback clock**: 1 s ticks while live; "+5 min" and "End session" skip ahead. No audio plays.
- **Autoplay rejection**: "Require tap to play" makes the next preparation end in "Ready — play".
- **Camera**: the viewfinder is a button; tapping it is a successful scan. "Don't allow" is a prototype-only link.
- **QR code**: a deterministic decorative pattern, not a scannable code.
- **Pairing, WebRTC, verification**: timers. Correct code is **482915**; anything else counts down tries.
- **Storage numbers, persistence grant, backup import/export, update restart, re-import**: toasts that start with "Prototype:".
- **Airplane mode**: a status-bar icon and copy change only.

## Not designed on purpose
Accounts, sign-in, pricing, ads, social features, cloud library, sync, language picker, volume fade, Bluetooth discovery.
