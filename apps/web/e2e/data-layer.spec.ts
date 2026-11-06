import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, type BrowserContext } from "@playwright/test";

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

test("imports source files and reads identical OPFS bytes", async ({ playwright, browserName }) => {
  test.setTimeout(180_000);
  const root = resolve(process.cwd(), "../..");
  const zeland = resolve(root, "fixtures/downloads/zeland");
  const sample = resolve(root, "audio_samples/book-short.mp3");
  test.skip(!existsSync(zeland) || !existsSync(sample), "External audio fixtures are not installed");
  const chapters = (await readdir(zeland)).filter(name => name.endsWith(".mp3")).sort().slice(0, 3).map(name => resolve(zeland, name));
  expect(chapters).toHaveLength(3);
  const groups = [chapters, [sample]];
  const profile = await mkdtemp(resolve(tmpdir(), 'loudbooks-opfs-'));
  let context: BrowserContext | undefined;
  try {
    context = await playwright[browserName].launchPersistentContext(profile, { headless: true });
    const page = await context.newPage();
    await page.goto("http://localhost:4173/loudbooks/#/__harness/import");
    for (const files of groups) {
      await page.getByLabel("Audio files").setInputFiles(files);
      await page.getByRole("button", { name: "Import" }).click();
      await expect(page.getByTestId("status")).toHaveText(/^(ready|error:)/, { timeout: 150_000 });
      expect(await page.getByTestId("status").innerText()).toBe("ready");
      const result = JSON.parse(await page.getByTestId("result").innerText()) as Record<string, string>;
      for (const file of files) expect(result[basename(file)]).toBe(await sha256(file));
    }
  } finally {
    try { await context?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
  }
});
