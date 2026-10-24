import { expect, it } from "vitest";
import { memoryContext, type Memory } from "./state";
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
