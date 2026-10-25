import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { mountSidebarViewSwitcher } from "./view-switcher";
import { mountProjectSidebar, renderProjectSidebar } from "../web";
import { createCatalog } from "./catalog";
import { groupSidebarSnapshot } from "./group-projection";
import type { WorkbenchPreferences, WorkbenchProject } from "../workbench/types";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
let dom: JSDOM, cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  dom?.window.close();
  vi.unstubAllGlobals();
});
it("switches directly between workbench and native trees without a dropdown", async () => {
  dom = new JSDOM(
    '<aside><section id="native" style="display:flex"><div data-testid="sidebar-project-workspace-list-scroll">Native projects</div></section><footer data-testid="sidebar-footer"></footer></aside>',
  );
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "h", label: "Host", status: "online" }]);
  catalog.restore();
  catalog.update("h", {
    projects: [{ serverId: "h", projectId: "p", name: "P", root: "/p" }],
    workspaces: [],
  });
  const theme = {
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface0: "#111",
      surface1: "#222",
      border: "#333",
    },
  } as never;
  const render = (root: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(root, {
      snapshot: catalog.read(),
      theme,
      readOnly: true,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
    });
  const mount = mountProjectSidebar(render);
  mount.setEnabled(false);
  const options = {
    view: "native" as "native" | "workbench",
    theme,
    select(view: "native" | "workbench") {
      options.view = view;
      mount.setEnabled(view === "workbench");
      mount.update(render);
      selector.update(options);
    },
  };
  const selector = mountSidebarViewSwitcher(options);
  cleanup = () => {
    selector.dispose();
    mount.dispose();
  };
  const document = dom.window.document;
  expect(document.querySelector("select")).toBeNull();
  const workbench = document.querySelector<HTMLButtonElement>('button[aria-label="工作台视图"]')!;
  const native = document.querySelector<HTMLButtonElement>('button[aria-label="原生视图"]')!;
  expect(native.getAttribute("aria-selected")).toBe("true");
  expect(document.getElementById("native")!.style.display).toBe("flex");
  expect(document.querySelector("[data-toolkit-project-tree]")).toBeNull();
  workbench.click();
  expect(workbench.getAttribute("aria-selected")).toBe("true");
  expect(document.getElementById("native")!.style.display).toBe("none");
  const tree = document.querySelector("[data-toolkit-project-tree]")!;
  expect(tree.textContent).toContain("P");
  expect(tree.querySelector('[aria-label="项目操作 · P"]')?.getAttribute("disabled")).toBe("true");
  expect(tree.querySelector('[aria-label="新建 workspace · P"]')?.getAttribute("disabled")).toBe(
    "true",
  );
  catalog.organize(catalog.read().tree);
  catalog.update("h", { projects: [], workspaces: [] });
  mount.update(render);
  expect(tree.querySelector('[aria-label="P"]')).not.toBeNull();
  for (let i = 0; i < 4; i++) selector.update(options);
  await Promise.resolve();
  expect(document.querySelectorAll("[data-toolkit-view-switcher]")).toHaveLength(1);
  expect(document.querySelector('button[aria-label="工作台视图"]')).toBe(workbench);
  native.click();
  expect(native.getAttribute("aria-selected")).toBe("true");
  expect(document.querySelector("[data-toolkit-project-tree]")).toBeNull();
  expect(document.getElementById("native")!.textContent).toBe("Native projects");
  cleanup();
  expect(document.querySelector("[data-toolkit-view-switcher]")).toBeNull();
});
it("keeps repeated projects and workspaces independent across groups, refreshes and folding", () => {
  dom = new JSDOM(
    '<aside><section><div data-testid="sidebar-project-workspace-list-scroll">Native</div></section><footer data-testid="sidebar-footer"></footer></aside>',
    { url: "https://paseo.local/" },
  );
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "h", label: "Host", status: "online" }]);
  catalog.restore();
  catalog.update("h", {
    projects: [{ serverId: "h", projectId: "p", name: "P", root: "/p" }],
    workspaces: [{ serverId: "h", projectId: "p", id: "w", name: "W", cwd: "/p" }],
    sessions: [{ id: "s", workspaceId: "w", title: "Session", updatedAt: "2026-10-25T00:00:00Z" }],
  });
  const original = catalog.read(),
    id = original.tree.nodes[0]!.id;
  const projects: WorkbenchProject[] = [
    {
      id,
      name: "P",
      instances: [{ serverId: "h", projectId: "p", path: "/p" }],
      workspaceCount: 1,
    },
  ];
  const preferences: WorkbenchPreferences = {
    layout: "A",
    tabs: [
      { id: "first", name: "First", kind: "favorites" },
      { id: "second", name: "Second", kind: "manual", projectIds: [id] },
    ],
    favorites: [id],
    focusTasks: [],
  };
  const closed = new Set<string>();
  const render = (root: Parameters<typeof renderProjectSidebar>[0]) => {
    const snapshot = groupSidebarSnapshot(original, preferences, projects);
    renderProjectSidebar(root, {
      snapshot,
      projectSourceId: (id) => snapshot.projectSources.get(id) ?? id,
      groupDisplay(id) {
        const group = preferences.tabs.find((tab) => tab.id === snapshot.groupIds.get(id));
        if (!group) return;
        return {
          workspacesOnly: !!group.workspacesOnly,
          disabled: false,
          toggle() {
            group.workspacesOnly = !group.workspacesOnly;
            mount.update(render);
          },
        };
      },
      readOnly: true,
      sessionVisibility: new Map([[id, true]]),
      openSession() {},
      theme: { colors: {} } as never,
      collapsed: closed,
      toggle(id) {
        if (closed.has(id)) closed.delete(id);
        else closed.add(id);
        mount.update(render);
      },
      open() {},
      native() {},
    });
  };
  const mount = mountProjectSidebar(render);
  cleanup = mount.dispose;
  const rows = () => [...dom.window.document.querySelectorAll('[data-toolkit-workspace="w"]')];
  const first = rows();
  expect(first).toHaveLength(2);
  expect(dom.window.document.querySelectorAll('[data-toolkit-session="s"]')).toHaveLength(2);
  expect(first[0]).not.toBe(first[1]);
  mount.update(render);
  expect(rows()).toEqual(first);
  dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="First (1)"]')!.click();
  expect(rows()).toHaveLength(1);
  dom.window.document.querySelector<HTMLButtonElement>('button[aria-label="First (1)"]')!.click();
  expect(rows()).toHaveLength(2);
  expect(rows()[1]).toBe(first[1]);
  const document = dom.window.document;
  const projectsInTree = () => document.querySelectorAll('button[aria-label="P"]');
  expect(projectsInTree()).toHaveLength(2);
  document.querySelector<HTMLButtonElement>('button[aria-label="分组操作 · First (1)"]')!.click();
  const toggle = document.querySelector<HTMLButtonElement>(
    '[role="menuitemcheckbox"][aria-label="只显示工作空间"]',
  )!;
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  toggle.click();
  expect(preferences.tabs[0]!.workspacesOnly).toBe(true);
  expect(projectsInTree()).toHaveLength(1);
  expect(rows()).toHaveLength(2);
  mount.update(render);
  expect(projectsInTree()).toHaveLength(1);
  document.querySelector<HTMLButtonElement>('button[aria-label="分组操作 · First (1)"]')!.click();
  const checked = document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!;
  expect(checked.getAttribute("aria-checked")).toBe("true");
  checked.click();
  expect(projectsInTree()).toHaveLength(2);
  expect(rows()).toHaveLength(2);
  expect(preferences.tabs[1]!.workspacesOnly).toBeUndefined();
});
