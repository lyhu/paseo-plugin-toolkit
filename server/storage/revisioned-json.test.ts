import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { createRevisionedJsonStore } from "./revisioned-json";

const roots: string[] = [];
const schema = z.object({
  revision: z.number().int().nonnegative(),
  value: z.string().trim().min(1),
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "toolkit-revisioned-"));
  roots.push(home);
  return { home, filename: join(home, "nested", "document.json") };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("revisioned JSON store", () => {
  it("creates the default document with owner-only permissions", () => {
    const { filename } = fixture();
    const store = createRevisionedJsonStore({
      filename,
      schema,
      create: () => ({ revision: 0, value: "default" }),
      seed: true,
      concurrencyError: "stale",
    });
    expect(store.read()).toEqual({ revision: 0, value: "default" });
    expect(statSync(filename).mode & 0o777).toBe(0o600);
    expect(statSync(join(filename, "..")).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(filename, "utf8"))).toEqual({ revision: 0, value: "default" });
  });
  it("increments the revision and rejects a stale expected revision without writing", () => {
    const { filename } = fixture();
    const store = createRevisionedJsonStore({
      filename,
      schema,
      create: () => ({ revision: 0, value: "default" }),
      concurrencyError: "stale",
    });
    expect(store.update(0, (current) => ({ ...current, value: "first" }))).toEqual({
      revision: 1,
      value: "first",
    });
    expect(() => store.update(0, (current) => ({ ...current, value: "stale" }))).toThrow("stale");
    expect(store.read()).toEqual({ revision: 1, value: "first" });
  });
  it("does not write a document that fails validation", () => {
    const { filename } = fixture();
    const store = createRevisionedJsonStore({
      filename,
      schema,
      create: () => ({ revision: 0, value: "default" }),
      concurrencyError: "stale",
    });
    expect(() => store.update(0, (current) => ({ ...current, value: " " }))).toThrow();
    expect(store.read()).toEqual({ revision: 0, value: "default" });
  });
  it("replaces an unreadable document with the configured read error", () => {
    const { filename } = fixture();
    const store = createRevisionedJsonStore({
      filename,
      schema,
      create: () => ({ revision: 0, value: "default" }),
      concurrencyError: "stale",
      readError: "unreadable",
    });
    store.update(0, (current) => current);
    writeFileSync(filename, "not json");
    expect(() => store.read()).toThrow("unreadable");
  });
});
