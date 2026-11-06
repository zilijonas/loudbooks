import { defineConfig, devices } from '@playwright/test'

// Post-deploy smoke against the live site and production signaling. No local servers.
// Run one engine per queued run: pnpm exec playwright test -c playwright.live.config.ts --project=webkit
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'live.spec.ts',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { trace: 'retain-on-failure', actionTimeout: 30_000 },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
  ],
})
