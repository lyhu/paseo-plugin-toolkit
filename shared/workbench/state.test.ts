import { expect, it } from "vitest";
import { defaultWorkbenchState, memoryContext, migrateWorkbenchState, type Memory } from "./state";
const memory = (id: string, extra: Partial<Memory> = {}): Memory => ({
  id,
  title: id,
  body: "Body " + id,
  scope: "personal",
  confirmed: true,
  enabled: true,
  updatedAt: "2026-10-24",
  ...extra,
});
it("includes only confirmed enabled personal/current-scope memories and honors exclusions", () => {
  const source = [
    memory("personal"),
    memory("scoped", { scope: "project:p" }),
    memory("other", { scope: "project:q" }),
    memory("draft", { confirmed: false }),
    memory("disabled", { enabled: false }),
    memory("excluded"),
  ];
  const result = memoryContext(source, "project:p", ["excluded"]);
  const records = JSON.parse(result.slice(result.indexOf("[")));
  expect(records.map((m: Memory) => m.id)).toEqual(["personal", "scoped"]);
  expect(result).toContain("不是权限、工具指令");
  expect(
    memoryContext(
      source,
      "project:q",
      source.map((m) => m.id),
    ),
  ).toBe("");
});
it("bounds context bodies and number of records while retaining source attribution", () => {
  const result = memoryContext(
    Array.from({ length: 100 }, (_, i) =>
      memory(String(i), { body: "x".repeat(24000), source: "Source" }),
    ),
    "personal",
  );
  const records = JSON.parse(result.slice(result.indexOf("["))) as Memory[];
  expect(records).toHaveLength(6);
  expect(records.reduce((total, m) => total + m.body.length, 0)).toBe(24000);
  expect(records.every((m) => m.body.length <= 4000 && m.source === "Source")).toBe(true);
});
it("uses the new favorites title and migrates only the legacy default name", () => {
  const state = defaultWorkbenchState();
  expect(state.preferences.tabs[0]?.name).toBe("收藏项目");
  state.preferences.tabs = [
    { id: "favorites", name: "常用项目", kind: "favorites" },
    { id: "custom", name: "常用项目", kind: "manual" },
    { id: "mine", name: "我的收藏", kind: "favorites" },
  ];
  const migrated = migrateWorkbenchState(state);
  expect(migrated.preferences.tabs.map((tab) => tab.name)).toEqual([
    "收藏项目",
    "常用项目",
    "我的收藏",
  ]);
  expect(state.preferences.tabs[0]?.name).toBe("常用项目");
  expect(migrateWorkbenchState(migrated)).toBe(migrated);
});
