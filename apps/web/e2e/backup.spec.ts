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

// The real screens: book menu export, Settings import, duplicate prompt, replacing the book that is playing.
test("backup UI exports, restores and replaces the playing book", async ({ playwright, browserName, baseURL }) => {
  test.skip(baseURL !== "http://localhost:4173/loudbooks/", "Uses the app preview server");
  test.setTimeout(180000);
  const profile = mkdtempSync(join(tmpdir(), "lb-backup-ui-"));
  let context: BrowserContext | undefined;
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { baseURL, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    const file = resolve(directory, readdirSync(directory).filter(name => /^001 /.test(name))[0]!);
    await page.goto("#/__harness/import");
    await page.getByLabel("Audio files").setInputFiles(file);
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByTestId("status")).toHaveText("ready", { timeout: 120000 });
    await page.evaluate(() => { location.hash = "#/"; });

    await page.getByRole("button", { name: "More actions for Browser test" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup (.loudbook.zip)" }).click()]);
    expect(download.suggestedFilename()).toBe("Browser test.loudbook.zip");
    const zip = join(profile, "backup.loudbook.zip");
    await download.saveAs(zip);

    await page.getByRole("button", { name: "More actions for Browser test" }).click();
    await page.getByRole("button", { name: "Delete book" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete book" }).click();
    await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();

    const restore = async () => {
      await page.getByRole("button", { name: "Settings" }).first().click();
      await page.getByTestId("backup-file").setInputFiles(zip);
    };
    await restore();
    await expect(page.getByText("1 book restored.")).toBeVisible({ timeout: 60000 });
    await page.getByRole("button", { name: "Library" }).first().click();
    await page.getByRole("button", { name: "Play Browser test" }).click();
    const ready = page.getByRole("button", { name: "Ready — play" });
    await expect(page.getByRole("button", { name: "Pause", exact: true }).or(ready)).toBeVisible({ timeout: 60000 });
    if (await ready.isVisible()) await ready.click();
    const paused = () => page.evaluate(() => document.querySelector("audio")!.paused);
    await expect.poll(paused).toBe(false);

    await restore();
    await expect(page.getByRole("heading", { name: "You already have this book" })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Replace it" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60000 });
    await expect(page.getByRole("heading", { name: "Import stopped" })).toHaveCount(0);
    expect(await paused()).toBe(true);
    await page.getByRole("button", { name: "Library" }).first().click();
    await expect(page.getByRole("button", { name: "Browser test, details" })).toHaveCount(1);

    // The same guard serves editing and deleting the book that is loaded in the player.
    await page.getByRole("button", { name: "Play Browser test" }).click();
    if (await ready.isVisible()) await ready.click();
    await expect.poll(paused).toBe(false);
    await page.getByRole("button", { name: "Browser test, details" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("textbox", { name: "Title Required" }).fill("Renamed");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Renamed" })).toBeVisible();
    await page.getByRole("button", { name: "More actions for Renamed" }).click();
    await page.getByRole("button", { name: "Delete book" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete book" }).click();
    await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Now playing/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { try { await context?.close(); } finally { rmSync(profile, { recursive: true, force: true }); } }
});
