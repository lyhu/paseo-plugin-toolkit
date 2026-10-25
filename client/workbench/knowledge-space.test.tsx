// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import {
  KnowledgeContextPanel,
  KnowledgeSpaceEntry,
  useKnowledgeSpaceHeader,
} from "./knowledge-space";
import type { WorkbenchModel } from "./types";
import { initializePersonalAI } from "../../shared/workbench/ai";
import { registerWorkbench } from "./register";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): { render(node: ReactNode): void; unmount(): void };
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("react-native", () => {
  const block = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Platform: { OS: "web" },
    View: block,
    ScrollView: block,
    Text: block,
    Pressable: ({ children, onPress, disabled, accessibilityLabel }: any) =>
      createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel },
        children,
      ),
    TextInput: ({ value, onChangeText, accessibilityLabel }: any) =>
      createElement("input", {
        value,
        "aria-label": accessibilityLabel,
        onChange: () => {},
        onInput: (event: any) => onChangeText(event.currentTarget.value),
      }),
  };
});
vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: () => null,
  SidebarRow: ({ label, onPress }: any) => createElement("button", { onClick: onPress }, label),
}));
vi.mock("../i18n", () => ({ tr: (value: string) => value, useLocale: () => "zh" }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
});
const props = {
  theme: { colors: {} },
  host: { id: "local", label: "Local" },
  layout: { compact: false, platform: "web" },
  params: {},
  navigation: { openWorkspace: vi.fn(), openAgent: vi.fn() },
} as unknown as PluginScreenProps;
async function render(node: ReactNode) {
  if (!root) {
    const element = document.createElement("main");
    document.body.append(element);
    root = createRoot(element);
  }
  await act(async () => root!.render(node));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text || button.getAttribute("aria-label") === text,
  );
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
it("opens the existing native workspace without another conversation UI or a new agent", async () => {
  const navigation = { openWorkspace: vi.fn(), openAgent: vi.fn() };
  const rpc = vi.fn(async () => ({
    initialized: true,
    serverId: "local",
    workspaceId: "existing",
  }));
  await render(
    <KnowledgeSpaceEntry {...props} navigation={navigation} client={{ rpc } as never} />,
  );
  expect(rpc).toHaveBeenCalledExactlyOnceWith(initializePersonalAI, {});
  expect(navigation.openWorkspace).toHaveBeenCalledExactlyOnceWith({
    serverId: "local",
    workspaceId: "existing",
  });
  expect(navigation.openAgent).not.toHaveBeenCalled();
  expect(document.querySelector("input")).toBeNull();
});
it("leaves failed or missing workspaces recoverable and retries only on user action", async () => {
  const navigation = { openWorkspace: vi.fn(), openAgent: vi.fn() };
  const rpc = vi
    .fn()
    .mockRejectedValueOnce(new Error("Existing data retained"))
    .mockResolvedValue({ serverId: "local", workspaceId: "existing" });
  await render(
    <KnowledgeSpaceEntry {...props} navigation={navigation} client={{ rpc } as never} />,
  );
  expect(document.body.textContent).toContain("Existing data retained");
  expect(navigation.openWorkspace).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledTimes(1);
  await click("重试");
  expect(navigation.openWorkspace).toHaveBeenCalledOnce();
});
it("does not navigate after the user leaves during initialization", async () => {
  const navigation = { openWorkspace: vi.fn(), openAgent: vi.fn() };
  let resolve!: (value: unknown) => void;
  const rpc = vi.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await render(
    <KnowledgeSpaceEntry {...props} navigation={navigation} client={{ rpc } as never} />,
  );
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => resolve({ serverId: "local", workspaceId: "existing" }));
  expect(navigation.openWorkspace).not.toHaveBeenCalled();
});
it("adds one scoped header entry, opens the right explorer and releases it on unmount", async () => {
  const remove = vi.fn(),
    openPanel = vi.fn(),
    addHeaderButton = vi.fn(() => ({ remove }));
  const client = { addHeaderButton, openPanel };
  const ai = { initialized: true, workspaceId: "reserved", serverId: "local" };
  function Header() {
    useKnowledgeSpaceHeader(client as never, ai);
    return null;
  }
  await render(<Header />);
  await render(<Header />);
  expect(addHeaderButton).toHaveBeenCalledOnce();
  const entry = (addHeaderButton.mock.calls[0] as unknown as [any])[0];
  expect(entry.workspaceId).toBe("reserved");
  entry.button.behavior.onPress();
  expect(openPanel).toHaveBeenCalledWith("knowledge-context", {
    workspaceId: "reserved",
    location: "explorer",
  });
  await act(async () => root!.unmount());
  root = undefined;
  expect(remove).toHaveBeenCalledOnce();
});
const model = {
  ai: { initialized: true, serverId: "local", workspaceId: "reserved" },
  skills: [
    { id: "skill", name: "Test skill", enabled: true, description: "Description", path: "/skill" },
  ],
  memories: [
    {
      id: "m",
      title: "A memory",
      body: "A confirmed memory",
      scope: "personal",
      confirmed: true,
      enabled: true,
    },
  ],
  projects: [
    {
      id: "project-ref",
      name: "Reference project",
      instances: [{ serverId: "remote", projectId: "native", path: "/reference" }],
    },
  ],
  hosts: [],
  plans: [],
  editable: true,
  toggleSkill: vi.fn(async () => {}),
  removeMemory: vi.fn(async () => {}),
  setAIReference: vi.fn(async () => {}),
} as unknown as WorkbenchModel;
it.each([false, true])(
  "manages skills, confirmed memory and reference projects in the native panel (compact=%s)",
  async (compact) => {
    model.toggleSkill = vi.fn(async () => {});
    model.removeMemory = vi.fn(async () => {});
    model.setAIReference = vi.fn(async () => {});
    await render(
      <KnowledgeContextPanel
        {...props}
        layout={{ ...props.layout, compact }}
        context="workspace"
        workspaceId="reserved"
        revision={0}
        tab={{} as never}
        model={model}
      />,
    );
    await click("停用");
    expect(model.toggleSkill).toHaveBeenCalledWith("skill", false);
    await click("仅个人记忆");
    await click("Reference project");
    expect(model.setAIReference).toHaveBeenCalledWith({
      id: "project-ref",
      name: "Reference project",
      instances: [{ serverId: "remote", projectId: "native", path: "/reference" }],
    });
    await click("记忆");
    expect(document.body.textContent).toContain("A confirmed memory");
    await click("删除");
    expect(model.removeMemory).not.toHaveBeenCalled();
    await click("确认删除");
    expect(model.removeMemory).toHaveBeenCalledWith("m");
    expect(document.body.textContent).not.toContain("移除工作区");
  },
);
it("does not expose personal context to another Host with the same workspace ID", async () => {
  await render(
    <KnowledgeContextPanel
      {...props}
      host={{ id: "other", label: "Other" }}
      context="workspace"
      workspaceId="reserved"
      revision={0}
      tab={{} as never}
      model={model}
    />,
  );
  expect(document.body.textContent).toContain("请在知行空间工作区中打开此面板。");
  expect(document.body.textContent).not.toContain("A confirmed memory");
  expect(document.body.textContent).not.toContain("Test skill");
});

it("opens skill content as a native file instead of expanding a copy in the context panel", async () => {
  window.history.replaceState({}, "", "/h/local/workspace/reserved");
  const consumeEmptyIntent = () => {
    if (new URLSearchParams(window.location.search).get("open") === "file:")
      window.history.replaceState({}, "", window.location.pathname);
  };
  window.addEventListener("popstate", consumeEmptyIntent);
  const nativeModel = {
    ...model,
    skills: [{ ...model.skills[0]!, content: "CONTENT_ONLY_IN_NATIVE_FILE" }],
  };
  await render(
    <KnowledgeContextPanel
      {...props}
      context="workspace"
      workspaceId="reserved"
      revision={0}
      tab={{} as never}
      model={nativeModel}
    />,
  );
  await click("Test skill · 查看内容");
  const intent = new URLSearchParams(window.location.search).get("open")!;
  expect(Buffer.from(intent.slice(5), "base64url").toString("utf8")).toBe("/skill");
  expect(document.body.textContent).not.toContain("CONTENT_ONLY_IN_NATIVE_FILE");
  window.removeEventListener("popstate", consumeEmptyIntent);
});

it("keeps only Workbench in the sidebar while retaining the context-panel registration", async () => {
  const addSidebarHeaderItem = vi.fn(() => () => {}),
    addWorkspacePanel = vi.fn(() => () => {});
  const dispose = registerWorkbench(
    {
      addSidebarHeaderItem,
      addWorkspacePanel,
      addScreen: () => () => {},
      addTheme: () => () => {},
    } as never,
    (() => model) as never,
  );
  const Sidebar = (addSidebarHeaderItem.mock.calls[0] as unknown as [any])[0].Component;
  const openScreen = vi.fn();
  await render(<Sidebar {...props} currentScreen={null} openScreen={openScreen} />);
  expect([...document.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
    "工作台",
  ]);
  await click("工作台");
  expect(openScreen).toHaveBeenCalledWith({ screenId: "workbench", params: { page: "home" } });
  expect((addWorkspacePanel.mock.calls[0] as unknown as [any])[0].id).toBe("knowledge-context");
  await dispose();
});
