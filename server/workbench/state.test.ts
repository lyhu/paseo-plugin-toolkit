import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createWorkbenchStateStore } from "./state";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("persists preferences and memories, rejects stale revisions and leaves corrupt files intact", () => {
  const root = mkdtempSync(join(tmpdir(), "workbench-state-"));
  roots.push(root);
  const store = createWorkbenchStateStore(root);
  const changed = store.update(0, (state) => ({
    ...state,
    preferences: { ...state.preferences, favorites: ["project"] },
  }));
  expect(changed.revision).toBe(1);
  expect(createWorkbenchStateStore(root).read()).toEqual(changed);
  expect(() => store.update(0, (state) => state)).toThrow("其他设备");
  const updated = store.update(1, (state) => ({
    ...state,
    memories: [
      {
        id: "memory",
        title: "Title",
        body: "Reference",
        scope: "personal",
        confirmed: false,
        enabled: false,
        updatedAt: "2026-10-24",
      },
    ],
  }));
  expect(updated.memories[0]?.confirmed).toBe(false);
  expect(() =>
    store.update(2, (state) => ({ ...state, memories: [{ ...state.memories[0]!, body: "" }] })),
  ).toThrow();
  expect(store.read().revision).toBe(2);
  writeFileSync(join(root, "toolkit", "workbench", "state.json"), "corrupt");
  expect(() => store.read()).toThrow();
});
