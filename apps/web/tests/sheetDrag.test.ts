import { dragOffset, releaseVelocity, shouldDismiss } from '../src/components/ui/sheetDrag'

// Bottom sheet release rule (motion-spec: dismiss at dy > 120 px or a downward flick > 0.11 px/ms; upward drag damped).
it('dismisses past the distance or on a downward flick, and springs back otherwise', () => {
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

it('tracks 1:1 downward and resists increasingly upward', () => {
  expect(dragOffset(80, 800)).toBe(80)
  const a = -dragOffset(-50, 800)
  const b = -dragOffset(-200, 800)
  expect(a).toBeLessThan(50)
  expect(b - a).toBeLessThan(150) // each extra pixel moves it less
})
