import { dragOffset, releaseTarget, releaseVelocity, sheetSnaps, shouldDismiss } from '../src/components/ui/sheetDrag'

// Bottom sheet release rule (motion-spec: dismiss at dy > 120 px or a downward flick > 0.11 px/ms).
it('dismisses past the distance or on a downward flick, and not otherwise', () => {
  expect(shouldDismiss(121, 0)).toBe(true)
  expect(shouldDismiss(30, 0.2)).toBe(true) // short flick still dismisses
  expect(shouldDismiss(119, 0.05)).toBe(false)
  expect(shouldDismiss(-40, 0.5)).toBe(false) // flicking down while above the start does not close
})

it('measures velocity over the last 100 ms of samples', () => {
  const v = releaseVelocity([{ y: 0, t: 0 }, { y: 10, t: 200 }, { y: 20, t: 260 }, { y: 50, t: 300 }])
  expect(v).toBeCloseTo((50 - 10) / (300 - 200))
  expect(releaseVelocity([{ y: 5, t: 10 }])).toBe(0)
})

it('tracks 1:1 downward and never stretches past the rubber limit above the top snap', () => {
  expect(dragOffset(80)).toBe(80)
  expect(-dragOffset(-50)).toBeLessThan(24)
  expect(-dragOffset(-5000)).toBeLessThan(24)
  expect(-dragOffset(-200) - -dragOffset(-50)).toBeLessThan(150)
})

it('offers a second snap only when a meaningful part of the content is hidden at the 60 % cap', () => {
  expect(sheetSnaps(300, 800, 844)).toEqual({ height: 300, snaps: [0] }) // fits: nothing to expand
  expect(sheetSnaps(520, 800, 844)).toEqual({ height: 520, snaps: [0] }) // 520 vs 506 visible: not worth it
  expect(sheetSnaps(700, 800, 844)).toEqual({ height: 700, snaps: [0, 194] })
  expect(sheetSnaps(2000, 800, 844)).toEqual({ height: 800, snaps: [0, 294] }) // long list: capped at full, scrolls inside
})

it('settles on the nearest snap, a flick moves one snap, and only the lowest snap dismisses', () => {
  const snaps = [0, 300]
  expect(releaseTarget(100, 0, snaps)).toBe(0)
  expect(releaseTarget(200, 0, snaps)).toBe(300) // dragged to the middle: back to content
  expect(releaseTarget(40, 0.3, snaps)).toBe(300) // flick down from full: collapses to content, not dismiss
  expect(releaseTarget(260, -0.3, snaps)).toBe(0) // flick up from content: expands
  expect(releaseTarget(-10, -0.5, snaps)).toBe(0) // overshoot above full settles back
  expect(releaseTarget(310, 0.3, snaps)).toBeNull() // flick down from content: dismiss
  expect(releaseTarget(300 + 121, 0, snaps)).toBeNull()
  expect(releaseTarget(20, 0.5, [0])).toBeNull() // single snap behaves like before
  expect(releaseTarget(50, 0, [0])).toBe(0)
})
