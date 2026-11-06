import { defineConfig, devices } from '@playwright/test'

// The component gallery exists only in dev builds, so this suite runs against the Vite dev server.
// Run one engine at a time: pnpm exec playwright test -c playwright.gallery.config.ts --project=webkit
const url = 'http://127.0.0.1:5174/loudbooks/'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'gallery.spec.ts',
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
  ],
  webServer: { command: 'pnpm exec vite --port 5174 --strictPort --host 127.0.0.1', url, reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
