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
  workspaces: [],
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
} as PluginScreenProps;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
function Harness() {
  const [preferences, setPreferences] = useState(base.preferences);
  return (
    <WorkbenchScreen
      {...props}
      model={{
        ...base,
        preferences,
        savePreferences: async (update) => {
          savePreferences(update);
          setPreferences((current) => ({ ...current, ...update }));
        },
      }}
    />
  );
}
async function mount() {
  const element = document.createElement("main");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root!.render(<Harness />));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text,
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
  const assign = document.querySelector<HTMLButtonElement>('[aria-label="Project One · 研发"]')!;
  await act(async () => assign.click());
  expect(savePreferences).toHaveBeenLastCalledWith({ scenarioProjects: { dev: ["display-1"] } });
  await click("运维");
  expect(document.body.textContent).not.toContain("Project One");
  await click("研发");
  expect(document.body.textContent).toContain("Project One");
});
