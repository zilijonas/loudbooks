import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { ease, usePreset } from '../../motion/presets'

// Height 0 <-> auto so siblings glide instead of jumping (owner-approved layout animation). Clipped only while it runs,
// so focus rings of fields inside are not cut off at rest. Exits are faster than enters.
const grow = {
  initial: { height: 0, opacity: 0, overflow: 'hidden' },
  animate: { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' }, transition: { height: { duration: 0.26, ease: ease.out }, opacity: { duration: 0.2, delay: 0.04, ease: ease.out } } },
  exit: { height: 0, opacity: 0, overflow: 'hidden', transition: { height: { duration: 0.16, ease: ease.out }, opacity: { duration: 0.1, ease: ease.out } } },
}

/** Conditionally rendered inline content (errors, sub-labels, custom fields): grows open and fades in, closes faster. Inline (`span`) content only fades/rises, it has no height to animate. */
export function Reveal({ show, children, className, as = 'div', id, role }: { show: boolean; children: ReactNode; className?: string; as?: 'div' | 'span'; id?: string; role?: string }) {
  const p = usePreset()
  const reduce = useReducedMotion()
  const M = as === 'span' ? motion.span : motion.div
  const anim = as === 'span' || reduce ? p.reveal : grow // reduced motion: opacity only, height snaps
  return (
    <AnimatePresence initial={false}>
      {show && <M key="r" className={className} id={id} role={role} {...anim}>{children}</M>}
    </AnimatePresence>
  )
}

/** One slot whose content changes with state (`id` is the state): the old content fades out fast, the new one rises in. */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const p = usePreset()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={id} className={className} {...p.reveal}>{children}</motion.div>
    </AnimatePresence>
  )
}
