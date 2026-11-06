import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { exclusive } from "../../../src/features/import/exclusive";

it("serializes large jobs when Web Locks is unavailable", async () => {
  let release!: () => void;
  let entered!: () => void;
  const active = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const first = exclusive(async () => { events.push("first-start"); entered(); await held; events.push("first-end"); });
  await active;
  const second = exclusive(async () => { events.push("second-start"); });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(events).toEqual(["first-start"]);
  release();
  await Promise.all([first, second]);
  expect(events).toEqual(["first-start", "first-end", "second-start"]);
});
