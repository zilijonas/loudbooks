import { sheet } from '../../motion/presets'

/** Past the top snap the sheet may stretch at most this far (px), then stops. */
export const RUBBER_PX = 24
const CONTENT_CAP = 0.6 // the resting "content" snap shows at most 60 % of the viewport
const MIN_EXPAND_PX = 48 // less hidden than this is not worth a second snap

/**
 * Panel height and snap offsets. A snap is how far (px) the panel is translated down: 0 = fully expanded,
 * the last one = resting at the content height. Content that fits within the cap has a single snap (0).
 */
export function sheetSnaps(naturalPx: number, fullPx: number, viewportPx: number): { height: number; snaps: number[] } {
  const height = Math.min(naturalPx, fullPx)
  const hidden = height - Math.min(height, viewportPx * CONTENT_CAP)
  return { height, snaps: hidden >= MIN_EXPAND_PX ? [0, Math.round(hidden)] : [0] }
}

/** Release decision: past the lowest snap by the distance, or a downward flick fast enough, regardless of distance. */
export function shouldDismiss(dyPx: number, velocityPxPerMs: number): boolean {
  return dyPx > sheet.dismiss.offsetPx || (dyPx > 0 && velocityPxPerMs > sheet.dismiss.velocityPxPerMs)
}

/** Follows the finger 1:1 downward; above the top snap (y < 0) it stretches at most RUBBER_PX, never a hard stop. */
export function dragOffset(y: number): number {
  if (y >= 0) return y
  const over = -y
  return -(over * RUBBER_PX) / (over + RUBBER_PX)
}

/** Where a released drag goes: the nearest snap (a flick moves one snap further), or null = dismiss. `snaps` ascending. */
export function releaseTarget(y: number, velocityPxPerMs: number, snaps: number[]): number | null {
  if (shouldDismiss(y - (snaps.at(-1) ?? 0), velocityPxPerMs)) return null
  let i = snaps.reduce((best, s, k) => (Math.abs(s - y) < Math.abs((snaps[best] ?? 0) - y) ? k : best), 0)
  if (Math.abs(velocityPxPerMs) > sheet.dismiss.velocityPxPerMs) i += Math.sign(velocityPxPerMs)
  return snaps[Math.min(snaps.length - 1, Math.max(0, i))] ?? 0
}

/** Velocity over the last pointer samples, in px/ms (positive = downward). */
export function releaseVelocity(samples: { y: number; t: number }[]): number {
  const last = samples.at(-1)
  const first = samples.find((s) => last && last.t - s.t <= 100) ?? samples[0]
  if (!last || !first || last.t === first.t) return 0
  return (last.y - first.y) / (last.t - first.t)
}
