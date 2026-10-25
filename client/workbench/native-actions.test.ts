import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { openWorkbenchProjectMenu, openWorkbenchWorkspaceMenu } from "../web";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
let dom: JSDOM;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  dom?.window.close();
  vi.unstubAllGlobals();
});
const group = {
  viewKey: 'host:["opaque"]',
  name: "Project",
  members: [{ serverId: "h", projectId: "p" }],
};
const theme = {
  border: "#333",
  foreground: "#eee",
  foregroundMuted: "#aaa",
  surface2: "#222",
} as never;
function setup() {
  dom = new JSDOM('<div id="native"></div><button id="anchor">More</button>');
  for (const name of ["document", "MouseEvent", "KeyboardEvent", "MutationObserver"] as const)
    vi.stubGlobal(name, dom.window[name]);
  return { document: dom.window.document, anchor: dom.window.document.getElementById("anchor")! };
}
function menu(document: Document, prefix: string, key: string, names: string[]) {
  const surface = document.createElement("div");
  surface.setAttribute("data-menu-surface", "true");
  surface.style.top = "100px";
  surface.style.visibility = "hidden";
  for (const name of names) {
    const item = document.createElement("button");
    item.setAttribute("data-menu-item", "true");
    item.setAttribute("data-testid", `${prefix}${name}-${key}`);
    item.textContent = name;
    surface.append(item);
  }
  document.body.append(surface);
  document.body.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") surface.remove();
    },
    { once: true },
  );
  return surface;
}
it("adds creation to the native project menu, preserves original actions and keeps it visible across refreshes", async () => {
  const { document, anchor } = setup();
  const source = document.createElement("div");
  source.setAttribute("data-testid", `sidebar-project-row-${group.viewKey}`);
  const add = document.createElement("button");
  add.setAttribute("data-testid", `sidebar-project-new-worktree-${group.viewKey}`);
  add.disabled = true;
  source.addEventListener("pointerover", () => {
    add.disabled = false;
  });
  source.addEventListener("pointerout", () => {
    add.disabled = true;
  });
  const create = vi.fn(),
    settings = vi.fn(),
    remove = vi.fn(),
    organize = vi.fn(),
    fail = vi.fn();
  add.addEventListener("click", create);
  source.append(add);
  document.getElementById("native")!.append(source);
  let surface!: HTMLElement;
  source.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    surface = menu(document, "sidebar-project-menu-", group.viewKey, ["open-settings", "remove"]);
    surface.children[0]!.addEventListener("click", settings);
    surface.children[1]!.addEventListener("click", remove);
  });
  dispose = openWorkbenchProjectMenu(anchor, group, theme, organize, fail);
  await Promise.resolve();
  expect(surface.style.visibility).toBe("visible");
  expect([...surface.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
    "新建 workspace",
    "open-settings",
    "分组与场景",
    "remove",
  ]);
  const originals = [...surface.querySelectorAll("[data-testid]")];
  surface.style.visibility = "hidden";
  surface.append(document.createElement("span"));
  await Promise.resolve();
  expect(surface.style.visibility).toBe("visible");
  expect([...surface.querySelectorAll("[data-testid]")]).toEqual(originals);
  (originals[0] as HTMLElement).click();
  expect(settings).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
  surface.querySelector<HTMLButtonElement>('[aria-label="新建 workspace"]')!.click();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(create).toHaveBeenCalledOnce();
  expect(add.disabled).toBe(true);
  expect(fail).not.toHaveBeenCalled();
  expect(organize).not.toHaveBeenCalled();
  expect(surface.isConnected).toBe(false);
});
it("reveals a collapsed paginated native workspace and delegates its unchanged menu at the card anchor", async () => {
  const { document, anchor } = setup();
  const source = document.createElement("button");
  source.setAttribute("data-testid", `sidebar-project-row-${group.viewKey}`);
  let pages = 0;
  const rename = vi.fn();
  source.addEventListener("click", () => {
    const list = document.createElement("div");
    list.setAttribute("data-testid", `sidebar-workspace-list-${group.viewKey}`);
    const more = document.createElement("button");
    more.setAttribute("data-testid", `sidebar-project-show-more-${group.viewKey}`);
    more.addEventListener("click", () => {
      if (++pages < 2) return;
      const row = document.createElement("button");
      row.setAttribute("data-testid", "sidebar-workspace-row-h:w");
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const surface = menu(document, "sidebar-workspace-menu-", "h:w", [
          "rename",
          "pin",
          "archive",
        ]);
        surface.children[0]!.addEventListener("click", rename);
      });
      list.append(row);
      more.remove();
    });
    list.append(more);
    document.getElementById("native")!.append(list);
  });
  document.getElementById("native")!.append(source);
  expect(
    await openWorkbenchWorkspaceMenu(
      anchor,
      { serverId: "h", projectId: "p", id: "w", name: "W", cwd: "/p" },
      group,
    ),
  ).toBe(true);
  expect(pages).toBe(2);
  const surface = document.querySelector<HTMLElement>("[data-menu-surface]")!;
  expect(surface.style.visibility).toBe("visible");
  expect([...surface.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
    "rename",
    "pin",
    "archive",
  ]);
  surface.querySelector("button")!.click();
  expect(rename).toHaveBeenCalledOnce();
  document.body.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await Promise.resolve();
  expect(surface.isConnected).toBe(false);
});
