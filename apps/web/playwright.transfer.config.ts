import { defineConfig, devices } from '@playwright/test'

// Two-device transfer against a local signaling Worker (`wrangler dev`, :8787) and the built app pointed at it.
// Needs fixtures/downloads/zeland and audio_samples/book-long.mp3; run one engine per queued run.
const url = 'http://localhost:4173/loudbooks/'
const signaling = 'http://127.0.0.1:8787'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'transfer.spec.ts',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: url, trace: 'retain-on-failure', actionTimeout: 30_000 },
  projects: [
    // Google Chrome, not the headless shell: peers on one machine exchange UDP, and the host firewall here blocks
    // incoming connections for chrome-headless-shell (two shells connect once, then ICE fails).
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
  webServer: [
    { command: 'pnpm --dir ../signaling exec wrangler dev --ip 127.0.0.1 --port 8787', url: `${signaling}/health`, reuseExistingServer: false, timeout: 120_000 },
    { command: `VITE_DATA_HARNESS=1 VITE_SIGNALING_URL=${signaling} pnpm build && pnpm preview --port 4173 --strictPort`, url, reuseExistingServer: false, timeout: 180_000 },
  ],
})
