import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
const url = "http://localhost:4175/loudbooks/e2e/harness/backup.html";
export default defineConfig({
  testDir: "..", testMatch: "backup.spec.ts", workers: 1, reporter: "list", timeout: 180000,
  use: { baseURL: url },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }, { name: "webkit", use: devices["Desktop Safari"] }],
  webServer: { cwd: resolve(import.meta.dirname, "../.."), command: "pnpm exec vite --port 4175 --strictPort", url, reuseExistingServer: false, timeout: 60000 },
});
