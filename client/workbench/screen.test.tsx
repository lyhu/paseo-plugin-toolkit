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
    ({
      children,
      style,
      contentContainerStyle,
    }: {
      children?: unknown;
      style?: unknown;
      contentContainerStyle?: unknown;
    }) =>
      createElement(
        tag,
        { "data-ui-style": JSON.stringify({ style, contentContainerStyle }) },
        children as never,
      );
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
      id: "tree-project",
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

it("keeps AI sessions scoped to both host and workspace when IDs collide", () => {
  const session = {
    id: "same-agent",
    workspaceId: "same-workspace",
    title: "Right host session",
    serverId: "local",
  };
  const html = renderToStaticMarkup(
    <WorkbenchScreen
      {...props}
      params={{ page: "ai" }}
      model={{
        ...model,
        ai: { ...model.ai, initialized: true, workspaceId: "same-workspace" },
        sessions: [{ ...session, serverId: "remote", title: "Wrong host session" }, session],
      }}
    />,
  );
  expect(html).toContain("Right host session");
  expect(html).not.toContain("Wrong host session");
  expect(html).toContain("参考项目");
  expect(html).toContain("Workbench Project");
});
it.each(["pending", "failed", "partial", "unknown", "completed"])(
  "offers execution only for a pending plan, including %s",
  (status) => {
    const html = renderToStaticMarkup(
      <WorkbenchScreen
        {...props}
        params={{ page: "ai" }}
        model={{
          ...model,
          plans: [
            {
              id: "plan-1",
              revision: 4,
              title: "Create project",
              kind: "project",
              status,
              serverId: "local",
              path: "/work/new",
            },
          ],
        }}
      />,
    );
    expect(html.includes("确认并执行")).toBe(status === "pending");
    expect(html).toContain("Create project");
  },
);
it("renders compact dark layouts using the host palette", () => {
  const theme = {
    ...props.theme,
    colors: {
      ...props.theme.colors,
      surface0: "#101622",
      surface1: "#1a2333",
      foreground: "#e2e9f5",
    },
  };
  const html = renderToStaticMarkup(
    <WorkbenchScreen
      {...props}
      theme={theme}
      layout={{ compact: true, platform: "ios" }}
      model={model}
    />,
  );
  expect(html).toContain("#101622");
  expect(html).toContain("#e2e9f5");
  expect(html).toContain("&quot;padding&quot;:16");
  expect(html).toContain("&quot;flexBasis&quot;:&quot;100%&quot;");
});

it("does not equate an enabled skill with confirmed current-session loading", () => {
  const html = renderToStaticMarkup(
    <WorkbenchScreen
      {...props}
      params={{ page: "skills" }}
      model={{
        ...model,
        skills: [
          {
            id: "skill",
            name: "Diagnostics",
            description: "Inspect resources",
            path: "/work/skills/diagnostics",
            enabled: true,
            loaded: false,
          },
        ],
      }}
    />,
  );
  expect(html).toContain("当前会话加载状态未知");
  expect(html).toContain("技能变更从新会话生效");
});
