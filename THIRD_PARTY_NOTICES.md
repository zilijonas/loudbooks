# Third-party notices

Loud Books itself is MIT licensed (see `LICENSE`). It ships with the open-source software and fonts below. They are not all MIT. Each keeps its own license, and each package carries its full license text in its own distribution.

Versions are the exact pins in `apps/web/package.json`, `apps/signaling/package.json` and `packages/contracts/package.json`. Licenses were read from the `license` field of each installed package.

## Web app (`apps/web`), production dependencies

| Package | Version | License |
|---|---|---|
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/sortable | 10.0.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| @radix-ui/react-alert-dialog | 1.2.1 | MIT |
| @radix-ui/react-dialog | 1.3.1 | MIT |
| @radix-ui/react-dropdown-menu | 2.2.1 | MIT |
| @radix-ui/react-slider | 1.6.1 | MIT |
| @radix-ui/react-switch | 1.4.1 | MIT |
| @radix-ui/react-tooltip | 1.4.1 | MIT |
| @zip.js/zip.js | 2.24.0 | BSD-3-Clause |
| comlink | 4.4.2 | Apache-2.0 |
| dexie | 4.4.7 | Apache-2.0 |
| dexie-react-hooks | 4.4.0 | Apache-2.0 |
| hash-wasm | 4.12.0 | MIT |
| lucide-react | 1.70.0 | ISC (some icons MIT, see below) |
| mediabunny | 1.65.2 | MPL-2.0 |
| motion | 14.10.0 | MIT |
| qr-scanner | 1.4.2 | MIT |
| qrcode | 1.5.4 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| react-hook-form | 7.91.0 | MIT |
| react-router | 7.18.5 | MIT |
| zod | 4.6.7 | MIT |
| zustand | 5.1.0 | MIT |

## Pairing Worker (`apps/signaling`), production dependencies

| Package | Version | License |
|---|---|---|
| @loudbooks/contracts | workspace (0.0.0) | MIT (this repository) |
| zod (through contracts) | 4.6.7 | MIT |

Wrangler, Vitest and the Cloudflare type packages are development tools. They are not part of the deployed Worker.

## Transitive dependencies

The web app also bundles packages pulled in by the ones above, such as `framer-motion`, `motion-dom` and `motion-utils` (through `motion`), the smaller `@radix-ui/*` primitives, `@floating-ui/*`, `react-remove-scroll`, `aria-hidden`, `@dnd-kit/accessibility`, `scheduler`, `cookie`, `set-cookie-parser` and `tslib`. Across the full production tree the licenses are MIT, ISC, Apache-2.0, BSD-3-Clause, MPL-2.0 and 0BSD. Of the bundled ones, all are MIT except `tslib` (0BSD). A few ISC packages (`yargs` and its helpers) come with `qrcode` as command-line tooling and are not expected in the browser bundle. To regenerate the complete list:

```sh
cd apps/web && pnpm licenses list --prod
```

## Notes on specific licenses

- **mediabunny (MPL-2.0).** Used unmodified as a library. Its source is at https://github.com/Vanilagy/mediabunny. MPL-2.0 covers changes to mediabunny's own files, not Loud Books code that calls it.
- **lucide-react (ISC).** Icons are from Lucide, Copyright (c) 2026 Lucide Icons and Contributors. A subset of Lucide icons derived from the Feather project are under the MIT License, Copyright (c) 2013-present Cole Bemis. Both texts are in `lucide-react/LICENSE`.
- **@zip.js/zip.js (BSD-3-Clause)** and **comlink, dexie, dexie-react-hooks (Apache-2.0)** are used unmodified.

## Fonts

Both fonts are bundled as local files in `apps/web/public/fonts/` (no CDN) and licensed under the SIL Open Font License 1.1. The full license texts sit beside the font files.

| Font | Copyright | License text |
|---|---|---|
| Bricolage Grotesque | Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage) | `apps/web/public/fonts/OFL-BricolageGrotesque.txt` |
| Hanken Grotesk | Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk) | `apps/web/public/fonts/OFL-HankenGrotesk.txt` |

## Artwork

The Loud Books logo, app icons and generated covers are original to this project.
