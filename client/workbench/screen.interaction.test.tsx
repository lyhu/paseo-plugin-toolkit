// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode, type Ref } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { WorkbenchModel } from "./types";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): { render(node: ReactNode): void; unmount(): void };
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const copyTextMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("react-native", () => {
  const block =
    (tag: string) =>
    ({
      children,
      ref,
      testID,
      style,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      ref?: Ref<HTMLElement>;
      testID?: string;
      style?: object;
      accessibilityLabel?: string;
    }) =>
      createElement(
        tag,
        { ref, "data-testid": testID, style, "aria-label": accessibilityLabel },
        children,
      );
  return {
    Platform: { OS: "web" },
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
vi.mock("@getpaseo/plugin/client/ui", () => ({
  copyText: copyTextMock,
  Icon: () => null,
  Modal: Object.assign(
    ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? createElement("div", { role: "dialog" }, children) : null,
    { Content: ({ children }: { children: ReactNode }) => createElement("div", null, children) },
  ),
}));
vi.mock("../i18n", () => ({ tr: (value: string) => value, useLocale: () => "zh" }));
import { WorkbenchScreen } from "./screen";
const savePreferences = vi.fn();
const base = {
  nativeProjects: [
    {
      id: "native-project",
      name: "Project One",
      instances: [{ serverId: "host-a", projectId: "native-1", path: "/one" }],
      workspaceCount: 1,
    },
  ],
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
  ai: { initialized: true, serverId: "host-a", workspaceId: "ai" },
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
  localStorage.removeItem("toolkit.project-tree.host-a.workbench.view");
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
          await savePreferences(update);
          setPreferences((current) => ({ ...current, ...update }));
        },
      }}
    />
  );
}
async function mount(initial?: WorkbenchModel) {
  const model = initial ?? base;
  const projects = model.projects.map((project) => ({
    ...project,
    nativeGroup: project.nativeGroup ?? {
      viewKey: project.instances[0]?.projectId ?? project.id,
      name: project.name,
      members: project.instances.map(({ serverId, projectId }) => ({ serverId, projectId })),
    },
  }));
  for (const project of projects) {
    const source = document.createElement("div");
    source.setAttribute("data-testid", `sidebar-project-row-${project.nativeGroup.viewKey}`);
    source.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const menu = document.createElement("div");
      menu.setAttribute("data-menu-surface", "true");
      for (const action of ["open-settings", "remove"]) {
        const item = document.createElement("button");
        item.setAttribute("data-menu-item", "true");
        item.setAttribute(
          "data-testid",
          `sidebar-project-menu-${action}-${project.nativeGroup.viewKey}`,
        );
        menu.append(item);
      }
      document.body.append(menu);
      document.body.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") menu.remove();
        },
        { once: true },
      );
    });
    document.body.append(source);
  }
  const element = document.createElement("main");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root!.render(<Harness initial={{ ...model, projects }} />));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent === text ||
      button.textContent?.startsWith(`${text} (`) ||
      button.getAttribute("aria-label") === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
it("shows the five most recently active projects per Host and expands them independently in both views", async () => {
  const nativeProjects = ["host-a", "host-b"].flatMap((serverId) =>
    Array.from({ length: 7 }, (_, i) => ({
      id: `${serverId}-${i}`,
      name: `${serverId} Project ${i}`,
      instances: [
        {
          serverId,
          projectId: `p${i}`,
          path: `/${serverId}/${i}`,
          branch: "feature/very-long-branch-name",
        },
      ],
      workspaceCount: 1,
      lastActivityAt: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
    })),
  );
  await mount({
    ...base,
    nativeProjects,
    hosts: [...base.hosts, { id: "host-b", name: "Host B", status: "online" }],
    preferences: { ...base.preferences, layout: "B" },
    workspaces: nativeProjects.map((p) => ({
      id: p.id,
      projectId: p.instances[0]!.projectId,
      serverId: p.instances[0]!.serverId,
      name: `Workspace ${p.id}`,
      path: p.instances[0]!.path,
    })),
  });
  const ids = (host: string) =>
    [...document.querySelectorAll(`[data-testid^="workbench-host-project:${host}:"]`)].map((e) =>
      e.getAttribute("data-testid")!.split(":").at(-1),
    );
  expect(ids("host-a")).toEqual([6, 5, 4, 3, 2].map((i) => `host-a-${i}`));
  expect(ids("host-b")).toHaveLength(5);
  expect(document.querySelector('[aria-label="Host A · 更多项目"]')?.textContent).toContain(
    "更多（2）",
  );
  await click("Host A · 更多项目");
  expect(ids("host-a")).toHaveLength(7);
  expect(ids("host-b")).toHaveLength(5);
  expect(document.querySelector('[aria-label="Host A · 更多项目"]')).toBeNull();
  await click("列表");
  expect(ids("host-a")).toHaveLength(7);
  await click("Host B · 更多项目");
  expect(ids("host-b")).toHaveLength(7);
  await click("Workspace host-b-0 · Host B");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "host-b",
    workspaceId: "host-b-0",
  });
});
it("reopens the last project group instead of returning to All", async () => {
  const model: WorkbenchModel = {
    ...base,
    projects: [...base.projects, { ...base.projects[0]!, id: "outside", name: "Outside group" }],
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [{ id: "ops", name: "运维车间", kind: "manual", projectIds: ["display-1"] }],
    },
  };
  await mount(model);
  await click("运维车间");
  expect(document.querySelector('[aria-label="Outside group"]')).toBeNull();
  await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  await mount(model);
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Outside group"]')).toBeNull();
  expect(JSON.parse(localStorage.getItem("toolkit.project-tree.host-a.workbench.view")!).tab).toBe(
    "ops",
  );
});
it("shares persisted Host drag order between matrix and list views without moving projects", async () => {
  await mount({
    ...base,
    preferences: { ...base.preferences, layout: "B" },
    hosts: [
      base.hosts[0]!,
      { id: "host-b", name: "Host B", status: "offline" },
      { id: "host-c", name: "Host C", status: "online" },
    ],
  });
  const ids = () =>
    [...document.querySelectorAll('[data-testid^="workbench-host-node:"]')].map(
      (node) => node.getAttribute("data-testid")!.split(":")[1],
    );
  async function drag(source: string, target: string, x: number, y: number) {
    const handle = document.querySelector(`[data-testid="workbench-host-handle:${source}"]`)!;
    expect(handle.getAttribute("draggable")).toBe("true");
    const card = document.querySelector(`[data-testid="workbench-host-node:${target}"]`)!;
    card.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      width: 200,
      height: 200,
      right: 300,
      bottom: 300,
      x: 100,
      y: 100,
      toJSON() {},
    });
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("dragstart", { bubbles: true }));
      const over = new MouseEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      card.dispatchEvent(over);
      expect(over.defaultPrevented).toBe(true);
      expect((card as HTMLElement).style.boxShadow).toContain("inset");
      card.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
      );
    });
  }
  await drag("host-c", "host-a", 110, 290);
  expect(ids()).toEqual(["host-c", "host-a", "host-b"]);
  expect(savePreferences).toHaveBeenLastCalledWith({ hostOrder: ["host-c", "host-a", "host-b"] });
  await click("列表");
  expect(ids()).toEqual(["host-c", "host-a", "host-b"]);
  await drag("host-c", "host-b", 110, 290);
  expect(ids()).toEqual(["host-a", "host-b", "host-c"]);
  await click("矩阵");
  expect(ids()).toEqual(["host-a", "host-b", "host-c"]);
  expect(
    document.querySelector('[data-testid="workbench-host-node:host-a"]')!.textContent,
  ).toContain("Project One");
  expect(savePreferences).toHaveBeenCalledTimes(2);
});
it("shows native projects and workspace membership in operations despite custom organization", async () => {
  await mount({
    ...base,
    preferences: { ...base.preferences, layout: "B" },
    projects: [
      {
        ...base.projects[0]!,
        name: "Renamed display group",
        workspaceRefs: [{ serverId: "host-a", id: "foreign" }],
      },
    ],
    workspaces: [
      ...base.workspaces,
      {
        id: "foreign",
        serverId: "host-a",
        projectId: "other-project",
        name: "Moved in display only",
        path: "/foreign",
      },
    ],
  });
  const host = document.querySelector('[data-testid="workbench-host-node:host-a"]')!;
  expect(host.textContent).toContain("Project One");
  expect(host.textContent).toContain("Main");
  expect(host.textContent).not.toContain("Renamed display group");
  expect(host.textContent).not.toContain("Moved in display only");
  await click("复制路径 · /one");
  expect(copyTextMock).toHaveBeenCalledWith("/one");
  expect(document.querySelector('[aria-label="已复制 · /one"]')).not.toBeNull();
  await click("Main · Host A");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "host-a",
    workspaceId: "native-workspace",
  });
});
it("persists group and project drag order while All remains fixed and editing preserves position", async () => {
  const second = { ...base.projects[0]!, id: "display-2", name: "Second" };
  await mount({
    ...base,
    projects: [...base.projects, second],
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [
        { id: "first", name: "First", kind: "manual", projectIds: ["display-1", "display-2"] },
        { id: "last", name: "Last", kind: "favorites" },
      ],
    },
  });
  async function drag(source: string, target: string) {
    const from = document.querySelector(`[data-testid="${source}"]`)!;
    const to = document.querySelector(`[data-testid="${target}"]`)!;
    expect(from.getAttribute("draggable")).toBe("true");
    to.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      right: 300,
      bottom: 200,
      x: 100,
      y: 100,
      toJSON() {},
    });
    await act(async () => {
      from.dispatchEvent(new MouseEvent("dragstart", { bubbles: true }));
      to.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true, clientX: 110, clientY: 110 }),
      );
    });
  }
  const all = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("全部项目"),
  )!;
  expect(all.closest('[draggable="true"]')).toBeNull();
  await drag("workbench-group:last", "workbench-group:first");
  expect(savePreferences.mock.lastCall?.[0].tabs.map((t: { id: string }) => t.id)).toEqual([
    "last",
    "first",
  ]);
  await click("First");
  await drag("workbench-group-project-handle:display-2", "workbench-group-project:display-1");
  expect(savePreferences.mock.lastCall?.[0].tabs[1].projectOrder).toEqual([
    "display-2",
    "display-1",
  ]);
  expect(
    [...document.querySelectorAll('[data-testid^="workbench-group-project:"]')].map((n) =>
      n.getAttribute("data-testid"),
    ),
  ).toEqual(["workbench-group-project:display-2", "workbench-group-project:display-1"]);
  await click("编辑分组");
  await click("保存分组");
  expect(savePreferences.mock.lastCall?.[0].tabs.map((t: { id: string }) => t.id)).toEqual([
    "last",
    "first",
  ]);
});
it("assigns scenarios by display identity and keeps unclassified projects in All", async () => {
  await mount();
  await click("项目视图");
  expect(document.body.textContent).toContain("Project One");
  await click("Project One · 项目操作");
  await click("分组与场景");
  const assign = document.querySelector<HTMLButtonElement>('[aria-label="Project One · 研发"]')!;
  await act(async () => assign.click());
  expect(savePreferences).toHaveBeenLastCalledWith({ scenarioProjects: { dev: ["display-1"] } });
  await click("筛选");
  await click("运维");
  expect(document.body.textContent).not.toContain("Project One");
  await click("研发");
  expect(document.body.textContent).toContain("Project One");
});

it.each(["项目视图", "全域总览"])("opens native workspace tabs from %s", async (layout) => {
  await mount();
  await click(layout);
  await click("Main · Host A");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "host-a",
    workspaceId: "native-workspace",
  });
  expect(props.navigation!.openAgent).not.toHaveBeenCalled();
});

it.each(["矩阵", "列表"])(
  "shares overview favorites with the search space in %s view",
  async (view) => {
    const project = base.nativeProjects[0]!;
    await mount({
      ...base,
      projects: [project],
      preferences: { ...base.preferences, layout: "B" },
    });
    await click(view);
    const card = document.querySelector('[data-testid^="workbench-host-project:"]')!;
    expect(card.querySelector('[aria-label="收藏项目 · Project One"]')).toBeTruthy();
    await click("收藏项目 · Project One");
    const tabs = [{ id: "favorites", name: "收藏项目", kind: "favorites" }];
    expect(savePreferences).toHaveBeenLastCalledWith({ favorites: [project.id], tabs });
    expect(card.querySelector('[aria-label="取消收藏 · Project One"]')).toBeTruthy();
    expect(props.navigation!.openWorkspace).not.toHaveBeenCalled();

    await click("项目视图");
    await click("收藏项目");
    expect(
      document.querySelector(`[data-testid='workbench-group-project:${project.id}']`),
    ).toBeTruthy();

    await click("全域总览");
    await click("取消收藏 · Project One");
    expect(savePreferences).toHaveBeenLastCalledWith({ favorites: [], tabs });
    await click("项目视图");
    expect(
      document.querySelector(`[data-testid='workbench-group-project:${project.id}']`),
    ).toBeNull();
  },
);

it("keeps overview favorites unchanged and shows save failures", async () => {
  savePreferences.mockRejectedValueOnce(new Error("Cannot save favorites"));
  await mount({ ...base, preferences: { ...base.preferences, layout: "B" } });
  await click("收藏项目 · Project One");
  expect(document.body.textContent).toContain("Cannot save favorites");
  expect(document.querySelector('[aria-label="收藏项目 · Project One"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="取消收藏 · Project One"]')).toBeNull();
});

it("disables overview favorites when preferences are read-only and hides them for system projects", async () => {
  await mount({
    ...base,
    editable: false,
    nativeProjects: [
      base.nativeProjects[0]!,
      { ...base.nativeProjects[0]!, id: "system", name: "System", system: true },
    ],
    preferences: { ...base.preferences, layout: "B" },
  });
  const favorite = document.querySelector<HTMLButtonElement>(
    '[aria-label="收藏项目 · Project One"]',
  )!;
  expect(favorite.disabled).toBe(true);
  expect(document.querySelector('[aria-label="收藏项目 · System"]')).toBeNull();
  await act(async () => favorite.click());
  expect(savePreferences).not.toHaveBeenCalled();
});

it("lists explicit workspace references immediately and opens their native Host", async () => {
  await mount({
    ...base,
    hosts: [...base.hosts, { id: "remote", name: "remote", status: "online" }],
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
  expect(document.body.textContent).toContain("Moved workspace");
  expect(document.body.textContent).not.toContain("Main · Host A");
  await click("Moved workspace · remote");
  expect(props.navigation!.openWorkspace).toHaveBeenCalledWith({
    serverId: "remote",
    workspaceId: "moved",
  });
});

it("adds an existing project after creating an empty manual group", async () => {
  await mount({ ...base, preferences: { ...base.preferences, layout: "A" } });
  await click("新建分组");
  const name = document.querySelector<HTMLInputElement>('[aria-label="分组名称"]')!;
  await act(async () => {
    name.value = "My delivery group";
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("保存分组");
  expect(document.body.textContent).toContain("My delivery group");
  await click("添加项目");
  await click("选择项目 Project One");
  await click("加入分组");
  expect(savePreferences.mock.lastCall?.[0].tabs[0]).toMatchObject({
    name: "My delivery group",
    kind: "manual",
    projectIds: ["display-1"],
  });
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
});

it("keeps selected projects across picker filters and reveals the added project after saving", async () => {
  const initial = {
    ...base,
    hosts: [...base.hosts, { id: "host-b", name: "Host B", status: "offline" }],
    projects: [
      ...base.projects,
      {
        id: "display-2",
        name: "Project Two",
        instances: [{ serverId: "host-b", projectId: "native-2", path: "/two" }],
        workspaceCount: 0,
      },
    ],
    preferences: {
      ...base.preferences,
      layout: "A" as const,
      tabs: [
        { id: "manual", name: "My group", kind: "manual" as const, projectIds: ["display-1"] },
      ],
    },
  };
  await mount(initial);
  await click("My group");
  await click("筛选");
  await click("Host A");
  await click("添加项目");
  await click("筛选项目 Host B");
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索已有项目"]')!;
  await act(async () => {
    input.value = "/two";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("选择项目 Project Two");
  await act(async () => {
    input.value = "missing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.body.textContent).toContain("没有匹配的项目");
  await click("加入分组");
  expect(savePreferences.mock.lastCall?.[0].tabs[0].projectIds).toEqual(["display-1", "display-2"]);
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Project Two"]')).not.toBeNull();
});

it("cancels project selection without changing a group", async () => {
  await mount({
    ...base,
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [{ id: "manual", name: "My group", kind: "manual", projectIds: [] }],
    },
  });
  await click("My group");
  await click("添加项目");
  await click("选择项目 Project One");
  await click("取消");
  expect(savePreferences).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="Project One"]')).toBeNull();
});

it("keeps failed project selection open for retry without losing its choices", async () => {
  await mount({
    ...base,
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [{ id: "manual", name: "My group", kind: "manual", projectIds: [] }],
    },
  });
  await click("My group");
  await click("添加项目");
  await click("选择项目 Project One");
  savePreferences.mockRejectedValueOnce(new Error("Group save failed"));
  await click("加入分组");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Group save failed");
  expect(document.querySelector('[aria-label="Project One"]')).toBeNull();
  await click("加入分组");
  expect(savePreferences.mock.lastCall?.[0].tabs[0].projectIds).toEqual(["display-1"]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("removes a project from one group while retaining its favorite entry", async () => {
  await mount({
    ...base,
    preferences: {
      ...base.preferences,
      layout: "A",
      favorites: ["display-1"],
      tabs: [
        { id: "manual", name: "My group", kind: "manual", projectIds: ["display-1"] },
        { id: "favorites", name: "Favorites", kind: "favorites" },
      ],
    },
  });
  await click("My group");
  await click("Project One · 项目操作");
  await click("分组与场景");
  await click("移出分组");
  expect(savePreferences.mock.lastCall?.[0].tabs[0].projectIds).toEqual([]);
  expect(document.querySelector('[aria-label="Project One"]')).toBeNull();
  await click("Favorites");
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
});

it("adds projects from All to a visible favorites group without changing manual groups", async () => {
  await mount({
    ...base,
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [{ id: "manual", name: "My group", kind: "manual", projectIds: [] }],
    },
  });
  await click("添加项目");
  await click("选择项目 Project One");
  await click("保存选择");
  expect(savePreferences.mock.lastCall?.[0]).toMatchObject({
    favorites: ["display-1"],
    tabs: [
      { id: "manual", projectIds: [] },
      { id: "favorites", kind: "favorites" },
    ],
  });
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
});

it("keeps Host groups automatic when saving a manual project selection", async () => {
  await mount({
    ...base,
    preferences: {
      ...base.preferences,
      layout: "A",
      tabs: [
        { id: "host-tab", name: "Host group", kind: "host", hostId: "host-a" },
        { id: "favorites", name: "Favorites", kind: "favorites" },
      ],
    },
  });
  await click("Host group");
  await click("添加项目");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Host 分组按资源归属自动更新",
  );
  await click("选择项目 Project One");
  await click("保存选择");
  expect(savePreferences.mock.lastCall?.[0]).toEqual({ favorites: ["display-1"] });
  expect(document.body.textContent).toContain("Host group");
});

it("creates a group with its initial project selection in the same dialog", async () => {
  await mount({ ...base, preferences: { ...base.preferences, layout: "A" } });
  await click("新建分组");
  const input = document.querySelector<HTMLInputElement>('[aria-label="分组名称"]')!;
  await act(async () => {
    input.value = "Launch group";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("选择项目 Project One");
  await click("保存分组");
  expect(savePreferences.mock.lastCall?.[0].tabs[0]).toMatchObject({
    name: "Launch group",
    projectIds: ["display-1"],
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="Project One"]')).not.toBeNull();
});

it("counts available projects for every group, independently of display filters", async () => {
  await mount({
    ...base,
    hosts: [...base.hosts, { id: "host-b", name: "Host B", status: "online" }],
    projects: [
      ...base.projects,
      {
        id: "display-2",
        name: "Project Two",
        instances: [{ serverId: "host-b", projectId: "native-2", path: "/two" }],
        workspaceCount: 0,
      },
      { id: "system", name: "AI", system: true, instances: [], workspaceCount: 1 },
    ],
    preferences: {
      ...base.preferences,
      layout: "A",
      favorites: ["display-1", "display-1", "missing", "system"],
      tabs: [
        { id: "favorites", name: "Favorites", kind: "favorites" },
        {
          id: "manual",
          name: "Manual",
          kind: "manual",
          projectIds: ["display-2", "missing", "display-2"],
        },
        { id: "host", name: "Host group", kind: "host", hostId: "host-a" },
      ],
    },
  });
  const labels = () => [...document.querySelectorAll("button")].map((button) => button.textContent);
  const counts = ["全部项目 (3)", "Favorites (1)", "Manual (1)", "Host group (1)"];
  expect(labels()).toEqual(expect.arrayContaining(counts));
  await click("筛选");
  await click("Host A");
  expect(labels()).toEqual(expect.arrayContaining(counts));
  await click("Manual");
  expect(document.querySelector('[aria-label="Project Two"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Project One"]')).toBeNull();
  expect(labels()).toEqual(expect.arrayContaining(counts));
});
