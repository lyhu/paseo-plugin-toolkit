// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { WorkbenchModel } from "./types";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): { render(node: ReactNode): void; unmount(): void };
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("react-native", () => {
  const block =
    (tag: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement(tag, null, children);
  return {
    View: block("div"),
    ScrollView: block("section"),
    Text: block("span"),
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      onPress(): void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel },
        children,
      ),
    TextInput: ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText(value: string): void;
      accessibilityLabel?: string;
    }) =>
      createElement("input", {
        value,
        "aria-label": accessibilityLabel,
        onChange: () => {},
        onInput: (event: { currentTarget: HTMLInputElement }) =>
          onChangeText(event.currentTarget.value),
      }),
  };
});
vi.mock("./chat", () => ({
  Conversation: ({ draft, setDraft }: { draft: string; setDraft(value: string): void }) =>
    createElement("input", {
      "aria-label": "Conversation draft",
      value: draft,
      onChange: () => {},
      onInput: (event: { currentTarget: HTMLInputElement }) => setDraft(event.currentTarget.value),
    }),
}));
vi.mock("@getpaseo/plugin/client/ui", () => ({ Icon: () => null }));
vi.mock("../i18n", () => ({ tr: (value: string) => value, useLocale: () => "zh" }));
import { WorkbenchScreen } from "./screen";
const savePreferences = vi.fn();
const base = {
  hosts: [{ id: "host-a", name: "Host A", status: "online" }],
  projects: [
    {
      id: "display-1",
      name: "Project One",
      instances: [{ serverId: "host-a", projectId: "native-1", path: "/one" }],
      workspaceCount: 0,
    },
  ],
  workspaces: [
    {
      id: "native-workspace",
      serverId: "host-a",
      projectId: "native-1",
      name: "Main",
      path: "/one",
    },
  ],
  sessions: [{ id: "agent", serverId: "host-a", workspaceId: "ai", title: "AI session" }],
  preferences: { layout: "C", tabs: [], favorites: [], focusTasks: [], scenarioProjects: {} },
  memories: [],
  skills: [],
  plans: [],
  loading: false,
  editable: true,
  ai: { initialized: true, serverId: "host-a", workspaceId: "ai", providers: [] },
  refresh: vi.fn(),
  search: vi.fn(),
  savePreferences,
} as unknown as WorkbenchModel;
const props = {
  theme: { colors: {} },
  host: { id: "host-a", label: "Host A" },
  layout: { compact: false, platform: "web" },
  params: {},
  navigation: { openWorkspace: vi.fn(), openAgent: vi.fn() },
} as unknown as PluginScreenProps;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
function Harness({ initial = base }: { initial?: WorkbenchModel }) {
  const [preferences, setPreferences] = useState(initial.preferences);
  return (
    <WorkbenchScreen
      {...props}
      model={{
        ...initial,
        preferences,
        savePreferences: async (update) => {
          savePreferences(update);
          setPreferences((current) => ({ ...current, ...update }));
        },
      }}
    />
  );
}
async function mount(initial?: WorkbenchModel) {
  const element = document.createElement("main");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root!.render(<Harness initial={initial} />));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text || button.getAttribute("aria-label") === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
it("preserves a session draft while switching C to A and back", async () => {
  await mount();
  const input = document.querySelector<HTMLInputElement>('[aria-label="Conversation draft"]')!;
  await act(async () => {
    input.value = "Keep this unsent thought";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("项目视图");
  expect(document.querySelector('[aria-label="Conversation draft"]')).toBeNull();
  await click("专注视图");
  expect(document.querySelector<HTMLInputElement>('[aria-label="Conversation draft"]')!.value).toBe(
    "Keep this unsent thought",
  );
});
it("assigns scenarios by display identity and keeps unclassified projects in All", async () => {
  await mount();
  await click("项目视图");
  expect(document.body.textContent).toContain("Project One");
  await click("Project One · 项目设置");
  const assign = document.querySelector<HTMLButtonElement>('[aria-label="Project One · 研发"]')!;
  await act(async () => assign.click());
  expect(savePreferences).toHaveBeenLastCalledWith({ scenarioProjects: { dev: ["display-1"] } });
  await click("筛选");
  await click("运维");
  expect(document.body.textContent).not.toContain("Project One");
  await click("研发");
  expect(document.body.textContent).toContain("Project One");
});

it("preserves an unsent draft when opening the AI creation shortcut", async () => {
  await mount();
  const input = document.querySelector<HTMLInputElement>('[aria-label="Conversation draft"]')!;
  await act(async () => {
    input.value = "Keep my current draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("项目视图");
  await click("让 AI 创建项目");
  expect(document.querySelector<HTMLInputElement>('[aria-label="Conversation draft"]')!.value).toBe(
    "Keep my current draft",
  );
});

it.each(["项目视图", "主机视图"])("opens native workspace tabs from %s", async (layout) => {
  await mount();
  await click(layout);
  if (layout === "项目视图") await click("Project One");
  await click("Main · Host A");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "host-a",
    workspaceId: "native-workspace",
  });
  expect(props.navigation!.openAgent).not.toHaveBeenCalled();
});

it("keeps an existing conversation primary and chooses an exact model from a collapsed searchable list", async () => {
  const providers = Array.from({ length: 32 }, (_, index) => ({
    id: JSON.stringify({ provider: "provider-a", model: `model-${index}` }),
    label: `Provider A / Model ${index}`,
  }));
  const newSession = vi.fn().mockResolvedValue({
    id: "created",
    serverId: "host-a",
    workspaceId: "ai",
    title: "New session",
  });
  await mount({ ...base, ai: { ...base.ai, providers }, newSession });
  expect(document.querySelector('[aria-label="Conversation draft"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="选择模型"]')).toBeNull();
  await click("新建会话");
  const picker = document.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!;
  expect(picker.textContent).toContain("Provider A / Model 0");
  expect(document.body.textContent).not.toContain("Provider A / Model 29");
  await act(async () => picker.click());
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索模型"]')!;
  await act(async () => {
    input.value = "Model 29";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.body.textContent).not.toContain("Provider A / Model 28");
  await click("Provider A / Model 29");
  expect(document.querySelector('[aria-label="搜索模型"]')).toBeNull();
  await click("创建会话");
  expect(newSession).toHaveBeenCalledWith({ provider: providers[29].id, title: "工作台对话" });
  expect(document.querySelector('[aria-label="选择模型"]')).toBeNull();
});

it("expands display workspace placement without exposing its original project membership", async () => {
  await mount({
    ...base,
    preferences: { ...base.preferences, layout: "A" },
    projects: [{ ...base.projects[0], workspaceRefs: [{ serverId: "remote", id: "moved" }] }],
    workspaces: [
      ...base.workspaces,
      {
        id: "moved",
        serverId: "remote",
        projectId: "other-project",
        name: "Moved workspace",
        path: "/moved",
      },
    ],
  });
  await click("Project One");
  expect(document.body.textContent).toContain("Moved workspace");
  expect(document.body.textContent).not.toContain("Main · Host A");
  await click("Moved workspace · remote");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "remote",
    workspaceId: "moved",
  });
});
