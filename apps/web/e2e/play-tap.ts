import { expect, type Locator } from '@playwright/test'

/**
 * The plain Play button is also what a paused (or just-restored) player shows, so it can be visible for a moment
 * after a play tap. Give the audio a few seconds to start; tap Play only if it is still visible with audio paused
 * (the browser wanted another gesture).
 */
export async function needsPlayTap(play: Locator) {
  const paused = () => play.page().evaluate(() => document.querySelector('audio')!.paused)
  await expect.poll(paused, { timeout: 5_000 }).toBe(false).catch(() => {})
  return (await play.isVisible()) && (await paused())
}
