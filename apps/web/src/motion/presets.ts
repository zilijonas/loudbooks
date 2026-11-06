// Loud Books — motion presets for Motion for React (import from "motion/react").
// Every preset has a reduced-motion counterpart; use usePreset() so components never branch by hand.
import { useReducedMotion, type Transition, type TargetAndTransition } from "motion/react";

// Easing (emil-design-eng): never ease-in for UI.
export const ease = {
  out: [0.23, 1, 0.32, 1],        // enters, feedback
  inOut: [0.77, 0, 0.175, 1],     // on-screen movement
  drawer: [0.32, 0.72, 0, 1],     // sheets (iOS-like)
} as const;

// Springs in duration/bounce form (perceptual duration in s).
export const springSoft: Transition    = { type: "spring", duration: 0.4,  bounce: 0.12 }; // layout, page content
export const springPlayful: Transition = { type: "spring", duration: 0.45, bounce: 0.35 }; // pills, toggles, icon swaps — the visible "Loud" bounce
export const reducedMotion: Transition = { type: "tween", duration: 0.15, ease: ease.out }; // opacity/color only

export const press = {
  // Trigger: pointerdown / Space / Enter. Press is fast (120ms); release springs with overshoot.
  // Interruptible: releasing mid-compress retargets from the current value. Never disables the button.
  whileTap: { scale: 0.96 } as TargetAndTransition,
  transition: { type: "spring", duration: 0.32, bounce: 0.45 } as Transition,
  playButton: { whileTap: { scale: 0.92 } }, // 80px Play compresses a bit more
};

export const hoverLift = {
  // Only under (hover:hover) and (pointer:fine). Touch gets press only. Tens/day → keep short.
  whileHover: { transform: "translateY(-5px) scale(1.035)" } as TargetAndTransition, // optional tilt: rotate(±1deg) alternating by index
  transition: { type: "spring", duration: 0.35, bounce: 0.3 } as Transition,
};

export const sheet = {
  // Enter with small overshoot; exit faster. Drag-dismiss from grabber/header only, never from scrolling content.
  initial: { transform: "translateY(100%)" }, animate: { transform: "translateY(0%)" }, exit: { transform: "translateY(100%)" },
  transition: { type: "spring", duration: 0.45, bounce: 0.18 } as Transition,
  exitTransition: { type: "tween", duration: 0.2, ease: ease.drawer } as Transition,
  dismiss: { offsetPx: 120, velocityPxPerMs: 0.11 }, // flick dismisses regardless of distance; friction when dragging up past top
};

export const sharedCover = {
  // <motion.div layoutId={`cover-${book.id}`}> on BookCard, MiniPlayer and FullPlayer artwork.
  transition: { type: "spring", duration: 0.5, bounce: 0.15 } as Transition,
};

export const page = {
  initial: { opacity: 0, transform: "translateY(12px)" }, animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transition: { duration: 0.12 } },
  transition: springSoft,
};

export const success = {
  // Newly imported/received book: pop in from 0.9 (never 0), then check badge draws. Rare → allowed delight.
  initial: { opacity: 0, transform: "scale(0.9)" },
  animate: { opacity: 1, transform: "scale(1)" },
  transition: { type: "spring", duration: 0.5, bounce: 0.45 } as Transition,
  check: { pathLength: [0, 1], transition: { delay: 0.2, duration: 0.3, ease: ease.out } },
};

export const reorder = {
  lifted: { scale: 1.03, boxShadow: "var(--lb-shadow-lift)", zIndex: 5 },
  layoutTransition: springPlayful,
};

export const stagger = { step: 0.04, max: 0.24 }; // 40ms per item, cap total; never blocks input

// Additions from handoff/motion-spec.md and the prototype keyframes (lbDialogIn, lbToast, lbRise).
export const dialog = {
  // Centred, so scale from the middle. Exit faster than enter.
  initial: { opacity: 0, transform: "scale(0.94)" }, animate: { opacity: 1, transform: "scale(1)" },
  exit: { opacity: 0, transform: "scale(0.98)", transition: { duration: 0.14, ease: ease.out } },
  transition: { duration: 0.26, ease: ease.out } as Transition,
};

export const menu = {
  // Popover: scales from its trigger via the Radix transform-origin variable (set in CSS).
  initial: { opacity: 0, transform: "scale(0.96)" }, animate: { opacity: 1, transform: "scale(1)" },
  exit: { opacity: 0, transition: { duration: 0.12, ease: ease.out } },
  transition: { duration: 0.18, ease: ease.out } as Transition,
};

export const toast = {
  initial: { opacity: 0, transform: "translateY(14px) scale(0.96)" }, animate: { opacity: 1, transform: "translateY(0px) scale(1)" },
  exit: { opacity: 0, transform: "translateY(8px) scale(0.98)", transition: { duration: 0.16, ease: ease.out } },
  transition: { duration: 0.32, ease: ease.out } as Transition,
};

export const reveal = {
  // Inline content that appears inside a component (error lines, custom fields, sub-labels).
  initial: { opacity: 0, transform: "translateY(6px)" }, animate: { opacity: 1, transform: "translateY(0px)" },
  exit: { opacity: 0, transition: { duration: 0.12, ease: ease.out } },
  transition: { duration: 0.26, ease: ease.out } as Transition,
};

export const presets = { springSoft, springPlayful, press, hoverLift, sheet, sharedCover, page, success, reorder, stagger, dialog, menu, toast, reveal };

// Keyboard-initiated actions (shortcuts, arrow-key seeking) do not animate.

/** Returns presets with transforms stripped when the user prefers reduced motion. Functionality is unchanged. */
export function usePreset() {
  const reduce = useReducedMotion();
  if (!reduce) return presets;
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: reducedMotion };
  return {
    springSoft: reducedMotion, springPlayful: reducedMotion,
    press: { whileTap: { opacity: 0.7 }, transition: reducedMotion, playButton: { whileTap: { opacity: 0.7 } } },
    hoverLift: { whileHover: {}, transition: reducedMotion },
    sheet: { ...fade, exitTransition: reducedMotion, dismiss: sheet.dismiss },
    sharedCover: { transition: { duration: 0 } },
    page: fade, success: { ...fade, check: { pathLength: 1 } },
    reorder: { lifted: { boxShadow: "var(--lb-shadow-lift)", zIndex: 5 }, layoutTransition: { duration: 0 } },
    stagger: { step: 0, max: 0 },
    dialog: fade, menu: fade, toast: fade, reveal: fade,
  };
}
