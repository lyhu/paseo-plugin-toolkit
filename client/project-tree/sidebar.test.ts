import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { mirrorNativeWorkspace, mountProjectSidebar, renderProjectSidebar } from "../web";
import { createCatalog } from "./catalog";
import { applyTreeCommand, type TreeCommand } from "../../shared/project-tree/model";
import { mountProjectTreeMenu } from "./native-menu";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

function setup() {
  const dom = new JSDOM(
    `<aside><header>Navigation</header><section style="display:flex"><div data-testid="sidebar-project-workspace-list-scroll">Original projects</div></section><footer data-testid="sidebar-footer">Settings</footer></aside>`,
    { url: "https://paseo.local/" },
  );
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  vi.stubGlobal("window", dom.window);
  const original = dom.window.document.querySelector("section")!;
  const render = (container: { textContent: string | null }) => {
    container.textContent = "Toolkit tree";
  };
  const mount = mountProjectSidebar(render);
  dispose = mount.dispose;
  return { ...mount, document: dom.window.document, original };
}

it("nests workspace history, adds five at a time, and preserves expansion across refreshes", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "Mini", status: "online" },
  ]);
  catalog.restore();
  catalog.update("pro", {
    projects: [{ serverId: "pro", projectId: "p", name: "P", root: "/same" }],
    workspaces: [{ serverId: "pro", projectId: "p", id: "w", name: "W", cwd: "/same" }],
    sessions: [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `session-${index}`,
        workspaceId: "w",
        title: `Session ${index}`,
        updatedAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
      })),
      { id: "wrong-workspace", workspaceId: "other", title: "Wrong", updatedAt: "2026-10-22" },
    ],
  });
  catalog.update("mini", {
    projects: [],
    workspaces: [],
    sessions: [
      { id: "wrong-host", workspaceId: "w", title: "Wrong host", updatedAt: "2026-10-22" },
    ],
  });
  const sessionLimits = new Map<string, number>();
  const sessionVisibility = new Map<string, boolean>();
  let showSessionsByDefault = false;
  const openSession = vi.fn();
  const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: {
        colors: { foreground: "#fff", foregroundMuted: "#aaa", surface0: "#111", surface1: "#222" },
      } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
      openSession,
      sessionLimits,
      sessionVisibility,
      showSessionsByDefault,
      toggleSessions(id) {
        sessionVisibility.set(id, !(sessionVisibility.get(id) ?? showSessionsByDefault));
        update(render);
      },
    });
  update(render);
  const toggleVisibility = (label: string) => {
    (document.querySelector('[aria-label="项目操作 · P"]') as HTMLButtonElement).click();
    const entry = document.querySelector(
      `[role="menuitem"][aria-label="${label}"]`,
    ) as HTMLButtonElement;
    expect(entry.disabled).toBe(false);
    entry.click();
  };
  expect(document.querySelector('[data-toolkit-workspace-sessions="w"]')).toBeNull();
  expect(document.querySelectorAll('[data-toolkit-workspace-rule="w"]')).toHaveLength(2);
  toggleVisibility("显示会话列表");
  const list = () => document.querySelector('[data-toolkit-workspace-sessions="w"]')!;
  const sessions = () =>
    Array.from(list().querySelectorAll<HTMLButtonElement>("[data-toolkit-session]"));
  const click = (label: string) =>
    (list().querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click();
  expect(list().previousElementSibling?.getAttribute("data-toolkit-workspace-rule")).toBe("w");
  expect(
    list().previousElementSibling?.previousElementSibling?.getAttribute("data-toolkit-workspace"),
  ).toBe("w");
  expect(sessions()).toHaveLength(5);
  expect(sessions()[0]!.getAttribute("data-toolkit-session")).toBe("session-11");
  expect(sessions()[0]!.style.paddingLeft).toBe("32px");
  expect(
    sessions()[0]!.querySelector("[data-toolkit-session-icon] svg, svg[data-toolkit-session-icon]"),
  ).not.toBeNull();
  const workspaceRow = document.querySelector<HTMLElement>("[data-toolkit-workspace]")!;
  expect(workspaceRow.querySelector("[data-toolkit-workspace-icon]")).toBeNull();
  expect(workspaceRow.style.paddingLeft).toBe("16px");
  const rules = document.querySelectorAll<HTMLElement>('[data-toolkit-workspace-rule="w"]');
  expect(rules).toHaveLength(2);
  expect(workspaceRow.previousElementSibling).toBe(rules[0]);
  expect(rules[0]!.getAttribute("data-toolkit-workspace-rule-edge")).toBe("top");
  expect(rules[1]!.getAttribute("data-toolkit-workspace-rule-edge")).toBe("bottom");
  for (const rule of rules) {
    expect(rule.style.margin).toBe("4px 8px");
    expect(rule.getAttribute("aria-hidden")).toBe("true");
  }
  sessions()[0]!.click();
  expect(openSession).toHaveBeenCalledWith(
    expect.objectContaining({ serverId: "pro", id: "w" }),
    expect.objectContaining({ id: "session-11" }),
  );
  click("更多会话(7)");
  expect(sessions()).toHaveLength(10);
  expect(list().textContent).toContain("收起会话(5)");
  update(render);
  expect(sessions()).toHaveLength(10);
  click("更多会话(2)");
  expect(sessions()).toHaveLength(12);
  expect(list().textContent).not.toContain("更多");
  click("收起会话(7)");
  expect(sessions()).toHaveLength(5);
  expect(document.querySelector('[data-toolkit-session="wrong-workspace"]')).toBeNull();
  expect(document.querySelector('[data-toolkit-session="wrong-host"]')).toBeNull();
  toggleVisibility("隐藏会话列表");
  expect(document.querySelector('[data-toolkit-workspace-sessions="w"]')).toBeNull();
  expect(document.querySelectorAll('[data-toolkit-workspace-rule="w"]')).toHaveLength(2);
  expect(document.querySelector('[data-toolkit-workspace="w"]')).not.toBeNull();
  showSessionsByDefault = true;
  update(render);
  expect(document.querySelector('[data-toolkit-workspace-sessions="w"]')).toBeNull();
  sessionVisibility.clear();
  update(render);
  expect(sessions()).toHaveLength(5);
  showSessionsByDefault = false;
  update(render);
  expect(document.querySelector('[data-toolkit-workspace-sessions="w"]')).toBeNull();
});

it("uses the list's flex space, keeps navigation and restores its exact display on disposal", () => {
  const { original, document } = setup();
  expect(original.style.display).toBe("none");
  expect(original.previousElementSibling?.textContent).toBe("Toolkit tree");
  expect(document.querySelector("header")?.textContent).toBe("Navigation");
  expect(document.querySelector("footer")?.textContent).toBe("Settings");
  dispose!();
  expect(original.style.display).toBe("flex");
  expect(document.querySelector("[data-toolkit-project-tree]")).toBeNull();
});

it.each(["dark", "light"])(
  "renders readable escaped menus in the %s theme and removes them on unload",
  (theme) => {
    const { document, update } = setup();
    const catalog = createCatalog();
    catalog.restore({
      tree: {
        revision: 0,
        nodes: [{ id: "folder", kind: "folder", name: "Operations", parentId: null }],
      },
      catalogs: {},
    });
    catalog.connection(true);
    const run = vi.fn(async () => {});
    const colors = {
      foreground: theme === "dark" ? "#fff" : "#111",
      foregroundMuted: "#aaa",
      surface0: "#111",
      surface1: theme === "dark" ? "#222" : "#eee",
      surface2: theme === "dark" ? "#333" : "#ddd",
      accent: "#88f",
      accentForeground: "#fff",
      border: "#333",
    };
    update((container) =>
      renderProjectSidebar(container, {
        snapshot: catalog.read(),
        theme: { colors } as never,
        collapsed: new Set(),
        toggle() {},
        open() {},
        native() {},
        run,
      }),
    );
    const row = document.querySelector('[data-toolkit-tree-row="folder"]')!;
    const buttons = row.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
    expect((row as HTMLElement).style.backgroundColor).toBe(
      theme === "dark" ? "rgb(34, 34, 34)" : "rgb(238, 238, 238)",
    );
    buttons[0]!.dispatchEvent(new document.defaultView!.Event("mouseenter"));
    expect(buttons[0]!.style.backgroundColor).toBe("transparent");
    const rules = document.querySelector("style")!.textContent ?? "";
    const addRule = colors.surface1;
    expect(buttons[1]!.classList.contains("toolkit-row-action")).toBe(true);
    expect(buttons[1]!.getAttribute("data-toolkit-row-action")).toBe("sidebar");
    expect(rules).toContain(`background:${addRule}`);
    expect(buttons[2]!.getAttribute("data-toolkit-row-action")).toBe("surface2");
    expect(rules).toContain(`background:${colors.surface2}`);
    expect(rules).toContain("width:24px!important;height:24px!important");
    expect(rules).toContain(`color:${colors.foregroundMuted}`);
    expect(rules).toContain(`color:${colors.foreground}`);
    row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
    expect((row as HTMLElement).style.backgroundColor).toBe("transparent");
    expect(document.querySelector('[aria-label="管理"]')).toBeNull();
    buttons[1]!.click();
    const form = document.querySelector('[role="dialog"]')!;
    (form.querySelector("input") as HTMLInputElement).value = "Child";
    (form.querySelector('[aria-label="创建文件夹"]') as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ type: "folder", name: "Child", parentId: "folder" }),
    );
    buttons[2]!.click();
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.parentElement).toBe(document.body);
    const computed = document.defaultView!.getComputedStyle(menu);
    expect(computed.color).toBe(theme === "dark" ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)");
    expect(computed.fontSize).toBe("14px");
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(8);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(3);
    expect(document.activeElement).toBe(menu.querySelector("button"));
    const entries = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const enabled = entries.filter((entry) => !entry.disabled);
    const highlight = theme === "dark" ? "rgb(51, 51, 51)" : "rgb(221, 221, 221)";
    for (const entry of enabled) {
      entry.dispatchEvent(new document.defaultView!.Event("mouseenter"));
      expect(entry.style.backgroundColor).toBe(highlight);
      expect(entry.style.transition).toContain("background-color");
      expect(enabled.filter((other) => other.style.backgroundColor === highlight)).toEqual([entry]);
      entry.dispatchEvent(new document.defaultView!.Event("mouseleave"));
      expect(entry.style.backgroundColor).toBe("transparent");
    }
    const disabled = entries.find((entry) => entry.disabled)!;
    disabled.dispatchEvent(new document.defaultView!.Event("mouseenter"));
    expect(disabled.style.backgroundColor).toBe("transparent");
    menu.dispatchEvent(new document.defaultView!.KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(document.activeElement).toBe(enabled[1]);
    expect(enabled[1]!.style.backgroundColor).toBe(highlight);
    dispose!();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  },
);

it("switches back to native without leaving a blank flex container", () => {
  const { original, document, setEnabled } = setup();
  setEnabled(false);
  expect(original.style.display).toBe("flex");
  expect(document.querySelector("[data-toolkit-project-tree]")).toBeNull();
  setEnabled(true);
  expect(original.style.display).toBe("none");
});

it("adds the project tree only to the native Workspaces menu and cleans up across reopenings", async () => {
  const { document } = setup();
  vi.stubGlobal("MouseEvent", document.defaultView!.MouseEvent);
  const open = vi.fn();
  const remove = mountProjectTreeMenu({
    title: "工作台",
    theme: { colors: { foreground: "#fff", surface2: "#333", border: "#444" } } as never,
    open,
  });
  const stop = dispose!;
  dispose = () => {
    remove();
    stop();
  };
  const trigger = document.createElement("button");
  trigger.setAttribute("data-testid", "sidebar-display-preferences-menu");
  trigger.setAttribute("aria-expanded", "true");
  const close = vi.fn(() => trigger.setAttribute("aria-expanded", "false"));
  trigger.addEventListener("click", close);
  document.body.appendChild(trigger);
  const other = document.createElement("div");
  other.setAttribute("role", "menu");
  document.body.appendChild(other);
  const surface = document.createElement("div");
  surface.setAttribute("data-testid", "sidebar-display-preferences-content");
  surface.innerHTML =
    '<div class="page"><div><button data-testid="sidebar-display-grouping">分组</button></div><button data-testid="sidebar-display-show">显示</button><button>显示后台工作区</button></div>';
  document.body.appendChild(surface);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = surface.querySelector("[data-toolkit-project-tree-menu]")!;
  expect(entry.parentElement?.className).toBe("page");
  expect(entry.previousElementSibling?.textContent).toBe("显示后台工作区");
  expect(entry.querySelector('[role="separator"]')).not.toBeNull();
  expect(other.querySelector("[data-toolkit-project-tree-menu]")).toBeNull();
  const button = entry.querySelector("button")!;
  expect(surface.querySelector('[data-menu-item="true"]:not([data-menu-disabled="true"])')).toBe(
    button,
  );
  button.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  expect(button.style.backgroundColor).toBe("rgb(51, 51, 51)");
  button.click();
  expect(close).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  surface.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.appendChild(surface);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(surface.querySelectorAll("[data-toolkit-project-tree-menu]")).toHaveLength(1);
  remove();
  expect(surface.querySelector("[data-toolkit-project-tree-menu]")).toBeNull();
  expect(surface.querySelector('[data-testid="sidebar-display-grouping"]')).not.toBeNull();
});

it("offers root creation and the original view through the header settings menu", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.connection(true);
  const run = vi.fn(async () => {});
  const native = vi.fn();
  update((container) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: {
        colors: {
          foreground: "#fff",
          foregroundMuted: "#aaa",
          surface0: "#111",
          surface1: "#222",
          border: "#333",
        },
      } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native,
      run,
    }),
  );
  const settings = document.querySelector('[aria-label="我的工作台设置"]') as HTMLButtonElement;
  expect(settings).not.toBeNull();
  expect(settings.parentElement!.textContent).toBe("我的工作台");
  expect(settings.parentElement!.querySelectorAll("button")).toHaveLength(1);
  expect(settings.querySelector("svg")).not.toBeNull();
  settings.click();
  const entries = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(Array.from(entries, (entry) => entry.textContent)).toEqual([
    "新增树节点...",
    "显示隐藏节点",
    "切换原生视图",
  ]);
  const separator = document.querySelector('[role="menu"] [role="separator"]')!;
  expect(separator).not.toBeNull();
  expect(separator.previousElementSibling).toBe(entries[1]);
  expect(separator.nextElementSibling).toBe(entries[2]);
  entries[0]!.click();
  const form = document.querySelector('[role="dialog"]')!;
  (form.querySelector("input") as HTMLInputElement).value = "New root";
  (form.querySelector('[aria-label="创建文件夹"]') as HTMLButtonElement).click();
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({ type: "folder", name: "New root", parentId: null }),
  );
  settings.click();
  (document.querySelector('[aria-label="切换原生视图"]') as HTMLButtonElement).click();
  expect(native).toHaveBeenCalledOnce();
});

it("preserves native status ring rotation through cloning, state updates and disposal", async () => {
  const { document, original } = setup();
  const source = document.createElement("div");
  source.innerHTML =
    '<div data-testid="workspace-status-indicator-running"><div class="rotator"><div class="arc"></div></div></div>';
  original.appendChild(source);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const keyframes = [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }];
  const timing = { duration: 900, easing: "linear", iterations: Infinity };
  const nativeAnimation = {
    effect: { getKeyframes: () => keyframes, getTiming: () => timing },
    startTime: 0,
    cancel: vi.fn(),
  };
  const copies: Array<{ startTime: number | null; cancel: ReturnType<typeof vi.fn> }> = [];
  const animate = vi.fn(function (this: HTMLElement) {
    expect(this.className).toBe("rotator");
    const animation = { startTime: null, cancel: vi.fn() };
    copies.push(animation);
    return animation;
  });
  Object.defineProperty(document.defaultView!.Element.prototype, "animate", { value: animate });
  Object.defineProperty(source.querySelector(".rotator"), "getAnimations", {
    value: () => [nativeAnimation],
  });
  const unmirror = mirrorNativeWorkspace(source as never, target as never);
  expect(animate).toHaveBeenCalledWith(keyframes, timing);
  expect(copies[0]!.startTime).toBe(0);
  expect(target.querySelector(".arc")).not.toBeNull();

  source.setAttribute("aria-selected", "true");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(copies[0]!.cancel).toHaveBeenCalledOnce();
  expect(copies[1]!.startTime).toBe(0);

  source.innerHTML = '<div data-testid="workspace-status-indicator-done"></div>';
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(copies[1]!.cancel).toHaveBeenCalledOnce();
  expect(target.querySelector(".rotator")).toBeNull();
  expect(animate).toHaveBeenCalledTimes(2);

  // Reattach the same native animated element to exercise unload while running.
  const rotator = document.createElement("div");
  rotator.className = "rotator";
  Object.defineProperty(rotator, "getAnimations", { value: () => [nativeAnimation] });
  source.appendChild(rotator);
  await new Promise((resolve) => setTimeout(resolve, 0));
  unmirror();
  expect(copies[2]!.cancel).toHaveBeenCalledOnce();
  expect(nativeAnimation.cancel).not.toHaveBeenCalled();
});

it("mirrors the live native workspace row, delegates its menu, and drags only that Host's workspace", async () => {
  const { document, original, update } = setup();
  vi.stubGlobal("MouseEvent", document.defaultView!.MouseEvent);
  const source = document.createElement("div");
  source.setAttribute("data-testid", "sidebar-workspace-row-pro:w");
  source.setAttribute("aria-selected", "true");
  source.style.backgroundColor = "rgb(37, 39, 49)";
  source.innerHTML =
    '<div class="native-status" style="color:green">Active</div><span id="native-title">Workspace</span><span data-testid="sidebar-workspace-timestamp">6h</span><button data-testid="sidebar-workspace-kebab-pro:w">More</button>';
  original.appendChild(source);
  const nativeMenu = vi.fn((event: Event) => event.preventDefault());
  source.addEventListener("contextmenu", nativeMenu);
  const wrongHost = document.createElement("div");
  wrongHost.setAttribute("data-testid", "sidebar-workspace-row-mini:w");
  const otherMenu = vi.fn((event: Event) => event.preventDefault());
  wrongHost.addEventListener("contextmenu", otherMenu);
  original.appendChild(wrongHost);
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "Mini", status: "online" },
  ]);
  catalog.restore();
  catalog.update("pro", {
    projects: [{ serverId: "pro", projectId: "p", name: "Pro", root: "/p" }],
    workspaces: [
      { serverId: "pro", projectId: "p", id: "w", name: "Workspace", cwd: "/p" },
      { serverId: "pro", projectId: "p", id: "plain", name: "Plain", cwd: "/plain" },
      { serverId: "pro", projectId: "p", id: "/tmp/repo", name: "Path", cwd: "/tmp/repo" },
    ],
  });
  catalog.update("mini", {
    projects: [{ serverId: "mini", projectId: "m", name: "Mini", root: "/m" }],
    workspaces: [],
  });
  catalog.connection(true);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    surface2: "#2a2c31",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  const moveWorkspace = vi.fn(),
    move = vi.fn();
  const open = vi.fn();
  const toggleSessions = vi.fn();
  update((container) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open,
      native() {},
      move,
      moveWorkspace,
      toggleSessions,
      showSessionsByDefault: false,
    }),
  );
  const row = document.querySelector('[data-toolkit-workspace="w"]')!;
  expect(row.getAttribute("aria-selected")).toBe("true");
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(37, 39, 49)");
  expect(
    (row.querySelector('button [aria-hidden="true"]') as HTMLElement).style.backgroundColor,
  ).toBe("transparent");
  expect(row.querySelector(".native-status")?.textContent).toBe("Active");
  expect(row.querySelector("[data-testid],#native-title")).toBeNull();
  expect(row.querySelectorAll("button")).toHaveLength(2);
  const workspaceMore = row.querySelectorAll("button")[1]!;
  const actions = row.querySelector("[data-toolkit-tree-actions]") as HTMLElement;
  const time = row.querySelector("[data-toolkit-workspace-time]") as HTMLElement;
  // The overflow button overlays the row, so the timestamp keeps the right edge.
  expect(row.querySelector("[data-toolkit-workspace-scrim]")).toBeNull();
  expect(time.textContent).toBe("6h");
  expect(time.getAttribute("data-testid")).toBeNull();
  expect(actions.style.position).toBe("absolute");
  expect(actions.style.right).toBe("5px");
  expect(source.parentElement).toBe(original);
  expect(
    document.defaultView!.getComputedStyle(row.querySelector("[data-toolkit-tree-actions]")!)
      .opacity,
  ).toBe("1");
  source.style.backgroundColor = "transparent";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(row.getAttribute("aria-selected")).toBe("true");
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(37, 39, 49)");
  source.setAttribute("aria-selected", "false");
  await new Promise((resolve) => setTimeout(resolve, 0));
  row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  workspaceMore.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  expect((row as HTMLElement).style.backgroundColor).toBe("transparent");
  const plain = document.querySelector('[data-toolkit-workspace="plain"]') as HTMLElement;
  expect(plain).not.toBeNull();
  expect(plain.getAttribute("aria-selected")).toBe("false");
  window.history.pushState({}, "", "/h/pro/workspace/plain");
  expect(plain.getAttribute("aria-selected")).toBe("true");
  expect(plain.style.backgroundColor).toBe("rgb(42, 44, 49)");
  expect(row.getAttribute("aria-selected")).toBe("false");
  const encoded = btoa("/tmp/repo").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  window.history.pushState({}, "", `/h/pro/workspace/b64_${encoded}`);
  expect(plain.getAttribute("aria-selected")).toBe("false");
  const pathRow = document.querySelector('[data-toolkit-workspace="/tmp/repo"]') as HTMLElement;
  expect(pathRow.getAttribute("aria-selected")).toBe("true");
  expect(pathRow.style.backgroundColor).toBe("rgb(42, 44, 49)");
  window.history.pushState({}, "", "/");
  expect(pathRow.getAttribute("aria-selected")).toBe("false");
  const menu = document.createElement("div");
  menu.setAttribute("data-menu-surface", "true");
  const rename = document.createElement("button");
  rename.setAttribute("data-menu-item", "true");
  rename.textContent = "重命名";
  const archive = document.createElement("button");
  archive.setAttribute("data-menu-item", "true");
  archive.setAttribute("data-testid", "sidebar-workspace-menu-archive-pro:w");
  archive.textContent = "归档";
  menu.append(rename, archive);
  document.body.appendChild(menu);
  workspaceMore.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(nativeMenu).toHaveBeenCalledOnce();
  expect(otherMenu).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  const toggle = document.querySelector("[data-toolkit-workspace-session-toggle]") as HTMLElement;
  expect(toggle).not.toBeNull();
  expect(menu.children[1]).toBe(toggle);
  expect(menu.children[2]).toBe(archive);
  const toggleButton = toggle.querySelector("button")!;
  expect(toggleButton.getAttribute("aria-label")).toBe("显示会话");
  expect(toggle.querySelectorAll('[role="separator"]')).toHaveLength(2);
  expect(toggle.lastElementChild?.getAttribute("role")).toBe("separator");
  toggleButton.click();
  expect(toggleSessions).toHaveBeenCalledWith("pro:w");
  source.querySelector(".native-status")!.textContent = "Idle";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(row.querySelector(".native-status")!.textContent).toBe("Idle");
  const targetId = catalog.read().tree.nodes[1]!.id;
  const target = Array.from(document.querySelectorAll("[data-toolkit-tree-row]")).find(
    (entry) => entry.getAttribute("data-toolkit-tree-row") === targetId,
  )!;
  row.dispatchEvent(new document.defaultView!.Event("dragstart", { bubbles: true }));
  target.dispatchEvent(
    new document.defaultView!.Event("dragover", { bubbles: true, cancelable: true }),
  );
  expect(target.getAttribute("style")).toContain("outline");
  target.dispatchEvent(
    new document.defaultView!.Event("drop", { bubbles: true, cancelable: true }),
  );
  expect(moveWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ serverId: "pro", id: "w", projectId: "p" }),
    targetId,
  );
  expect(move).not.toHaveBeenCalled();
  source.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(row.querySelector(".native-status")).toBeNull();
  const replacement = source.cloneNode(true) as typeof source;
  replacement.querySelector(".native-status")!.textContent = "Reconnected";
  original.appendChild(replacement);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(row.querySelector(".native-status")!.textContent).toBe("Reconnected");
});

it("adds the host badge to a mirrored workspace row only when native omitted it", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "mini.local", status: "online" },
  ]);
  catalog.restore();
  catalog.update("mini", {
    projects: [{ serverId: "mini", projectId: "m", name: "Mini", root: "/m" }],
    workspaces: [
      { serverId: "mini", projectId: "m", id: "w", name: "Ops", cwd: "/m" },
      { serverId: "mini", projectId: "m", id: "badged", name: "Badged", cwd: "/m2" },
    ],
  });
  catalog.connection(true);
  const plain = document.createElement("div");
  plain.setAttribute("data-testid", "sidebar-workspace-row-mini:w");
  plain.innerHTML = "<div><div>Ops</div></div>";
  document.body.appendChild(plain);
  const badged = document.createElement("div");
  badged.setAttribute("data-testid", "sidebar-workspace-row-mini:badged");
  badged.innerHTML =
    '<div><div><div>Badged</div><div><div data-testid="host-badge-mini">mini.local</div></div></div></div>';
  document.body.appendChild(badged);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    surface2: "#333",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  update((container) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
    }),
  );
  const badgeOf = (row: Element) =>
    Array.from(row.querySelectorAll("div")).find(
      (entry) => entry.querySelector("svg") && entry.textContent?.trim() === "mini.local",
    );
  const injected = document.querySelector('[data-toolkit-workspace="w"]')!;
  const badge = badgeOf(injected);
  expect(badge).not.toBeNull();
  expect(badge!.querySelector("svg")).not.toBeNull();
  expect(injected.textContent).toContain("mini.local");
  const kept = document.querySelector('[data-toolkit-workspace="badged"]')!;
  expect(kept.textContent).toContain("mini.local");
  expect(kept.textContent!.split("mini.local")).toHaveLength(2);
});

it("shows the native-style workspace details card on hover and closes it after leaving", async () => {
  const { document, update } = setup();
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore();
  catalog.update("pro", {
    projects: [{ serverId: "pro", projectId: "p", name: "Pro", root: "/p" }],
    workspaces: [
      {
        serverId: "pro",
        projectId: "p",
        id: "w",
        name: "Workspace",
        cwd: "/Users/alice/projects/paseo-plugin-toolkit",
        worktreeSlug: "feature",
        diffStat: { additions: 4700, deletions: 32 },
        currentBranch: "feat/custom-project-tree",
      },
    ],
  });
  catalog.connection(true);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    surface2: "#333",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
    statusSuccess: "#3c3",
    statusDanger: "#c33",
  };
  update((container) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
    }),
  );
  const row = document.querySelector('[data-toolkit-workspace="w"]')!;
  row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  const card = document.querySelector("[data-toolkit-workspace-hover]")!;
  expect(card).not.toBeNull();
  expect(card.textContent).toContain("Workspace");
  expect(card.textContent).toContain("+4.7k");
  expect(card.textContent).toContain("-32");
  expect(card.textContent).toContain("Pro");
  expect(card.textContent).toContain("feat/custom-project-tree");
  expect(card.textContent).toContain("feature");
  expect((card as HTMLElement).style.width).toBe("260px");
  const sidebar = document.querySelector("[data-toolkit-project-tree]") as HTMLElement;
  Object.defineProperty(document.defaultView!, "innerWidth", { configurable: true, value: 1200 });
  sidebar.getBoundingClientRect = () =>
    ({ left: 0, right: 280, top: 0, bottom: 600, width: 280, height: 600 }) as DOMRect;
  (row as HTMLElement).getBoundingClientRect = () =>
    ({ left: 8, right: 272, top: 120, bottom: 160, width: 264, height: 40 }) as DOMRect;
  row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  const placed = document.querySelector("[data-toolkit-workspace-hover]") as HTMLElement;
  expect(placed.style.left).toBe("284px");
  expect(placed.style.top).toBe("120px");
  const branch = card.querySelector('[aria-label="复制分支名称"]')!;
  branch.dispatchEvent(new document.defaultView!.Event("click", { bubbles: true }));
  expect(writeText).toHaveBeenCalledWith("feat/custom-project-tree");
  row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  card.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(document.querySelector("[data-toolkit-workspace-hover]")).not.toBeNull();
  card.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(document.querySelector("[data-toolkit-workspace-hover]")).toBeNull();
});

it("reattaches after the host remounts the list and does not hide an unknown layout", async () => {
  const { original, document } = setup();
  const replacement = original.cloneNode(true) as typeof original;
  replacement.style.display = "flex";
  original.replaceWith(replacement);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(replacement.style.display).toBe("none");
  expect(document.querySelectorAll("[data-toolkit-project-tree]")).toHaveLength(1);
  replacement.parentElement!.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.querySelectorAll("[data-toolkit-project-tree]")).toHaveLength(0);
});

it("indexes native workspace rows once per render and ignores unrelated mutations", async () => {
  const { document, original, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore();
  const workspaces = Array.from({ length: 300 }, (_, index) => ({
    serverId: "pro",
    projectId: "p",
    id: `w${index}`,
    name: `Workspace ${index}`,
    cwd: `/p/${index}`,
  }));
  for (const workspace of workspaces) {
    const source = document.createElement("div");
    source.setAttribute("data-testid", `sidebar-workspace-row-pro:${workspace.id}`);
    source.textContent = workspace.name;
    original.appendChild(source);
  }
  catalog.update("pro", {
    projects: [{ serverId: "pro", projectId: "p", name: "P", root: "/p" }],
    workspaces,
  });
  let onOpen = vi.fn();
  const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: {
        colors: { foreground: "#fff", foregroundMuted: "#aaa", surface0: "#111", surface1: "#222" },
      } as never,
      collapsed: new Set(),
      toggle() {},
      open: onOpen,
      native() {},
    });
  const query = vi.spyOn(document, "querySelectorAll");
  const history = document.defaultView!.history;
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  const addListener = vi.spyOn(document.defaultView!, "addEventListener");
  const removeListener = vi.spyOn(document.defaultView!, "removeEventListener");
  const scans = () =>
    query.mock.calls.filter(([selector]) => selector === '[data-testid^="sidebar-workspace-row-"]')
      .length;
  update(render);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(scans()).toBe(1);
  const sibling = document.querySelector('[data-toolkit-workspace="w1"]')!;
  const siblingContent = sibling.firstElementChild;
  query.mockClear();
  const chat = document.createElement("main");
  document.body.appendChild(chat);
  chat.textContent = "Streaming reply";
  const source = original.querySelector('[data-testid="sidebar-workspace-row-pro:w0"]')!;
  source.textContent = "Updated workspace";
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(scans()).toBe(0);
  expect(document.querySelector('[data-toolkit-workspace="w0"]')!.textContent).toContain(
    "Updated workspace",
  );
  expect(sibling.firstElementChild).toBe(siblingContent);
  const previousOpen = onOpen;
  onOpen = vi.fn();
  catalog.organize({
    ...catalog.read().tree,
    revision: 2,
    nodes: catalog.read().tree.nodes.map((node) => ({ ...node, name: "Renamed" })),
  });
  update(render);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(scans()).toBe(1);
  expect(document.querySelector('[data-toolkit-workspace="w1"]')).toBe(sibling);
  (sibling.firstElementChild as HTMLButtonElement).click();
  expect(onOpen).toHaveBeenCalledOnce();
  expect(previousOpen).not.toHaveBeenCalled();
  dispose?.();
  dispose = undefined;
  expect(history.pushState).toBe(pushState);
  expect(history.replaceState).toBe(replaceState);
  for (const event of ["popstate", "hashchange"]) {
    expect(addListener.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
    expect(removeListener.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
  }
  query.mockRestore();
  addListener.mockRestore();
  removeListener.mockRestore();
});

it("keeps native navigation usable when the custom renderer fails", () => {
  const { original, update } = setup();
  update(() => {
    throw new Error("Unavailable tree");
  });
  expect(original.style.display).toBe("flex");
});

it("leaves an unfamiliar sidebar layout visible", () => {
  const dom = new JSDOM(
    '<aside><section style="display:flex"><div data-testid="sidebar-project-workspace-list-scroll">Original</div></section></aside>',
  );
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  const mount = mountProjectSidebar((container) => {
    container.textContent = "Custom";
  });
  dispose = mount.dispose;
  expect(dom.window.document.querySelector("section")!.style.display).toBe("flex");
  expect(dom.window.document.querySelector("[data-toolkit-project-tree]")).toBeNull();
});

it("keeps native workspace creation while replacing the project menu with organization actions", async () => {
  const { document, original, update, setEnabled } = setup();
  vi.stubGlobal("MouseEvent", document.defaultView!.MouseEvent);
  const viewKey = 'remote:repo["opaque"]';
  const nativeProject = document.createElement("div");
  nativeProject.setAttribute("data-testid", `sidebar-project-row-${viewKey}`);
  const nativeAdd = document.createElement("button");
  nativeAdd.setAttribute("data-testid", `sidebar-project-new-worktree-${viewKey}`);
  nativeAdd.disabled = true;
  nativeProject.addEventListener("pointerover", () => {
    nativeAdd.disabled = false;
  });
  nativeProject.addEventListener("pointerout", () => {
    nativeAdd.disabled = true;
  });
  const create = vi.fn();
  nativeAdd.addEventListener("click", create);
  nativeProject.appendChild(nativeAdd);
  original.appendChild(nativeProject);
  const nativeMenu = vi.fn((event: Event) => event.preventDefault());
  nativeProject.addEventListener("contextmenu", nativeMenu);
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore();
  catalog.update("pro", {
    projects: [
      { serverId: "pro", projectId: "p", name: "Native project", key: viewKey, root: "/repo" },
    ],
    workspaces: [],
  });
  catalog.connection(true);
  const native = vi.fn();
  const run = vi.fn(async () => {});
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  update((container) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native,
      run,
    }),
  );
  const row = document.querySelector("[data-toolkit-tree-row]")!;
  row.querySelectorAll("button")[1]!.click();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(create).toHaveBeenCalledOnce();
  expect(nativeAdd.disabled).toBe(true);

  expect(native).not.toHaveBeenCalled();
  const more = row.querySelectorAll("button")[2]!;
  row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  more.click();
  row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  expect(more.getAttribute("aria-expanded")).toBe("true");
  const actions = row.querySelector("[data-toolkit-tree-actions]")!;
  expect(document.defaultView!.getComputedStyle(actions).opacity).toBe("1");
  const menu = document.querySelector('[role="menu"]')!;
  const separators = Array.from(menu.querySelectorAll('[role="separator"]'));
  expect(separators.map((separator) => separator.previousElementSibling?.textContent)).toEqual([
    "重命名",
    "置底",
    "取消合并",
    "隐藏空 workspace 项目节点",
  ]);
  expect(Array.from(menu.querySelectorAll("button")).map((entry) => entry.textContent)).toEqual([
    "重命名",
    "移动到…",
    "上移",
    "下移",
    "置顶",
    "置底",
    "合并到…",
    "取消合并",
    "显示会话列表",
    "隐藏项目节点",
    "隐藏空 workspace 项目节点",
    "新建 workspace",
  ]);
  expect(nativeMenu).not.toHaveBeenCalled();
  (menu.querySelector('[aria-label="重命名"]') as HTMLButtonElement).click();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  expect(document.defaultView!.getComputedStyle(actions).opacity).toBe("1");
  const input = dialog.querySelector("input")!;
  expect(input.value).toBe("Native project");
  input.value = "Renamed";
  (dialog.querySelector('[aria-label="保存名称"]') as HTMLButtonElement).click();
  expect(run).toHaveBeenCalledWith({
    type: "rename",
    id: catalog.read().tree.nodes[0]!.id,
    name: "Renamed",
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect((row as HTMLElement).style.backgroundColor).toBe("transparent");
  expect(more.getAttribute("aria-expanded")).toBe("false");
  more.click();
  document
    .querySelector('[role="menu"]')!
    .dispatchEvent(new document.defaultView!.KeyboardEvent("keydown", { key: "Escape" }));
  expect(row.hasAttribute("data-toolkit-menu-open")).toBe(false);
  expect((row as HTMLElement).style.backgroundColor).toBe("transparent");
  more.click();
  setEnabled(false);
  expect(row.hasAttribute("data-toolkit-menu-open")).toBe(false);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("reorders, moves, merges and splits from node menus without opening a management page", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "Mini", status: "online" },
  ]);
  catalog.restore({
    tree: {
      revision: 0,
      nodes: [
        { id: "team", kind: "folder", name: "Team", parentId: null },
        {
          id: "a",
          kind: "project",
          name: "A",
          parentId: null,
          members: [{ serverId: "pro", projectId: "p" }],
        },
        {
          id: "b",
          kind: "project",
          name: "B",
          parentId: null,
          members: [{ serverId: "mini", projectId: "m" }],
        },
      ],
    },
    catalogs: {
      pro: {
        projects: [{ serverId: "pro", projectId: "p", name: "A", root: "/a" }],
        workspaces: [],
      },
      mini: {
        projects: [{ serverId: "mini", projectId: "m", name: "B", root: "/b" }],
        workspaces: [],
      },
    },
  });
  catalog.connection(true);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  const run = vi.fn(async (command: TreeCommand) => {
    catalog.organize(applyTreeCommand(catalog.read().tree, command));
    update(render);
  });
  const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
      run,
    });
  update(render);
  const more = (id: string) => {
    const row = Array.from(document.querySelectorAll("[data-toolkit-tree-row]")).find(
      (entry) => entry.getAttribute("data-toolkit-tree-row") === id,
    )!;
    row.querySelectorAll("button")[2]!.click();
  };
  const choose = (label: string) => {
    const menu = document.querySelector('[role="menu"]')!;
    (
      Array.from(menu.querySelectorAll("button")).find(
        (entry) => entry.textContent === label,
      ) as HTMLButtonElement
    ).click();
  };
  more("b");
  choose("置顶");
  expect(catalog.read().tree.nodes.map((node) => node.id)).toEqual(["b", "team", "a"]);
  more("b");
  choose("置底");
  expect(catalog.read().tree.nodes.map((node) => node.id)).toEqual(["team", "a", "b"]);
  more("a");
  choose("上移");
  expect(catalog.read().tree.nodes.map((node) => node.id)).toEqual(["a", "team", "b"]);
  more("a");
  choose("移动到…");
  choose("Team");
  expect(catalog.read().tree.nodes.find((node) => node.id === "a")?.parentId).toBe("team");
  const merge = () => {
    more("a");
    choose("合并到…");
    choose("B · Mini");
  };
  merge();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(document.activeElement?.textContent).toBe("取消");
  dialog.dispatchEvent(
    new document.defaultView!.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement?.textContent).toBe("确认合并");
  dialog.dispatchEvent(
    new document.defaultView!.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(catalog.read().tree.nodes.some((node) => node.id === "a")).toBe(true);
  merge();
  (document.querySelector('[role="dialog"] [aria-label="确认合并"]') as HTMLButtonElement).click();
  expect(catalog.read().tree.nodes.find((node) => node.id === "b")).toMatchObject({
    members: [
      { serverId: "mini", projectId: "m" },
      { serverId: "pro", projectId: "p" },
    ],
  });
  more("b");
  choose("取消合并");
  choose("拆出 A · Pro");
  expect(catalog.read().tree.nodes.filter((node) => node.kind === "project")).toHaveLength(2);
  expect(document.querySelector('[aria-label="管理"]')).toBeNull();
});

it("hides a project node and reveals it again from the header setting", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore({
    tree: {
      revision: 0,
      nodes: [
        {
          id: "a",
          kind: "project",
          name: "A",
          parentId: null,
          members: [{ serverId: "pro", projectId: "p" }],
        },
      ],
    },
    catalogs: {
      pro: {
        projects: [{ serverId: "pro", projectId: "p", name: "A", root: "/a" }],
        workspaces: [],
      },
    },
  });
  catalog.connection(true);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  let showHidden = false;
  const run = vi.fn(async (command: TreeCommand) => {
    catalog.organize(applyTreeCommand(catalog.read().tree, command));
    update(render);
  });
  const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
      run,
      showHidden,
      toggleHidden() {
        showHidden = !showHidden;
        update(render);
      },
    });
  update(render);
  const row = () => document.querySelector('[data-toolkit-tree-row="a"]');
  expect(row()).not.toBeNull();
  (row()!.querySelectorAll("button")[2] as HTMLButtonElement).click();
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
      (entry) => entry.textContent === label,
    )!;
  menuItem("隐藏项目节点").click();
  expect(catalog.read().tree.nodes[0]?.hidden).toBe(true);
  expect(row()).toBeNull();

  (document.querySelector('[aria-label="我的工作台设置"]') as HTMLButtonElement).click();
  menuItem("显示隐藏节点").click();
  expect(row()).not.toBeNull();
  expect(Number((row() as HTMLElement).style.opacity)).toBeLessThan(1);

  (row()!.querySelectorAll("button")[2] as HTMLButtonElement).click();
  menuItem("显示项目节点").click();
  expect(catalog.read().tree.nodes[0]?.hidden).toBeUndefined();
});

it("hides every project whose workspaces are all placed elsewhere from the node menu", () => {
  const { document, update } = setup();
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore({
    tree: {
      revision: 0,
      nodes: [
        {
          id: "a",
          kind: "project",
          name: "A",
          parentId: null,
          members: [{ serverId: "pro", projectId: "p" }],
        },
        {
          id: "b",
          kind: "project",
          name: "B",
          parentId: null,
          members: [{ serverId: "pro", projectId: "q" }],
        },
        {
          id: "c",
          kind: "project",
          name: "C",
          parentId: null,
          members: [{ serverId: "pro", projectId: "r" }],
        },
      ],
    },
    catalogs: {
      pro: {
        projects: [
          { serverId: "pro", projectId: "p", name: "A", root: "/a" },
          { serverId: "pro", projectId: "q", name: "B", root: "/b" },
          { serverId: "pro", projectId: "r", name: "C", root: "/c" },
        ],
        workspaces: [{ serverId: "pro", projectId: "p", id: "w", name: "W", cwd: "/a/w" }],
      },
    },
  });
  catalog.connection(true);
  const colors = {
    foreground: "#fff",
    foregroundMuted: "#aaa",
    surface0: "#111",
    surface1: "#222",
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  const run = vi.fn(async (command: TreeCommand) => {
    catalog.organize(applyTreeCommand(catalog.read().tree, command));
    update(render);
  });
  const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
    renderProjectSidebar(container, {
      snapshot: catalog.read(),
      theme: { colors } as never,
      collapsed: new Set(),
      toggle() {},
      open() {},
      native() {},
      run,
    });
  update(render);
  const row = (id: string) => document.querySelector(`[data-toolkit-tree-row="${id}"]`);
  const more = (id: string) =>
    (row(id)!.querySelectorAll("button")[2] as HTMLButtonElement).click();
  const menuItem = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
      (entry) => entry.textContent === label,
    )!;
  more("a");
  menuItem("隐藏空 workspace 项目节点").click();
  expect(run).toHaveBeenCalledWith({ type: "hideEmpty", ids: ["b", "c"] });
  expect(
    catalog
      .read()
      .tree.nodes.filter((node) => node.hidden)
      .map((node) => node.id),
  ).toEqual(["b", "c"]);
  expect(row("a")).not.toBeNull();
  expect(row("b")).toBeNull();
  expect(row("c")).toBeNull();
});
