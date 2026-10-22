import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorage, publicWorkspace } from "./storage";

import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "toolkit-storage-"));
  roots.push(root);
  return { root, storage: createStorage(root) };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const question = {
  id: "one",
  text: "检查集群状态",
  origin: "custom",
  frequency: 0,
  sources: [],
} as const;
describe("workspace storage", () => {
  it("reuses parsed documents, invalidates external edits and bounds the cache", () => {
    const { root, storage } = fixture();
    storage.save("a", 0, (current) => ({ ...current, questions: [{ ...question, sources: [] }] }));
    const first = storage.read("a");
    const token = storage.version("a");
    expect(storage.read("a")).toBe(first);
    const filename = join(root, readdirSync(root)[0]!);
    writeFileSync(filename, JSON.stringify({ ...first, enabled: false }));
    expect(storage.read("a").enabled).toBe(false);
    expect(storage.version("a")).not.toBe(token);
    const previous = storage.read("a");
    for (let i = 0; i < 33; i++) storage.read(`workspace-${i}`);
    expect(storage.read("a")).not.toBe(previous);
  });
  it("defaults old workspace files to 50 and persists an independently configured limit", () => {
    const { root, storage } = fixture();
    const first = storage.save("a", 0, (current) => ({
      ...current,
      questions: [{ ...question, sources: [] }],
    }));
    expect(first.historyLimit).toBe(50);
    const filename = join(root, readdirSync(root)[0]);
    const legacy = JSON.parse(readFileSync(filename, "utf8"));
    delete legacy.historyLimit;
    delete legacy.summaryPrompt;
    writeFileSync(filename, JSON.stringify(legacy));
    expect(storage.read("a").historyLimit).toBe(50);
    expect(publicWorkspace(storage.read("a")).summaryPrompt).toBe(DEFAULT_SUMMARY_PROMPT);
    const configured = storage.save("a", first.revision, (current) => ({
      ...current,
      historyLimit: 12,
      summaryPrompt: "合并重复的运维问题，按出现频次降序排列。",
    }));
    expect(configured.historyLimit).toBe(12);
    expect(configured.summaryPrompt).toBe("合并重复的运维问题，按出现频次降序排列。");
    expect(storage.read("a").summaryPrompt).toBe(configured.summaryPrompt);
    expect(storage.read("b").summaryPrompt).toBe(DEFAULT_SUMMARY_PROMPT);
    expect(storage.read("a").historyLimit).toBe(12);
    expect(storage.read("a").questions[0].text).toBe(question.text);
    expect(storage.read("b").historyLimit).toBe(50);
    expect(() =>
      storage.save("a", configured.revision, (current) => ({ ...current, historyLimit: 0 })),
    ).toThrow();
    expect(storage.read("a").historyLimit).toBe(12);
    expect(() =>
      storage.save("a", configured.revision, (current) => ({ ...current, summaryPrompt: " " })),
    ).toThrow();
    expect(storage.read("a").summaryPrompt).toBe(configured.summaryPrompt);
  });
  it("persists isolated workspaces without storing model credentials", () => {
    const { root, storage } = fixture();
    storage.save("workspace/../a", 0, (current) => ({
      ...current,
      questions: [{ ...question, sources: [] }],
    }));
    expect(storage.read("b").questions).toEqual([]);
    expect(storage.read("workspace/../a").questions[0].text).toBe("检查集群状态");
    const filename = join(root, readdirSync(root)[0]);
    expect(statSync(filename).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(filename, "utf8")).revision).toBe(1);
    expect(readFileSync(filename, "utf8")).not.toContain("apiKey");
  });
  it("rejects stale saves and preserves the newer data", () => {
    const { storage } = fixture();
    storage.save("a", 0, (current) => ({ ...current, questions: [{ ...question, sources: [] }] }));
    expect(() => storage.save("a", 0, (current) => ({ ...current, questions: [] }))).toThrow(
      "quickQuestions.error.stale",
    );
    expect(storage.read("a").questions).toHaveLength(1);
  });
  it("rejects normalized duplicates without changing the file", () => {
    const { storage } = fixture();
    expect(() =>
      storage.save("a", 0, (current) => ({
        ...current,
        questions: [
          { ...question, text: "Server STATUS", sources: [] },
          { ...question, id: "two", text: " server   status ", sources: [] },
        ],
      })),
    ).toThrow("quickQuestions.error.duplicateQuestions");
    expect(storage.read("a").revision).toBe(0);
  });
});
