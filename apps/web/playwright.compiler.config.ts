import { defineConfig, devices } from '@playwright/test'

// Session compiler tests run against the Vite dev server (the harness page is dev-only, never built).
// Needs the local fixtures from fixtures/README.md; run one engine per queued run.
const url = 'http://localhost:4174/loudbooks/e2e/harness/compile.html'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'compiler.spec.ts',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  timeout: 15 * 60_000,
  use: { baseURL: url, acceptDownloads: true },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
  ],
  webServer: { command: 'pnpm exec vite --port 4174 --strictPort', url, reuseExistingServer: false, timeout: 60_000 },
})
