# Design system

Files: `tokens.json` (source), `tokens.css`, `fonts.css`, `tailwind.theme.css` (Tailwind v4), `motion.ts`.

## Typography
Bricolage Grotesque for display and covers; Hanken Grotesk for UI and body. rem-based (follows iOS Larger Text). Times use tabular numerals.

| Token | Size/line | Weight |
|---|---|---|
| display-xl | 44/1.05 | 800 |
| display-l | 34/1.1 | 800 |
| title-l | 26/1.15 | 700 |
| title-m | 20/1.25 | 700 |
| body-l | 17/1.5 | 400 |
| body-m | 15/1.5 | 400 |
| label-l | 16/1.2 | 600 |
| label-m | 14/1.2 | 600 |
| caption | 12/1.3 | 500 |
| time-xl | 48/1 | 700 |

## Spacing, radius, layers
4 px base (4–80). Radius xs 8 · sm 12 · md 16 · cover 18 · lg 20 · xl 28 · 2xl 36 · pill. z: sticky 10, mini-player 30, sheet 40, dialog 50, toast 60. Warm-tinted shadows.

## Targets & icons
44 minimum, 48 default, 56 mini Play, 84 full Play. Lucide 2 px stroke at 16/20/24/32.

## Responsive
| Width | Layout |
|---|---|
| 320 | One column, 20 px gutters, 2-col card grid (min 140) |
| 390 | Primary; safe areas 47 top / 34 bottom |
| 430 | 3-col grid when it fits |
| 768 | Sidebar 248 + content; sheets → dialogs; player bar |
| 1440 | Content max 1120; grid min 168; two-column player |

## Accessibility
WCAG AA contrast. Status = icon + word. Visible focus. Dialog trap/return. Slider `role="slider"`, arrows ±15 s, Home = chapter start. Reorder buttons. Live regions for preparation, transfer, toasts. Reduced motion keeps opacity/colour only.
