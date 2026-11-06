import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { naturalSort, probe } from "../../../src/features/import/probe";

const fixture = async (name: string) => new File([await readFile(resolve(process.cwd(), "../../fixtures/small", name))], name);

describe("import probe", () => {
  it("sorts chapter numbers naturally", () => {
    const names = ["chapter-10.mp3", "chapter-2.mp3", "chapter-1.mp3"];
    expect(naturalSort(names.map(name => new File([], name))).map(file => file.name)).toEqual([names[2], names[1], names[0]]);
  });
  it("detects supported MP3, AAC and PCM data", async () => {
    for (const [name, codec] of [["sample-5s-cbr64k.mp3", "mp3"], ["sample-5s-aac.m4a", "aac"], ["sample-2s-pcm16.wav", "pcm-s16"]] as const) {
      expect((await probe(await fixture(name))).codec).toBe(codec);
    }
  });
  it("rejects invalid media using a typed error", async () => {
    await expect(probe(new File(["not audio"], "bad.mp3"))).rejects.toMatchObject({ code: "form.unsupported" });
  });
});
