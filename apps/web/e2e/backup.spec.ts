import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";

const directory = resolve(import.meta.dirname, "../../../fixtures/downloads/zeland");
test("Zeland backup roundtrip plays restored audio", async ({ playwright, browserName, baseURL }) => {
  test.skip(!baseURL?.endsWith("/e2e/harness/backup.html"), "Uses the standalone backup harness");
  const profile = mkdtempSync(join(tmpdir(), "lb-backup-"));
  let context: BrowserContext | undefined;
  try {
  context = await playwright[browserName].launchPersistentContext(profile, { baseURL });
  const page = await context.newPage();
  const files = readdirSync(directory).filter(name => /^00[1-3] /.test(name)).sort().map(name => resolve(directory, name));
  expect(files).toHaveLength(3);
  await page.goto("");
  await page.locator("#files").setInputFiles(files);
  await page.locator("#run").click();
  await page.waitForFunction(() => "backupResult" in window || "backupError" in window, null, { timeout: 150000 });
  const result = await page.evaluate(() => ({ result: (window as unknown as { backupResult?: { before: string[]; after: string[]; beforeChapters: unknown[]; afterChapters: unknown[]; progressHash?: string; expectedProgressHash?: string; progressOffset?: number; playing: boolean } }).backupResult, error: (window as unknown as { backupError?: string }).backupError }));
  expect(result.error).toBeUndefined();
  expect(result.result?.after).toEqual(result.result?.before);
  expect(result.result?.afterChapters).toEqual(result.result?.beforeChapters);
  expect(result.result?.progressHash).toBe(result.result?.expectedProgressHash);
  expect(result.result?.progressHash).toBeTruthy();
  expect(result.result?.progressOffset).toBe(1);
  expect(result.result?.playing).toBe(true);
  } finally { try { await context?.close(); } finally { rmSync(profile, { recursive: true, force: true }); } }
});
