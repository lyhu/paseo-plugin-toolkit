import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createModelStore } from "./storage";
const roots: string[] = [];
const model = { baseUrl: "https://example.com/v1", model: "shared-model", apiKey: "private-key" };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "toolkit-models-"));
  roots.push(root);
  return root;
}
function legacyWorkspace(home: string, id: string, config = model) {
  const root = join(home, "toolkit", "quick-questions");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, `${createHash("sha256").update(id).digest("hex")}.json`),
    JSON.stringify({ model: config, questions: [{ id: "keep", text: "keep question" }] }),
  );
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe("shared host models", () => {
  it("migrates identical workspace models into one default without editing question files", () => {
    const root = fixture();
    legacyWorkspace(root, "a");
    legacyWorkspace(root, "b");
    const models = createModelStore(root);
    expect(models.read("new-workspace").effectiveModel).toEqual({
      baseUrl: model.baseUrl,
      model: model.model,
      hasKey: true,
    });
    expect(models.read("a").source).toBe("host");
    expect(models.read("b").overrideModel).toBeNull();
    expect(JSON.stringify(models.read("a"))).not.toContain("private-key");
    expect(statSync(join(root, "toolkit", "models.json")).mode & 0o777).toBe(0o600);
    expect(createModelStore(root).resolve("a")).toEqual(model);
  });
  it("preserves a different workspace model and legacy feature settings", () => {
    const root = fixture();
    legacyWorkspace(root, "a", { ...model, model: "summary-only" });
    const folder = join(root, "plugin-settings", "chat-view");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "display.json"),
      JSON.stringify({
        version: 3,
        values: {
          enhanceBaseUrl: model.baseUrl,
          enhanceModel: model.model,
          enhanceApiKey: model.apiKey,
          enhanceEnabled: true,
          stickyEnabled: false,
          palette: "soft",
        },
      }),
    );
    const models = createModelStore(root);
    expect(models.resolve()).toEqual(model);
    expect(models.resolve("a").model).toBe("summary-only");
    const raw = readFileSync(
      join(root, "plugin-settings", "toolkit", "chat-view-display.json"),
      "utf8",
    );
    expect(JSON.parse(raw).values).toMatchObject({
      enhanceEnabled: true,
      stickyEnabled: false,
      palette: "soft",
    });
    expect(raw).not.toContain("private-key");
    expect(raw).not.toContain("enhanceBaseUrl");
  });
  it("shares host changes, isolates overrides, and can restore inheritance", () => {
    const models = createModelStore(fixture());
    models.save({ revision: 0, scope: "host", ...model, clearKey: false });
    expect(models.resolve("any")).toEqual(model);
    models.save({
      revision: 1,
      scope: "workspace",
      workspaceId: "a",
      ...model,
      model: "override",
      apiKey: "",
      clearKey: false,
    });
    expect(models.resolve("a")).toEqual({ ...model, model: "override" });
    models.save({
      revision: 2,
      scope: "host",
      ...model,
      model: "new-default",
      apiKey: "",
      clearKey: false,
    });
    expect(models.resolve("b").model).toBe("new-default");
    expect(models.resolve("a").model).toBe("override");
    models.inherit("a", 3);
    expect(models.resolve("a").model).toBe("new-default");
    expect(() => models.save({ revision: 0, scope: "host", ...model, clearKey: false })).toThrow(
      "models.error.stale",
    );
    models.save({ revision: 4, scope: "host", ...model, apiKey: "", clearKey: true });
    expect(models.resolve().apiKey).toBe("");
  });
});
