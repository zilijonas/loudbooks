# Implementation notes

- **Tokens**: import `fonts.css`, `tokens.css`, `tailwind.theme.css`. Use semantic tokens only. Coral 500 is a fill; coral text uses `accent-text`.
- **Fonts**: self-host Bricolage Grotesque (variable 500–800) and Hanken Grotesk (variable 400–700) as WOFF2, precached. The prototype loads Google Fonts only for preview.
- **Logo**: wordmark SVGs use live text; convert to outlines before release.
- **Covers**: `GeneratedCover` hashes the trimmed, lower-cased title (FNV-1a) → 5 palettes × 3 layouts (`artOf` in Loud Books App.dc.html). Typography uses container query units (`cqw`), so one component works from 38 px to 380 px.
- **Mobile**: no tap highlight; inputs ≥ 16 px; `100dvh`; safe-area tokens; `overscroll-behavior: contain` on sheets and the main scroller; no body scroll lock.
- **Hover**: `can-hover` Tailwind variant; card lift checks `pointerType === "mouse"`.
- **Focus**: global `:focus-visible` ring (3 px `--lb-focus`, 2 px offset). Radix Dialog for trap and return.
- **Reorder**: dnd-kit sortable + keyboard sensor + labelled Up/Down buttons.
- **Mini-player** hidden on Add/Edit, Welcome and the Player; content gets bottom padding when shown.
- **Strings**: `ui-strings.en.json`, grouped by screen; `{name}` interpolation, ICU plurals.
- **Contrast** (light / dark): text 15.2 / 14.6:1, muted 6.1 / 8.6:1, ink on coral 6.3 / 7.4:1, accent text 5.1 / 7.3:1, input outline 3:1.
- **Break-UI cases in the gallery**: long titles, a 70-character chapter title, one-letter title, empty description, single-file and 20-hour books, 0/1/6 books, 320 px.
