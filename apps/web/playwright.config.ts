import { defineConfig, devices } from '@playwright/test'

const url = 'http://localhost:4173/loudbooks/'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
  ],
  // Builds first so the test never runs against a stale dist.
  webServer: { command: 'VITE_DATA_HARNESS=1 pnpm build && pnpm preview --port 4173 --strictPort', url, reuseExistingServer: false, timeout: 180_000 },
})
