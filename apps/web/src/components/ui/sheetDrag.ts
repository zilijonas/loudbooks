import { sheet } from '../../motion/presets'

/** Release decision: past the distance, or a downward flick fast enough, regardless of distance. */
export function shouldDismiss(dyPx: number, velocityPxPerMs: number): boolean {
  return dyPx > sheet.dismiss.offsetPx || (dyPx > 0 && velocityPxPerMs > sheet.dismiss.velocityPxPerMs)
}

/** Follows the finger 1:1 downward; upward it resists more the further it goes (rubber band, never a hard stop). */
export function dragOffset(dyPx: number, sizePx: number): number {
  if (dyPx >= 0) return dyPx
  const over = -dyPx
  return -(over * sizePx * 0.55) / (sizePx + 0.55 * over)
}

/** Velocity over the last pointer samples, in px/ms (positive = downward). */
export function releaseVelocity(samples: { y: number; t: number }[]): number {
  const last = samples.at(-1)
  const first = samples.find((s) => last && last.t - s.t <= 100) ?? samples[0]
  if (!last || !first || last.t === first.t) return 0
  return (last.y - first.y) / (last.t - first.t)
}
