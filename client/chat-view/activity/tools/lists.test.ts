import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GithubToolDetail } from "./github";
import { PaseoToolDetail } from "./paseo/index";
import { useActivityStyles, usePalette } from "../styles";

// 共用列表行渲染出来的文字：13 个 paseo 渲染器与 github 详情面板都用它。
vi.mock("react-native", async () => await import("react-native-web"));
vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => ({ status: "ready", values: { palette: "vivid" } }),
  usePaseo: () => ({}),
  useAgent: () => ({ status: "idle" }),
}));
vi.mock("@getpaseo/plugin/client/react-native", async () => ({
  Icon: () => null,
  ScrollView: (await import("react-native-web")).ScrollView,
  useRevealedText: (text: string) => text,
}));

const theme = {
  colors: {
    foreground: "#222222",
    foregroundMuted: "#777777",
    border: "#dddddd",
    surface0: "#ffffff",
    surface1: "#eeeeee",
    accent: "#0066cc",
    statusSuccess: "#00aa44",
    statusWarning: "#cc8800",
    statusDanger: "#cc2222",
  },
};
const { palette, styles } = (() => {
  let out: { palette: ReturnType<typeof usePalette>; styles: ReturnType<typeof useActivityStyles> };
  function Probe() {
    const resolved = usePalette(theme as never);
    out = { palette: resolved, styles: useActivityStyles(theme as never, resolved) };
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return out!;
})();

function renderList(toolName: string, output: unknown) {
  const markup = renderToStaticMarkup(
    React.createElement(PaseoToolDetail, {
      toolName,
      input: {},
      output,
      theme,
      palette,
      styles,
    } as never),
  );
  return markup
    .replace(/<[^>]*>/g, "\u0001")
    .split("\u0001")
    .map((part) => part.trim())
    .filter(Boolean);
}

it("renders one row per item from the fields the family reads", () => {
  expect(
    renderList("paseo_list_agents", {
      agents: [
        {
          id: "a1",
          title: "Reviewer",
          status: "running",
          provider: "codex",
          model: "gpt-5",
          cwd: "/tmp/work",
        },
      ],
    }),
  ).toEqual([
    "No details returned.",
    "Agents (1)",
    "Reviewer",
    "running",
    "codex · gpt-5",
    "/tmp/work",
  ]);
});

it("falls back to the item id and drops lines with nothing in them", () => {
  expect(renderList("paseo_list_agents", { agents: [{ id: "a1" }] })).toEqual([
    "No details returned.",
    "Agents (1)",
    "a1",
    "a1",
  ]);
});

it("shows the empty text instead of a section with zero rows", () => {
  expect(renderList("paseo_list_agents", { agents: [] })).toEqual([
    "No details returned.",
    "No agents returned.",
  ]);
});

it("carries a badge, a coloured title and a selectable body", () => {
  expect(
    renderList("paseo_browser_logs", {
      console: [{ level: "warn", source: "console", message: "a message" }],
      network: [{ method: "GET", status: 200, duration: 12, url: "https://example.com/page" }],
    }),
  ).toEqual([
    "No details returned.",
    "Console (1)",
    "warn",
    "console",
    "a message",
    "Network (1)",
    "GET 200",
    "12 ms",
    "https://example.com/page",
  ]);
});

function renderGithub(toolName: string, output: unknown, input: unknown = {}) {
  const markup = renderToStaticMarkup(
    React.createElement(GithubToolDetail, {
      toolName,
      input,
      output,
      theme,
      palette,
      styles,
    } as never),
  );
  return markup
    .replace(/<[^>]*>/g, "\u0001")
    .split("\u0001")
    .map((part) => part.trim())
    .filter(Boolean);
}

it("renders github result rows through the same list primitive", () => {
  expect(
    renderGithub("mcp__github__search_repositories", {
      total_count: 1,
      items: [
        {
          id: 1,
          full_name: "acme/widget",
          language: "TypeScript",
          description: "a widget",
          stargazers_count: 3,
          forks_count: 1,
          html_url: "https://github.com/acme/widget",
        },
      ],
    }),
  ).toEqual([
    "GitHub Repository Search",
    "Total",
    "1",
    "Repositories (1)",
    "acme/widget",
    "TypeScript",
    "a widget",
    "3 · 1",
    "https://github.com/acme/widget",
  ]);
});

it("drops the github section title when the list is empty", () => {
  expect(renderGithub("mcp__github__search_repositories", { total_count: 0, items: [] })).toEqual([
    "GitHub Repository Search",
    "Total",
    "0",
    "No results returned.",
  ]);
});

it("renders a headerless github row when the whole row is a field block", () => {
  expect(
    renderGithub("mcp__github__pull_request_read", [{ filename: "a.ts", status: "modified" }], {
      method: "get_files",
    }),
  ).toEqual(["GitHub Pull Request", "Changed files (1)", "filename", "a.ts", "status", "modified"]);
});

it("falls through to the next key spelling when the first one is not a string", () => {
  expect(
    renderGithub("mcp__github__search_repositories", { items: [{ full_name: 42, name: "b" }] }),
  ).toContain("b");
  expect(
    renderGithub("mcp__github__search_repositories", { items: [{ full_name: "   ", name: "c" }] }),
  ).toContain("c");
});
