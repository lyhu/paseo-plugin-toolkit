import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
import { expect, it, vi } from "vitest";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { WorkbenchModel } from "./types";
vi.mock("react-native", () => {
  const component =
    (tag: string) =>
    ({ children }: { children?: unknown }) =>
      createElement(tag, null, children as never);
  return {
    View: component("div"),
    ScrollView: component("section"),
    Text: component("span"),
    TextInput: component("input"),
    Pressable: component("button"),
  };
});
vi.mock("@getpaseo/plugin/client", () => ({ getPaseoClient: vi.fn() }));
vi.mock("../i18n", () => ({ tr: (value: string) => value, useLocale: () => "zh" }));
import { WorkbenchScreen } from "./screen";
const model: WorkbenchModel = {
  hosts: [{ id: "local", name: "Development Host", status: "online" }],
  projects: [
    {
      id: "project",
      name: "Workbench Project",
      instances: [{ serverId: "local", projectId: "project", path: "/project" }],
      workspaceCount: 1,
    },
  ],
  workspaces: [
    { id: "workspace", serverId: "local", projectId: "project", name: "Main", path: "/project" },
  ],
  sessions: [],
  preferences: { layout: "A", tabs: [], favorites: [], focusTasks: [] },
  memories: [],
  skills: [],
  plans: [],
  loading: false,
  editable: true,
  ai: { initialized: false, serverId: "local", providers: [] },
  refresh: vi.fn(),
  savePreferences: vi.fn(),
  search: vi.fn(),
  initializeAI: vi.fn(),
  newSession: vi.fn(),
  saveMemory: vi.fn(),
  removeMemory: vi.fn(),
  toggleSkill: vi.fn(),
  saveSkill: vi.fn(),
  executePlan: vi.fn(),
  cancelPlan: vi.fn(),
};
const props = {
  theme: { colors: {} },
  host: { id: "local", label: "Host" },
  layout: { compact: false, platform: "web" },
  params: {},
} as PluginScreenProps;
it.each(["A", "B", "C"] as const)(
  "renders layout %s with real catalog or initialization controls",
  (layout) => {
    const html = renderToStaticMarkup(
      <WorkbenchScreen
        {...props}
        model={{ ...model, preferences: { ...model.preferences, layout } }}
      />,
    );
    expect(html).toContain("Workbench");
    expect(html).toContain(
      layout === "A"
        ? "Workbench Project"
        : layout === "B"
          ? "Development Host"
          : "初始化 AI 工作区",
    );
  },
);
it.each(["ai", "hosts", "memory", "skills"])(
  "renders the %s destination without DOM dependencies",
  (page) => {
    const html = renderToStaticMarkup(
      <WorkbenchScreen {...props} params={{ page }} model={model} />,
    );
    expect(html).toContain("Workbench");
  },
);
