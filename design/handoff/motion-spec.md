# Motion specification

Source of truth: `design-system/motion.ts` (Motion for React). The prototype approximates these with CSS overshoot curves.

| Preset | Used by | Values | Trigger | Interruption | Reduced motion |
|---|---|---|---|---|---|
| press | Buttons, cards, chips | scale .96 (Play .92); release spring 0.32 s, bounce .45 | pointerdown / Space / Enter | Release mid-press retargets. Never disables the control. | opacity .7 |
| hoverLift | BookCard | translateY(−5px) scale(1.035), rotate ±1° by index; spring 0.35 s, bounce .3 | mouse pointer only (`(hover:hover) and (pointer:fine)`) | Retargets | none |
| springPlayful | Speed/theme pill, Switch, timer highlight, reorder neighbours, checks | spring 0.45 s, bounce .35 | selection | Retargets with velocity | instant |
| springSoft | Page content, layout | spring 0.4 s, bounce .12 | route/layout | Retargets | 150 ms fade |
| sheet | BottomSheet (phone) | in: translateY 100%→0, spring 0.45 s bounce .18; out: 0.2 s `[.32,.72,0,1]` | open/close | Drag from grabber/header only; dismiss at dy > 120 px or > 0.11 px/ms; upward drag damped; pointer capture; extra pointers ignored | fade |
| dialog | Dialogs; sheets on desktop | opacity + scale .94→1, 0.26 s `[.23,1,.32,1]`; out 0.14 s; centred | open/close | — | fade |
| sharedCover | Card cover → details/player; mini-player → player | `layoutId="cover-{id}"`, spring 0.5 s bounce .15 | navigation | Retargets | cross-fade |
| page | Route content | opacity + translateY 12px, springSoft; exit 120 ms fade | route | — | fade |
| success | New book card, success panels | scale .9→1 (never 0) + opacity, spring 0.5 s bounce .45; check draws 0.3 s after 0.2 s | commit | Once | fade |
| reorder | EditableChapterRow | lifted scale 1.03 + lift shadow; dashed placeholder; neighbours springPlayful (84 px pitch) | drag | Drop commits; Up/Down buttons do it without motion | no transforms |
| stagger | Empty-library art only | 40 ms step, max 240 ms | mount | Never blocks input | 0 |

Rules: enter ease-out, on-screen movement ease-in-out, never ease-in. Exits faster than entrances. Only transform/opacity (progress bars use scaleX). Keyboard actions don't animate. Play/Pause cross-fades with 2 px blur and scale .6↔1. Empty-library art bobs once. Only spinners and indeterminate bars loop; they keep running under reduced motion because they carry meaning and always sit beside a text label.
