# Loud Books — project rules

Direction: **1a Paperback Pop** (coral / cream / ink, Bricolage Grotesque + Hanken Grotesk). Tokens live in `design-system/`. Phased delivery: brand+tokens → components → screens → prototype → handoff.

## Apply these skills on every design pass (user request)
Sources: emilkowalski/skills (emil-design-eng), pbakaus/impeccable, Leonxlnx/taste-skill (design-taste-frontend), heydamir/unslop.

### Motion (emil-design-eng)
- Ask first: how often is it seen? 100+/day → no animation; keyboard-initiated actions never animate.
- Every animation has a purpose: feedback, state, spatial consistency, preventing jarring change.
- Enter = ease-out (custom `cubic-bezier(0.23,1,0.32,1)`), on-screen movement = ease-in-out (`cubic-bezier(0.77,0,0.175,1)`), drawers `cubic-bezier(0.32,0.72,0,1)`. Never ease-in.
- Press feedback 100–160ms, scale 0.95–0.97. UI under ~300ms; sheets/modals up to 500ms.
- Exit faster than enter. Never animate from scale(0); start ≥0.9 + opacity.
- Popovers scale from their trigger (transform-origin); modals stay centered.
- Only animate transform/opacity. In Motion use `transform` strings for hot paths (x/y shorthands run on main thread).
- Springs for gestures and interruptible state; prefer `{type:"spring", duration, bounce}`; bounce 0.1–0.3 normally, up to ~0.35 for Loud Books' playful moments (brief requires visible springiness).
- Gate hover behind `(hover:hover) and (pointer:fine)`. Stagger 30–80ms, never blocks input.
- Velocity-based sheet dismissal (~0.11 px/ms), friction past bounds, pointer capture, ignore extra touches.
- Reduced motion = fewer/gentler (keep opacity/color), not zero; never removes function.

### Anti-slop (impeccable, unslop, taste)
- No purple gradients, glows, glassmorphism, emoji labels, cards-in-cards, icon tile above every heading, gray text on colored fills, shouty copy.
- Color spent on meaning: coral = primary action / now playing. Quiet surfaces elsewhere.
- Even spacing rhythm from the 4px scale; aligned figures (tabular nums).
- Break-UI check: long titles, 1-char titles, 0/1/many books, huge durations, larger text.
- Mobile-native details: no sticky hover on touch, no tap-highlight flash, `100dvh`, inputs ≥16px (no iOS zoom), safe areas.
- Audit before calling done: contrast, focus, target size, overflow at 320/390/430/768/1440.
