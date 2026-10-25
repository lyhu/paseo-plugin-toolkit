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
    Platform: { OS: "web" },
    StyleSheet: { hairlineWidth: 1 },
    View: component("div"),
    ScrollView: component("section"),
    Text: component("span"),
    TextInput: component("input"),
    Pressable: component("button"),
  };
});
vi.mock("@getpaseo/plugin/client", () => ({ getPaseoClient: vi.fn() }));
vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: () => null,
  Modal: Object.assign(
    ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? createElement("div", { role: "dialog" }, children) : null,
    { Content: ({ children }: { children: ReactNode }) => createElement("div", null, children) },
  ),
}));
vi.mock("../i18n", () => ({ tr: (value: string) => value, useLocale: () => "zh" }));
import { WorkbenchScreen } from "./screen";
import { Markdown } from "../chat-view/mermaid/markdown";
const model: WorkbenchModel = {
  nativeProjects: [
    {
      id: "native-project",
      name: "Native Project",
      instances: [{ serverId: "local", projectId: "project", path: "/project" }],
      workspaceCount: 1,
    },
  ],
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
  ai: { initialized: false, serverId: "local" },
  refresh: vi.fn(),
  savePreferences: vi.fn(),
  search: vi.fn(),
  setAIReference: vi.fn(),
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
    expect(html).toContain("个人空间");
    expect(html).toContain(
      layout === "A" ? "Workbench Project" : layout === "B" ? "Development Host" : "打开知行空间",
    );
  },
);
it.each(["ai", "hosts", "memory", "skills"])(
  "renders the %s destination without DOM dependencies",
  (page) => {
    const html = renderToStaticMarkup(
      <WorkbenchScreen {...props} params={{ page }} model={model} />,
    );
    expect(html).toContain("个人空间");
  },
);

it("uses a native workspace entry instead of duplicating conversation rendering", () => {
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
  expect(html).toContain("打开知行空间");
  expect(html).not.toContain("Right host session");
  expect(html).not.toContain("Wrong host session");
  expect(html).not.toContain("发送");
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

it("reuses native Markdown formatting for headings, emphasis and code", () => {
  const html = renderToStaticMarkup(
    <Markdown
      theme={props.theme}
      compact={false}
      text={"# Plan\n\n**Ready** and `code`\n\n```ts\nconst value = 1;\n```"}
    />,
  );
  expect(html).toContain("Plan");
  expect(html).toContain("Ready");
  expect(html).toContain("const value = 1;");
  expect(html).not.toContain("**Ready**");
  expect(html).not.toContain("```ts");
});

it("shows the native target workspace and provider before confirming a session plan", () => {
  const html = renderToStaticMarkup(
    <WorkbenchScreen
      {...props}
      params={{ page: "ai" }}
      model={{
        ...model,
        plans: [
          {
            id: "session-plan",
            revision: 0,
            title: "New agent",
            kind: "session",
            status: "pending",
            serverId: "local",
            workspaceId: "workspace",
            provider: "codex",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("Main");
  expect(html).toContain("workspace");
  expect(html).toContain("codex");
  expect(html).toContain("确认并执行");
});

it("keeps creation plans available after moving conversations into native workspaces", () => {
  const plan = {
    id: "current-plan",
    revision: 0,
    title: "Current session plan",
    kind: "project",
    status: "pending",
    serverId: "local",
    sourceAgentId: "current-agent",
  };
  const html = renderToStaticMarkup(
    <WorkbenchScreen
      {...props}
      params={{ page: "ai" }}
      model={{
        ...model,
        ai: { ...model.ai, initialized: true, workspaceId: "ai" },
        sessions: [
          {
            id: "current-agent",
            serverId: "local",
            workspaceId: "ai",
            title: "Current conversation",
          },
        ],
        plans: [
          plan,
          {
            ...plan,
            id: "other-plan",
            sourceAgentId: "other-agent",
            title: "Other conversation plan",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("Current session plan");
  expect(html).toContain("Other conversation plan");
});
