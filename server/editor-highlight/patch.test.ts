import { describe, expect, it } from "vitest";
import { runInThisContext } from "node:vm";
import * as codeMirror from "@codemirror/language";
import { highlightTree, classHighlighter } from "@lezer/highlight";
import { patchBundle } from "./patch";
import { fixtureBundle } from "./fixtures/renderer";

export function loadLookup(source: string) {
  const exports: { getLanguageForFile?: (filename: string) => codeMirror.Language | null } = {};
  runInThisContext(`(function(__d){${source}\n})`)((factory: (...args: unknown[]) => void) => {
    factory(null, () => codeMirror, null, null, null, exports, [0]);
  });
  return exports.getLanguageForFile!;
}

describe("installed renderer patch", () => {
  it("adds real editor languages while retaining existing entries", () => {
    const lookup = loadLookup(patchBundle(fixtureBundle));
    for (const filename of [
      ".env",
      ".env.local",
      "config.ini",
      "app.toml",
      "run.sh",
      ".zshrc",
      "query.sql",
      "Dockerfile",
      "Dockerfile.dev",
      ".gitignore",
    ])
      expect(lookup(filename)?.parser.parse("# comment")).toBeDefined();
    expect(lookup("file.js")).toEqual({ existing: true });
    expect(lookup("unknown.txt")).toBeNull();
  });

  it("is idempotent", () => {
    const patched = patchBundle(fixtureBundle);
    expect(patchBundle(patched)).toBe(patched);
  });

  it("gives environment comments and configuration keys different highlight classes", () => {
    const lookup = loadLookup(patchBundle(fixtureBundle));
    const source = '# service config\nPORT=8080\nHOST="localhost"';
    const tree = lookup(".env.example")!.parser.parse(source);
    const tokens: Array<{ text: string; style: string }> = [];
    highlightTree(tree, classHighlighter, (from, to, style) => {
      tokens.push({ text: source.slice(from, to), style });
    });
    expect(tokens).toContainEqual({ text: "# service config", style: "tok-comment" });
    expect(tokens).toContainEqual({ text: "PORT", style: "tok-variableName tok-definition" });
    expect(tokens).toContainEqual({ text: '"localhost"', style: "tok-string" });
  });

  it("preserves gitignore escaping and inline hash semantics", () => {
    const lookup = loadLookup(patchBundle(fixtureBundle));
    const source = "# generated\n!keep.log\n*.log\nfile#name\n\\#literal";
    const tokens: Array<{ text: string; style: string }> = [];
    highlightTree(
      lookup(".gitignore")!.parser.parse(source),
      classHighlighter,
      (from, to, style) => {
        tokens.push({ text: source.slice(from, to), style });
      },
    );
    expect(tokens).toContainEqual({ text: "# generated", style: "tok-comment" });
    expect(tokens).toContainEqual({ text: "!", style: "tok-operator" });
    expect(tokens).toContainEqual({ text: "file#name", style: "tok-string" });
    expect(tokens).toContainEqual({ text: "\\#", style: "tok-string2" });
  });

  it("refuses changed lookup implementations and partial patches", () => {
    expect(() => patchBundle(fixtureBundle.replace('split(".")', 'split("/")'))).toThrow("不兼容");
    expect(() => patchBundle(fixtureBundle + "/* toolkit-editor-highlight:v0:start */")).toThrow(
      "补丁",
    );
    expect(() => patchBundle(fixtureBundle + fixtureBundle)).toThrow("不兼容");
  });
});
