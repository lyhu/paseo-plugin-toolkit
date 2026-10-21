import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { mountProjectSidebar, renderProjectSidebar } from "../web";
import { createCatalog } from "./catalog";
import { applyTreeCommand, type TreeCommand } from "../../shared/project-tree/model";

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
    for (const button of buttons) {
      button.dispatchEvent(new document.defaultView!.Event("mouseenter"));
      expect(button.style.backgroundColor).toBe("transparent");
    }
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
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(6);
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(2);
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
  const settings = document.querySelector('[aria-label="项目树设置"]') as HTMLButtonElement;
  expect(settings).not.toBeNull();
  expect(settings.parentElement!.textContent).toBe("项目树");
  expect(settings.parentElement!.querySelectorAll("button")).toHaveLength(1);
  expect(settings.querySelector("svg")).not.toBeNull();
  settings.click();
  const entries = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(Array.from(entries, (entry) => entry.textContent)).toEqual([
    "新增树节点...",
    "切换原始视图",
  ]);
  const separator = document.querySelector('[role="menu"] [role="separator"]')!;
  expect(separator).not.toBeNull();
  expect(separator.previousElementSibling).toBe(entries[0]);
  expect(separator.nextElementSibling).toBe(entries[1]);
  entries[0]!.click();
  const form = document.querySelector('[role="dialog"]')!;
  (form.querySelector("input") as HTMLInputElement).value = "New root";
  (form.querySelector('[aria-label="创建文件夹"]') as HTMLButtonElement).click();
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({ type: "folder", name: "New root", parentId: null }),
  );
  settings.click();
  (document.querySelector('[aria-label="切换原始视图"]') as HTMLButtonElement).click();
  expect(native).toHaveBeenCalledOnce();
});

it("mirrors the live native workspace row, delegates its menu, and drags only that Host's workspace", async () => {
  const { document, original, update } = setup();
  vi.stubGlobal("MouseEvent", document.defaultView!.MouseEvent);
  const source = document.createElement("div");
  source.setAttribute("data-testid", "sidebar-workspace-row-pro:w");
  source.setAttribute("aria-selected", "true");
  source.style.backgroundColor = "rgb(37, 39, 49)";
  source.innerHTML =
    '<div class="native-status" style="color:green">Active</div><span id="native-title">Workspace</span><button data-testid="sidebar-workspace-kebab-pro:w">More</button>';
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
    workspaces: [{ serverId: "pro", projectId: "p", id: "w", name: "Workspace", cwd: "/p" }],
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
    accent: "#88f",
    accentForeground: "#fff",
    border: "#333",
  };
  const moveWorkspace = vi.fn(),
    move = vi.fn();
  const open = vi.fn();
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
    }),
  );
  const row = document.querySelector('[data-toolkit-workspace="w"]')!;
  expect(row.getAttribute("aria-selected")).toBe("true");
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(37, 39, 49)");
  expect((row.querySelector('[aria-hidden="true"]') as HTMLElement).style.backgroundColor).toBe(
    "transparent",
  );
  expect(row.querySelector(".native-status")?.textContent).toBe("Active");
  expect(row.querySelector("[data-testid],#native-title")).toBeNull();
  expect(row.querySelectorAll("button")).toHaveLength(2);
  expect(source.parentElement).toBe(original);
  expect(
    document.defaultView!.getComputedStyle(row.querySelector("[data-toolkit-tree-actions]")!)
      .opacity,
  ).toBe("1");
  source.setAttribute("aria-selected", "false");
  await new Promise((resolve) => setTimeout(resolve, 0));
  row.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  row.querySelectorAll("button")[1]!.dispatchEvent(new document.defaultView!.Event("mouseenter"));
  expect((row as HTMLElement).style.backgroundColor).toBe("rgb(34, 34, 34)");
  row.dispatchEvent(new document.defaultView!.Event("mouseleave"));
  expect((row as HTMLElement).style.backgroundColor).toBe("transparent");
  row.querySelectorAll("button")[1]!.click();
  expect(nativeMenu).toHaveBeenCalledOnce();
  expect(otherMenu).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
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
    "下移",
    "取消合并",
  ]);
  expect(Array.from(menu.querySelectorAll("button")).map((entry) => entry.textContent)).toEqual([
    "重命名",
    "移动到…",
    "上移",
    "下移",
    "合并到…",
    "取消合并",
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
