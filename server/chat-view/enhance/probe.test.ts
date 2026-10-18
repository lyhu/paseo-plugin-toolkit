import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { collectEnvironmentProfile } from "./probe";
import { createProvider } from "./provider";

const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "chat-view-probe-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(root, name), content, "utf8");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

it("reports unknown for an empty directory instead of throwing", () => {
  const profile = collectEnvironmentProfile(mkdtempSync(join(tmpdir(), "chat-view-probe-")));
  roots.push(profile.root);
  expect(profile).toMatchObject({ projectKind: "unknown", languages: [], frameworks: [] });
  expect(profile.references).toEqual([]);
});

it("reads commands, frameworks and constraints from a node workspace", () => {
  const root = fixture({
    "package.json": JSON.stringify({
      name: "web",
      packageManager: "pnpm@10.18.0",
      engines: { node: ">=20" },
      scripts: { build: "vite build", test: "vitest run", lint: "oxlint ." },
      dependencies: { react: "19.1.0" },
      devDependencies: { typescript: "5.9.3", vitest: "4.1.7" },
    }),
    "pnpm-workspace.yaml": "packages: []",
    "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    "README.md": "# web\n\n\u4f7f\u7528 pnpm\u3002",
  });
  const profile = collectEnvironmentProfile(root);
  expect(profile.projectKind).toBe("monorepo");
  expect(profile.frameworks).toEqual(["react"]);
  expect(profile.commands).toMatchObject({
    build: "pnpm vite build",
    test: "pnpm vitest run",
    lint: "pnpm oxlint .",
  });
  expect(profile.commands.typecheck).toBeUndefined();
  expect(profile.constraints).toContain("Node \u7248\u672c\u7ea6\u675f\uff1a>=20");
  expect(profile.constraints).toContain("\u5305\u7ba1\u7406\u5668\u9501\u5b9a\u4e3a pnpm@10.18.0");
  expect(profile.constraints).toContain("TypeScript \u5f00\u542f\u4e86 strict");
  expect(profile.conventions.join()).toContain("TypeScript\u3001Vitest");
  expect(profile.references.map((entry) => entry.path)).toContain("README.md");
  expect(profile.hotspots.map((entry) => entry.path)).toContain("src");
});

it("falls back to toolchain-guaranteed commands for rust and go", () => {
  const rust = fixture({ "Cargo.toml": '[package]\nname = "core"\n' });
  expect(collectEnvironmentProfile(rust).commands).toMatchObject({
    build: "cargo build",
    test: "cargo test",
  });
  const go = fixture({ "go.mod": "module example.com/core\n\ngo 1.22\n" });
  expect(collectEnvironmentProfile(go)).toMatchObject({
    languages: ["go"],
    commands: { build: "go build ./...", test: "go test ./..." },
  });
});

it("classifies a library, a cli and a docs-only repository", () => {
  const library = fixture({
    "package.json": JSON.stringify({ name: "kit", exports: { "./x": "./x.js" } }),
  });
  expect(collectEnvironmentProfile(library).projectKind).toBe("library");
  const cli = fixture({
    "package.json": JSON.stringify({ name: "tool", bin: { tool: "./bin.js" } }),
  });
  expect(collectEnvironmentProfile(cli).projectKind).toBe("cli");
  const docs = fixture({ "README.md": "# a", "AGENTS.md": "# b", "CLAUDE.md": "# c" });
  expect(collectEnvironmentProfile(docs).projectKind).toBe("docs");
});

it("uses the shared endpoint, configured model and optional credentials", async () => {
  const requests: { url: unknown; init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "enhanced" } }] }) };
  });
  const provider = createProvider({
    baseUrl: "https://example.com/v1",
    model: "shared",
    apiKey: "",
  });
  expect(await provider.complete([{ role: "user", content: "test" }])).toBe("enhanced");
  expect(requests[0].url).toBe("https://example.com/v1/chat/completions");
  expect(requests[0].init?.headers).not.toHaveProperty("authorization");
  expect(JSON.parse(String(requests[0].init?.body)).model).toBe("shared");
});
it("redacts provider response bodies on enhancement errors", async () => {
  vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, text: async () => "private-key" }));
  const provider = createProvider({
    baseUrl: "https://example.com",
    model: "shared",
    apiKey: "key",
  });
  await expect(provider.complete([])).rejects.toMatchObject({
    kind: "http",
    status: 401,
    detail: "Model service request failed",
  });
});
