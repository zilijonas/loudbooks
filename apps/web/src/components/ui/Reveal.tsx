import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { usePreset } from '../../motion/presets'

/** Conditionally rendered inline content (errors, sub-labels, custom fields): fades/rises in, fades out faster. */
export function Reveal({ show, children, className, as = 'div', id, role }: { show: boolean; children: ReactNode; className?: string; as?: 'div' | 'span'; id?: string; role?: string }) {
  const p = usePreset()
  const M = as === 'span' ? motion.span : motion.div
  return (
    <AnimatePresence initial={false}>
      {show && <M key="r" className={className} id={id} role={role} {...p.reveal}>{children}</M>}
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
