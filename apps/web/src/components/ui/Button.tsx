import * as Tooltip from '@radix-ui/react-tooltip'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ComponentPropsWithRef, type ReactNode } from 'react'
import { usePreset } from '../../motion/presets'
import { Ic, type IconName } from '../icons'

type MotionButtonProps = Omit<ComponentPropsWithRef<typeof motion.button>, 'children'>

export interface ButtonProps extends MotionButtonProps {
  variant?: 'primary' | 'secondary' | 'strong' | 'ghost' | 'quiet' | 'danger' | 'danger-outline'
  /** sm 40 · md 48 · dialog 52 · lg 56 px. */
  size?: 'sm' | 'md' | 'dialog' | 'lg'
  icon?: IconName
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const ICON = { sm: 16, md: 20, dialog: 20, lg: 22 } as const

/** Pill button. Press compresses with a spring (motion preset); loading swaps the icon for a spinner and keeps the label. */
export function Button({ variant = 'primary', size = 'md', icon, loading, fullWidth, disabled, children, type = 'button', ...rest }: ButtonProps) {
  const p = usePreset()
  const glyph = loading ? 'spin' : icon
  return (
    <motion.button
      type={type}
      className="lb-btn"
      data-variant={variant}
      data-size={size}
      data-full={fullWidth || undefined}
      data-icon={glyph ? '' : undefined}
      disabled={disabled}
      aria-busy={loading || undefined}
      whileTap={disabled ? undefined : p.press.whileTap}
      transition={p.press.transition}
      {...rest}
    >
      {glyph && <Ic name={glyph} size={loading ? 18 : ICON[size]} />}
      {children}
    </motion.button>
  )
}

export interface IconButtonProps extends MotionButtonProps {
  label: string
  icon: IconName
  size?: 44 | 48
  variant?: 'ghost' | 'filled'
  tone?: 'text' | 'muted'
  iconSize?: number
  /** Desktop-only label on hover; touch targets carry visible labels instead. */
  tooltip?: boolean
}

export function IconButton({ label, icon, size = 48, variant = 'ghost', tone = 'text', iconSize, tooltip, ...rest }: IconButtonProps) {
  const p = usePreset()
  const button = (
    <motion.button
      type="button"
      aria-label={label}
      className="lb-iconbtn"
      data-size={size}
      data-variant={variant}
      data-tone={tone}
      whileTap={p.press.playButton.whileTap}
      transition={p.press.transition}
      {...rest}
    >
      <Ic name={icon} size={iconSize ?? (size === 44 ? 20 : 24)} />
    </motion.button>
  )
  return tooltip ? <WithTooltip label={label}>{button}</WithTooltip> : button
}

/** Radix tooltip: 500 ms delay, then instant for neighbours (Radix skipDelayDuration). */
export function WithTooltip({ label, children }: { label: string; children: ReactNode }) {
  const p = usePreset()
  const [open, setOpen] = useState(false)
  return (
    <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <AnimatePresence>
          {open && (
            <Tooltip.Portal forceMount>
              <Tooltip.Content forceMount side="right" sideOffset={8} className="lb-tooltip" asChild>
                <motion.div {...p.menu}>
                  {label}
                  <Tooltip.Arrow width={10} height={5} />
                </motion.div>
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </AnimatePresence>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
