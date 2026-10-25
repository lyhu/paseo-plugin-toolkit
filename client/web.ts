import { Platform } from "react-native";
import { sessionVisible } from "./project-tree/session-visibility";
import { createNodeSubmission } from "./project-tree/submission";
import type { Element, MutationObserverApi } from "./chat-view/dom";
import type { CatalogSession, CatalogSnapshot, CatalogWorkspace } from "./project-tree/catalog";
import {
  projectAvailable,
  projectWorkspaces,
  workspaceSessions,
  workspaceSessionCount,
} from "./project-tree/catalog";
import type { PluginTheme } from "@getpaseo/plugin";
import { tr } from "./i18n";
import { createComposerAccess, type ComposerAccess } from "./chat-view/enhance/dom";
import {
  nativeGroupsWithin,
  nativeProjectGroups,
  type NativeProjectGroup,
} from "./project-tree/native-groups";
import { visibleTreeRows } from "../shared/project-tree/projection";
import { type TreeCommand, type TreeNode } from "../shared/project-tree/model";
import {
  nodeActionCommand,
  type NodeActionRequest,
  folderDestinations,
  nodeActions,
  nodePath,
} from "../shared/project-tree/actions";

// Keep the optional web adapter independent of the plugin's native bundle and DOM typings.
declare const document: {
  body: Element;
  activeElement: Element | null;
  createElement(tag: string): Element;
  createElementNS(namespace: string, tag: string): Element;
  createTextNode(text: string): Element;
  querySelectorAll(selector: string): ArrayLike<Element>;
  addEventListener(name: string, callback: (event: unknown) => void, capture?: boolean): void;
  removeEventListener(name: string, callback: (event: unknown) => void, capture?: boolean): void;
};
interface SidebarMutation {
  target: Element;
  addedNodes: ArrayLike<Element>;
  removedNodes: ArrayLike<Element>;
}
declare const MutationObserver: new (
  callback: (records: readonly SidebarMutation[]) => void,
) => MutationObserverApi & { takeRecords(): SidebarMutation[] };
declare const window: {
  innerWidth: number;
  innerHeight: number;
  location: { pathname: string; search: string };
  history: History;
  getComputedStyle(element: Element): { backgroundColor: string };
  addEventListener(name: string, callback: (event: unknown) => void): void;
  removeEventListener(name: string, callback: (event: unknown) => void): void;
  dispatchEvent(event: unknown): boolean;
};
declare const PopStateEvent: new (type: string, options: { state: unknown }) => unknown;
declare const navigator: {
  clipboard?: { writeText(text: string): Promise<void> };
};
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
declare const KeyboardEvent: new (
  type: string,
  options: { key: string; bubbles: boolean },
) => unknown;
declare const MouseEvent: new (
  type: string,
  options: {
    bubbles: boolean;
    cancelable: boolean;
    clientX: number;
    clientY: number;
    button: number;
  },
) => unknown;
const HOVER_CARD_WIDTH = 260;
const HOVER_CARD_OFFSET = 4;
const HOVER_CARD_EDGE = 8;
const HOVER_CARD_CLOSE_GRACE = 100;
const compactDiffFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Capture this pill's composer before awaiting naming; never fall through to another pane. */
export function getTitleComposer(
  agentId: string,
): (ComposerAccess & { submitClear(signal: AbortSignal): Promise<boolean> }) | undefined {
  if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
  const markerId = `session-title-composer-${agentId}`;
  const markers = document.body.querySelectorAll('[data-testid^="session-title-composer-"]');
  const visible = (node: Element) =>
    node.isConnected && node.clientWidth > 0 && node.clientHeight > 0;
  const marker = Array.from(markers).find(
    (node) => node.getAttribute("data-testid") === markerId && visible(node),
  );
  let scope = marker?.parentElement;
  for (let depth = 0; scope && depth < 12; depth++, scope = scope.parentElement) {
    const inputs = Array.from(scope.querySelectorAll("textarea[data-composer-input]")).filter(
      visible,
    );
    if (!inputs.length) continue;
    if (inputs.length !== 1) return undefined;
    const input = inputs[0]!;
    const access = createComposerAccess(input)!;
    const owner = scope;
    const current = () => {
      const switched = Array.from(
        owner.querySelectorAll('[data-testid^="session-title-composer-"]'),
      ).some((node) => visible(node) && node.getAttribute("data-testid") !== markerId);
      return input.isConnected && input.clientWidth > 0 && input.clientHeight > 0 && !switched;
    };
    const hasAttachments = () => !!owner.querySelector('[data-testid="composer-attachment-tray"]');
    return {
      read: access.read,
      write(text) {
        if (!current() || hasAttachments()) return false;
        return access.write(text);
      },
      async submitClear(signal) {
        if (signal.aborted) return false;
        if (!current()) throw new Error(tr("当前输入框已隐藏或会话已切换，请回到原会话后重试。"));
        if (hasAttachments()) throw new Error(tr("当前输入框包含附件，请移除后重试归档新建。"));
        if (!access.write("/clear"))
          throw new Error(tr("无法写入 /clear，请确认当前输入框可编辑后重试。"));
        // Let the host commit the input update before using its normal send action.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (signal.aborted || !current() || hasAttachments() || access.read() !== "/clear")
          return false;
        const send = owner.querySelector(
          '[role="button"][aria-label="发送消息"], [role="button"][aria-label="Send message"]',
        );
        if (
          !send ||
          send.getAttribute("aria-disabled") === "true" ||
          send.getAttribute("disabled") !== null
        )
          return false;
        send.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
            clientX: 0,
            clientY: 0,
          }),
        );
        return true;
      },
    };
  }
  return undefined;
}
const formatDiffCount = (value: number) => compactDiffFormatter.format(value).toLowerCase();
/** Mirrors the native workspace card's path label, including the worktree slug when present. */
const workspaceDirectoryLabel = (workspace: CatalogWorkspace) =>
  workspace.worktreeSlug?.trim() || (workspace.cwd ?? "").replace(/^\/(?:Users|home)\/[^/]+/, "~");

type GlyphKind =
  | "folder"
  | "star"
  | "folderPlus"
  | "directory"
  | "session"
  | "chevron"
  | "plus"
  | "more"
  | "settings"
  | "diff"
  | "server"
  | "branch"
  | "copy"
  | "check"
  | "rename"
  | "move"
  | "up"
  | "down"
  | "top"
  | "bottom"
  | "merge"
  | "split"
  | "hide"
  | "show"
  | "new"
  | "delete"
  | "native";
/** Lucide geometry, kept here so the web adapter renders the same icons as the native card. */
const glyphShapes: Record<GlyphKind, Array<[string, Record<string, string>]>> = {
  folder: [["path", { d: "M3 7V5h6l2 2h10v12H3Z" }]],
  star: [
    ["path", { d: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" }],
  ],
  session: [
    [
      "path",
      {
        d: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
      },
    ],
  ],
  folderPlus: [["path", { d: "M3 7V5h6l2 2h10v12H3ZM12 10v6M9 13h6" }]],
  directory: [
    [
      "path",
      {
        d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      },
    ],
  ],
  chevron: [["path", { d: "m9 5 7 7-7 7" }]],
  plus: [["path", { d: "M12 5v14M5 12h14" }]],
  more: [["path", { d: "M12 5h.01M12 12h.01M12 19h.01", "stroke-width": "3" }]],
  settings: [
    [
      "path",
      {
        d: "M20 7h-9M14 17H5M7 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM21 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z",
      },
    ],
  ],
  diff: [
    [
      "path",
      {
        d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      },
    ],
    ["path", { d: "M9 10h6" }],
    ["path", { d: "M12 13V7" }],
    ["path", { d: "M9 17h6" }],
  ],
  server: [
    ["rect", { width: "20", height: "8", x: "2", y: "2", rx: "2", ry: "2" }],
    ["rect", { width: "20", height: "8", x: "2", y: "14", rx: "2", ry: "2" }],
    ["line", { x1: "6", x2: "6.01", y1: "6", y2: "6" }],
    ["line", { x1: "6", x2: "6.01", y1: "18", y2: "18" }],
  ],
  branch: [
    ["path", { d: "M15 6a9 9 0 0 0-9 9V3" }],
    ["circle", { cx: "18", cy: "6", r: "3" }],
    ["circle", { cx: "6", cy: "18", r: "3" }],
  ],
  copy: [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
  ],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  rename: [["path", { d: "m16 3 5 5M4 15 16 3a2.1 2.1 0 0 1 5 5L9 20l-6 1Z" }]],
  move: [
    [
      "path",
      { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M15 3h6v6M10 14 21 3" },
    ],
  ],
  up: [["path", { d: "m5 12 7-7 7 7M12 19V5" }]],
  down: [["path", { d: "m5 12 7 7 7-7M12 5v14" }]],
  top: [["path", { d: "M5 3h14m-1 10-6-6-6 6m6-6v14" }]],
  bottom: [["path", { d: "M5 21h14m-1-10-6 6-6-6m6 6V3" }]],
  merge: [["path", { d: "m8 6 4-4 4 4M12 2v10a8 8 0 0 1-8 8M12 12a8 8 0 0 0 8 8" }]],
  split: [
    ["path", { d: "M12 22V12M12 12a8 8 0 0 0-8-8m0 0v5m0-5h5M12 12a8 8 0 0 1 8-8m0 0v5m0-5h-5" }],
  ],
  hide: [
    [
      "path",
      {
        d: "m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c7 0 10 7 10 7a16 16 0 0 1-3 4M6.6 6.6A17 17 0 0 0 2 12s3 7 10 7a11 11 0 0 0 5.4-1.4",
      },
    ],
  ],
  show: [
    ["path", { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  new: [["path", { d: "M12 5v14M5 12h14" }]],
  delete: [["path", { d: "M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" }]],
  native: [
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
    ["path", { d: "M9 3v18M3 9h6" }],
  ],
};
const dialogContainers = new WeakSet<Element>();
const menuCleanups = new WeakMap<Element, () => void>();
const workspaceCleanups = new WeakMap<Element, Array<() => void>>();
const workspaceBindings = new WeakMap<
  Element,
  Array<{ expected: string; attach(source?: Element): void }>
>();
const workspaceRowIndexes = new WeakMap<Element, ReadonlyMap<string, Element>>();
interface RenderedWorkspace {
  context: string;
  key: string;
  elements: Element[];
  cleanups: Array<() => void>;
  binding?: { expected: string; attach(source?: Element): void };
}
const sidebarRenderStates = new WeakMap<
  Element,
  {
    options: Parameters<typeof renderProjectSidebar>[1];
    rows: Map<string, RenderedWorkspace>;
    draggedId: string | null;
    draggedWorkspace: CatalogWorkspace | null;
    refreshPending?: boolean;
    menuOwnerId?: string;
    scrollBody?: Element;
  }
>();
function indexNativeWorkspaceRows() {
  return new Map(
    Array.from(document.querySelectorAll('[data-testid^="sidebar-workspace-row-"]'))
      .filter((entry) => !entry.closest("[data-toolkit-project-tree]"))
      .map((entry) => [entry.getAttribute("data-testid")!, entry]),
  );
}
export async function openNativeProjectCreate(
  group: NativeProjectGroup,
  active: () => boolean = () => true,
): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const expected = `sidebar-project-new-worktree-${group.viewKey}`;
  const find = () =>
    Array.from(document.querySelectorAll('[data-testid^="sidebar-project-new-worktree-"]')).find(
      (entry) =>
        entry.getAttribute("data-testid") === expected &&
        !entry.closest("[data-toolkit-project-tree]"),
    );
  const ready = (entry?: Element) =>
    !!entry &&
    entry.getAttribute("disabled") === null &&
    entry.getAttribute("aria-disabled") !== "true";
  let trigger = find();
  if (!trigger) return false;
  const row = Array.from(document.querySelectorAll('[data-testid^="sidebar-project-row-"]')).find(
    (entry) => entry.getAttribute("data-testid") === `sidebar-project-row-${group.viewKey}`,
  );
  let hovered = false;
  const event = (type: string) =>
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: 0 });
  try {
    // Native TooltipTrigger disables this action until its project row is hovered.
    // Ask React to reveal it; never bypass an actual disabled/loading state.
    if (!ready(trigger) && row) {
      hovered = true;
      row.dispatchEvent(event("pointerover"));
      for (let frame = 0; frame < 3 && active() && !ready(trigger); frame += 1) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        if (row.isConnected) row.dispatchEvent(event("pointerover"));
        trigger = find();
      }
    }
    if (!active() || !ready(trigger) || !trigger?.isConnected) return false;
    trigger.dispatchEvent(event("click"));
    return true;
  } finally {
    if (hovered && row?.isConnected) row.dispatchEvent(event("pointerout"));
  }
}

const workspaceRouteWatches = new WeakMap<
  History,
  { listeners: Set<() => void>; cleanup(): void }
>();

/** Paseo encodes path-shaped workspace ids as `b64_` on `/h/:server/workspace/:id`. */
function activeWorkspaceFromLocation(): { serverId: string; workspaceId: string } | null {
  if (Platform.OS !== "web") return null;
  const path = window.location.pathname.split(/[?#]/)[0] ?? "";
  const match = /^\/h\/([^/]+)\/workspace\/([^/]+)\/?$/.exec(path);
  if (!match?.[1] || !match[2]) return null;
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const serverId = decode(match[1]);
  let workspaceId = decode(match[2]);
  if (workspaceId.startsWith("b64_")) {
    const payload = workspaceId.slice(4).replace(/-/g, "+").replace(/_/g, "/");
    try {
      const binary = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "="));
      const bytes = Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, "0"));
      workspaceId = decodeURIComponent(bytes.map((byte) => `%${byte}`).join(""));
    } catch {
      return null;
    }
  }
  return serverId && workspaceId ? { serverId, workspaceId } : null;
}

/** Use Paseo's workspace file-open intent so its native tab and Markdown renderer own the file. */
export async function openWorkbenchFile(input: {
  serverId: string;
  workspaceId: string;
  path: string;
}) {
  if (Platform.OS !== "web") return false;
  const current = activeWorkspaceFromLocation();
  if (
    current?.serverId !== input.serverId ||
    current.workspaceId !== input.workspaceId ||
    !input.path.trim()
  )
    return false;
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(input.path)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const pathname = window.location.pathname;
  const navigate = (intent: string) => {
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}?open=${encodeURIComponent(intent)}`,
    );
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  };
  // 0.13 remembers the last consumed intent. An empty file intent opens no tab and
  // clears that marker, allowing the same file to be revealed again after closing it.
  navigate("file:");
  for (
    let attempt = 0;
    attempt < 60 && new URLSearchParams(window.location.search).has("open");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 16));
  const active = activeWorkspaceFromLocation();
  if (
    active?.serverId !== input.serverId ||
    active.workspaceId !== input.workspaceId ||
    new URLSearchParams(window.location.search).has("open")
  )
    return false;
  navigate(`file:${encoded}`);
  return true;
}

/** pushState does not emit popstate, so navigation has to notify selection directly. */
function watchWorkspaceRoute(listener: () => void) {
  if (Platform.OS !== "web") return () => {};
  const observedWindow = window;
  const history = observedWindow.history;
  let watch = workspaceRouteWatches.get(history);
  if (!watch) {
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const entry of listeners) entry();
    };
    observedWindow.addEventListener("popstate", notify);
    observedWindow.addEventListener("hashchange", notify);
    const restores: Array<() => void> = [];
    for (const name of ["pushState", "replaceState"] as const) {
      const original = history[name];
      const wrapped = (...args: Parameters<History["pushState"]>) => {
        original.apply(history, args);
        notify();
      };
      history[name] = wrapped;
      restores.push(() => {
        if (history[name] === wrapped) history[name] = original;
      });
    }
    watch = {
      listeners,
      cleanup() {
        observedWindow.removeEventListener("popstate", notify);
        observedWindow.removeEventListener("hashchange", notify);
        for (const restore of restores) restore();
        workspaceRouteWatches.delete(history);
      },
    };
    workspaceRouteWatches.set(history, watch);
  }
  const current = watch;
  current.listeners.add(listener);
  return () => {
    if (!current.listeners.delete(listener)) return;
    if (!current.listeners.size) current.cleanup();
  };
}

function nativeWorkspaceRow(workspace: Pick<CatalogWorkspace, "serverId" | "id">) {
  const expected = `sidebar-workspace-row-${workspace.serverId}:${workspace.id}`;
  return Array.from(document.querySelectorAll('[data-testid^="sidebar-workspace-row-"]')).find(
    (entry) =>
      entry.getAttribute("data-testid") === expected &&
      !entry.closest("[data-toolkit-project-tree]"),
  );
}

let nativeMenuLayoutCleanup: (() => void) | undefined;
function openNativeMenu(
  row: Element,
  anchor: Element,
  options: { alignEnd?: boolean; onClose?(): void } = {},
) {
  nativeMenuLayoutCleanup?.();
  const rect = anchor.getBoundingClientRect();
  const opened = !row.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width,
      clientY: rect.bottom,
      button: 2,
    }),
  );
  if (!opened) return false;
  // A display:none native tree can leave its portaled menu's shared style hidden after
  // measurement. Only reveal this source's menu once native positioning has completed.
  const sourceId = row.getAttribute("data-testid") ?? "";
  const project = sourceId.startsWith("sidebar-project-row-");
  const key = sourceId.slice((project ? "sidebar-project-row-" : "sidebar-workspace-row-").length);
  const prefix = project ? "sidebar-project-menu-" : "sidebar-workspace-menu-";
  let seen = false;
  const cleanup = () => {
    observer.disconnect();
    clearTimeout(timer);
    if (nativeMenuLayoutCleanup === cleanup) nativeMenuLayoutCleanup = undefined;
    options.onClose?.();
  };
  const place = () => {
    if (!anchor.isConnected) {
      cleanup();
      return;
    }
    const menu = Array.from(document.querySelectorAll('[data-menu-surface="true"]')).find(
      (surface) =>
        Array.from(surface.querySelectorAll("[data-testid]")).some((item) => {
          const id = item.getAttribute("data-testid") ?? "";
          return id.startsWith(prefix) && id.endsWith(`-${key}`);
        }),
    );
    if (!menu) {
      if (seen) cleanup();
      return;
    }
    seen = true;
    if (Number.parseFloat(menu.style.top) > -9999 && menu.style.visibility !== "visible")
      menu.style.visibility = "visible";
    if (options.alignEnd && Number.parseFloat(menu.style.top) > -9999) {
      const width = menu.getBoundingClientRect().width;
      const left = `${Math.max(8, rect.right - width)}px`;
      if (width && menu.style.left !== left) menu.style.left = left;
    }
  };
  const observer = new MutationObserver(place);
  const timer = setTimeout(() => {
    if (!seen) cleanup();
  }, 1000);
  nativeMenuLayoutCleanup = cleanup;
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  place();
  return true;
}

export interface WorkspaceMenuExtra {
  key: string;
  label: string;
  glyph?: string;
  disabled?: boolean;
  action(): void;
}

function mountNativeMenuItem(options: {
  label: string;
  border: string;
  foreground: string;
  muted: string;
  hover: string;
  action(): void;
  testId?: string;
  first?: boolean;
  glyph?: string;
}): () => void {
  if (Platform.OS !== "web") return () => {};
  const entry = document.createElement("div");
  entry.setAttribute(
    options.testId ? "data-toolkit-project-menu-item" : "data-toolkit-workspace-session-toggle",
    "true",
  );
  const separator = document.createElement("div");
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-orientation", "horizontal");
  Object.assign(separator.style, {
    height: "1px",
    margin: "4px 0",
    background: options.border,
    flexShrink: "0",
  });
  if (!options.first) entry.appendChild(separator);
  const archiveRule = separator.cloneNode(true);
  const button = document.createElement("button");
  button.setAttribute("type", "button");
  button.setAttribute("role", "menuitem");
  button.setAttribute("data-menu-item", "true");
  button.setAttribute("data-menu-disabled", "false");
  button.setAttribute("tabindex", "-1");
  button.setAttribute("aria-label", options.label);
  Object.assign(button.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "calc(100% - 8px)",
    minHeight: "28px",
    margin: "0 4px",
    padding: "4px 8px",
    boxSizing: "border-box",
    border: "1px solid transparent",
    borderRadius: "6px",
    outline: "none",
    background: "transparent",
    color: options.foreground,
    font: "14px system-ui, sans-serif",
    lineHeight: "18px",
    textAlign: "left",
    cursor: "pointer",
  });
  const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: options.muted,
    "stroke-width": "1.6",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    glyph.setAttribute(key, value);
  glyph.style.flexShrink = "0";
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute(
    "d",
    options.glyph ??
      "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  );
  glyph.appendChild(shape);
  button.appendChild(glyph);
  button.appendChild(document.createTextNode(options.label));
  const highlight = () => {
    button.style.background = options.hover;
  };
  const clear = () => {
    button.style.background = "transparent";
  };
  button.addEventListener("mouseenter", highlight);
  button.addEventListener("focus", highlight);
  button.addEventListener("mouseleave", clear);
  button.addEventListener("blur", clear);
  button.addEventListener("click", (event) => {
    (event as { stopPropagation(): void }).stopPropagation();
    options.action();
  });
  entry.appendChild(button);
  // The session row sits just above archive; this rule is the divider directly over it.
  entry.appendChild(archiveRule);
  let seen = false;
  const remove = () => {
    observer.disconnect();
    entry.remove();
  };
  // The native menu mounts after the click, and React can drop injected rows on commit.
  // Keep each addition attached only to its matching native menu.
  const place = () => {
    const surface = Array.from(document.querySelectorAll('[data-menu-surface="true"]')).find(
      (candidate) =>
        options.testId
          ? Array.from(candidate.querySelectorAll("[data-testid]")).some(
              (item) => item.getAttribute("data-testid") === options.testId,
            )
          : candidate.querySelector('[data-testid^="sidebar-workspace-menu-"]'),
    );
    if (!surface) {
      if (seen) remove();
      return;
    }
    seen = true;
    const items = Array.from(surface.querySelectorAll('[data-menu-item="true"]')).filter(
      (item) => !entry.contains(item),
    );
    const last = options.first ? items[0] : items[items.length - 1];
    const page = last?.parentElement;
    if (!page || (entry.parentElement === page && entry.nextElementSibling === last)) return;
    if (page) page.insertBefore(entry, last);
  };
  const observer = new MutationObserver(place);
  observer.observe(document.body, { childList: true, subtree: true });
  place();
  return remove;
}

/**
 * Injects a small group of plugin rows above the native archive action. The native workspace
 * menu has no plugin extension point, so this mirrors the same DOM seam as the rest of the
 * workbench sidebar.
 */
function mountWorkspaceMenuExtras(options: {
  items: readonly WorkspaceMenuExtra[];
  border: string;
  foreground: string;
  muted: string;
  hover: string;
}): () => void {
  if (Platform.OS !== "web" || !options.items.length) return () => {};
  const entry = document.createElement("div");
  entry.setAttribute("data-toolkit-workspace-menu-extras", "true");
  const separator = () => {
    const rule = document.createElement("div");
    rule.setAttribute("role", "separator");
    rule.setAttribute("aria-orientation", "horizontal");
    Object.assign(rule.style, {
      height: "1px",
      margin: "4px 0",
      background: options.border,
      flexShrink: "0",
    });
    return rule;
  };
  entry.appendChild(separator());
  for (const item of options.items) {
    const button = document.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("role", "menuitem");
    button.setAttribute("data-menu-item", "true");
    button.setAttribute("data-menu-disabled", item.disabled ? "true" : "false");
    button.setAttribute("data-toolkit-workspace-menu-item", item.key);
    button.setAttribute("tabindex", "-1");
    button.setAttribute("aria-label", item.label);
    if (item.disabled) {
      button.setAttribute("disabled", "true");
      button.setAttribute("aria-disabled", "true");
    }
    Object.assign(button.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      width: "calc(100% - 8px)",
      minHeight: "28px",
      margin: "0 4px",
      padding: "4px 8px",
      boxSizing: "border-box",
      border: "1px solid transparent",
      borderRadius: "6px",
      outline: "none",
      background: "transparent",
      color: options.foreground,
      font: "14px system-ui, sans-serif",
      lineHeight: "18px",
      textAlign: "left",
      cursor: item.disabled ? "default" : "pointer",
      opacity: item.disabled ? "0.45" : "1",
    });
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: options.muted,
      "stroke-width": "1.6",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      glyph.setAttribute(key, value);
    glyph.style.flexShrink = "0";
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute(
      "d",
      item.glyph ??
        "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
    );
    glyph.appendChild(shape);
    button.appendChild(glyph);
    button.appendChild(document.createTextNode(item.label));
    const highlight = () => {
      if (!item.disabled) button.style.background = options.hover;
    };
    const clear = () => {
      button.style.background = "transparent";
    };
    button.addEventListener("mouseenter", highlight);
    button.addEventListener("focus", highlight);
    button.addEventListener("mouseleave", clear);
    button.addEventListener("blur", clear);
    button.addEventListener("click", (event) => {
      (event as { stopPropagation(): void }).stopPropagation();
      if (item.disabled) return;
      item.action();
      try {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } catch {
        /* The host owns dismissal on platforms without KeyboardEvent. */
      }
    });
    entry.appendChild(button);
  }
  entry.appendChild(separator());
  let seen = false;
  const remove = () => {
    observer.disconnect();
    entry.remove();
  };
  const place = () => {
    const surface = Array.from(document.querySelectorAll('[data-menu-surface="true"]')).find(
      (candidate) => candidate.querySelector('[data-testid^="sidebar-workspace-menu-"]'),
    );
    if (!surface) {
      if (seen) remove();
      return;
    }
    seen = true;
    const items = Array.from(surface.querySelectorAll('[data-menu-item="true"]')).filter(
      (item) => !entry.contains(item),
    );
    const last = items[items.length - 1];
    const page = last?.parentElement;
    if (!page || (entry.parentElement === page && entry.nextElementSibling === last)) return;
    if (page) page.insertBefore(entry, last);
  };
  const observer = new MutationObserver(place);
  observer.observe(document.body, { childList: true, subtree: true });
  place();
  return remove;
}

export function openNativeWorkspaceMenu(
  workspace: Pick<CatalogWorkspace, "serverId" | "id">,
  anchor: Element,
): boolean {
  if (Platform.OS !== "web") return false;
  const row = nativeWorkspaceRow(workspace);
  return row ? openNativeMenu(row, anchor) : false;
}

/** Opens the original menu, retaining native settings, removal confirmation and Host scope. */
export function openWorkbenchProjectMenu(
  value: unknown,
  group: NativeProjectGroup,
  colors: PluginTheme["colors"],
  organize: () => void,
  fail: (message: string) => void,
): (() => void) | undefined {
  if (Platform.OS !== "web") return;
  const anchor = value as Element | null;
  const row = Array.from(document.querySelectorAll('[data-testid^="sidebar-project-row-"]')).find(
    (entry) =>
      entry.getAttribute("data-testid") === `sidebar-project-row-${group.viewKey}` &&
      !entry.closest("[data-toolkit-project-tree]"),
  );
  if (!anchor || !row || !openNativeMenu(row, anchor)) return;
  const common = {
    border: colors.border,
    foreground: colors.foreground,
    muted: colors.foregroundMuted,
    hover: colors.surface2,
    testId: `sidebar-project-menu-open-settings-${group.viewKey}`,
  };
  const close = () =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const create = mountNativeMenuItem({
    ...common,
    label: tr("新建 workspace"),
    first: true,
    glyph: "M12 5v14M5 12h14",
    action() {
      close();
      void new Promise((resolve) => setTimeout(resolve, 0))
        .then(() => openNativeProjectCreate(group))
        .then((opened) => {
          if (!opened) fail(tr("原生项目操作暂不可用，请切换原生视图后重试。"));
        })
        .catch((error) => fail(String(error)));
    },
  });
  const settings = mountNativeMenuItem({
    ...common,
    label: tr("分组与场景"),
    glyph: "M4 7h16M4 12h16M4 17h16",
    action() {
      close();
      organize();
    },
  });
  return () => {
    create();
    settings();
  };
}

/** A native project may be collapsed or paginated even while its card lists every workspace. */
export async function openWorkbenchWorkspaceMenu(
  value: unknown,
  workspace: CatalogWorkspace,
  group?: NativeProjectGroup,
): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const anchor = value as Element | null;
  if (!anchor) return false;
  if (openNativeWorkspaceMenu(workspace, anchor)) return true;
  if (!group) return false;
  const find = (prefix: string) =>
    Array.from(document.querySelectorAll(`[data-testid^="${prefix}"]`)).find(
      (entry) =>
        entry.getAttribute("data-testid") === `${prefix}${group.viewKey}` &&
        !entry.closest("[data-toolkit-project-tree]"),
    );
  const click = (entry: Element) =>
    entry.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      }),
    );
  const row = find("sidebar-project-row-");
  if (row && !find("sidebar-workspace-list-")) {
    click(row);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  for (let page = 0; page < 20 && anchor.isConnected; page++) {
    if (openNativeWorkspaceMenu(workspace, anchor)) return true;
    const next = find("sidebar-project-show-more-");
    if (!next) break;
    click(next);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return false;
}

function createNativeWorkspaceMenu(options: {
  workspace: CatalogWorkspace;
  groups: NativeProjectGroup[];
  colors: PluginTheme["colors"];
  workspaceMenuExtras?(): WorkspaceMenuExtra[];
  fallback(anchor: Element): void;
}) {
  let generation = 0;
  let disposed = false;
  let removeExtras: (() => void) | undefined;
  return {
    async open(anchor: Element) {
      if (Platform.OS !== "web" || disposed) return;
      const started = ++generation;
      removeExtras?.();
      removeExtras = undefined;
      const active = () => !disposed && started === generation && anchor.isConnected;
      const open = () => {
        if (!active() || !openNativeWorkspaceMenu(options.workspace, anchor)) return false;
        const items = options.workspaceMenuExtras?.() ?? [];
        if (items.length)
          removeExtras = mountWorkspaceMenuExtras({
            items,
            border: options.colors.border,
            foreground: options.colors.foreground,
            muted: options.colors.foregroundMuted,
            hover: options.colors.surface2,
          });
        return true;
      };
      if (open()) return;
      // React retains ownership of native rows. Reveal them through their existing controls.
      const group = options.groups.find((entry) =>
        entry.members.some(
          (member) =>
            member.serverId === options.workspace.serverId &&
            member.projectId === options.workspace.projectId,
        ),
      );
      if (group) {
        const find = (prefix: string) =>
          Array.from(document.querySelectorAll(`[data-testid^="${prefix}"]`)).find(
            (entry) => entry.getAttribute("data-testid") === `${prefix}${group.viewKey}`,
          );
        const click = (entry: Element) =>
          entry.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              clientX: 0,
              clientY: 0,
              button: 0,
            }),
          );
        const project = find("sidebar-project-row-");
        if (project && !find("sidebar-workspace-list-")) {
          click(project);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        for (let page = 0; page < 20 && active(); page++) {
          if (open()) return;
          const next = find("sidebar-project-show-more-");
          if (!next) break;
          click(next);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      if (active()) options.fallback(anchor);
    },
    dispose() {
      disposed = true;
      generation++;
      removeExtras?.();
      removeExtras = undefined;
    },
  };
}

interface MirroredAnimation {
  effect: {
    getKeyframes(): Record<string, unknown>[];
    getTiming(): Record<string, unknown>;
  } | null;
  startTime: number | null;
  cancel(): void;
}
type AnimatedElement = Element & {
  getAnimations?(): MirroredAnimation[];
  animate?(
    keyframes: Record<string, unknown>[],
    timing: Record<string, unknown>,
  ): MirroredAnimation;
};

/** Mirror presentation only; React retains ownership of the original row and its menu handlers. */
export function mirrorNativeWorkspace(
  source: Element,
  target: Element,
  onState?: (selected: boolean, background: string) => void,
  decorate?: (clone: Element) => void,
) {
  if (Platform.OS !== "web") return () => {};
  let animations: MirroredAnimation[] = [];
  const clearAnimations = () => {
    for (const animation of animations) animation.cancel();
    animations = [];
  };
  const paint = () => {
    clearAnimations();
    const clone = (source as Element & { cloneNode(deep: boolean): Element }).cloneNode(true);
    // cloneNode omits the Web Animations driving native status rings. Keep their shared epoch.
    const originals = [source, ...Array.from(source.querySelectorAll("*"))] as AnimatedElement[];
    const copies = [clone, ...Array.from(clone.querySelectorAll("*"))] as AnimatedElement[];
    originals.forEach((original, index) => {
      for (const animation of original.getAnimations?.() ?? []) {
        if (!animation.effect) continue;
        const copy = copies[index]?.animate?.(
          animation.effect.getKeyframes(),
          animation.effect.getTiming(),
        );
        if (copy) {
          copy.startTime = animation.startTime;
          animations.push(copy);
        }
      }
    });
    decorate?.(clone);
    // Test ids are stripped below. Keep a stable hook so the row can hide the
    // recent-activity time while its overflow button is showing.
    for (const time of Array.from(
      clone.querySelectorAll('[data-testid="sidebar-workspace-timestamp"]'),
    ))
      time.setAttribute("data-toolkit-workspace-time", "true");
    for (const control of Array.from(
      clone.querySelectorAll(
        '[data-testid^="sidebar-workspace-kebab-"],[data-testid^="sidebar-workspace-archive-"]',
      ),
    ))
      control.remove();
    for (const entry of [
      clone,
      ...Array.from(clone.querySelectorAll("[data-testid],[id],[tabindex]")),
    ]) {
      entry.removeAttribute("data-testid");
      entry.removeAttribute("id");
      entry.setAttribute("tabindex", "-1");
    }
    clone.setAttribute("aria-hidden", "true");
    clone.style.width = "100%";
    // The shared row owns the backdrop, including the trailing menu button.
    // Selection lives on this trigger; descendants keep their own fills.
    const selected = source.getAttribute("aria-selected") === "true";
    const background = window.getComputedStyle(source).backgroundColor;
    clone.style.background = "transparent";
    onState?.(selected, background);
    target.textContent = "";
    target.appendChild(clone);
  };
  paint();
  const observer = new MutationObserver(paint);
  observer.observe(source, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  return () => {
    observer.disconnect();
    clearAnimations();
  };
}

export function readDevicePreference(key: string): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return localStorage.getItem(`toolkit.project-tree.${key}`);
  } catch {
    return null;
  }
}
export function writeDevicePreference(key: string, value: string) {
  if (Platform.OS !== "web") return;
  try {
    localStorage.setItem(`toolkit.project-tree.${key}`, value);
  } catch {
    /* Private browsing may disable storage. */
  }
}

/** The SDK exposes body styles, while the desktop width belongs to the host dialog. */
export function mountWideWorkbenchModal(value: unknown, maxWidth = 960): () => void {
  if (!value || Platform.OS !== "web") return () => {};
  const dialog = (value as Element).closest('[role="dialog"]');
  if (!dialog) return () => {};
  const previous = dialog.style.maxWidth;
  dialog.style.maxWidth = `${maxWidth}px`;
  return () => {
    dialog.style.maxWidth = previous;
  };
}

/** Mirror workbench controls into the host chrome without reparenting React-owned nodes. */
export function mountWorkbenchHeader(value: unknown): () => void {
  if (!value || Platform.OS !== "web") return () => {};
  const source = value as Element;
  let surface = source.parentElement;
  while (surface && !surface.querySelector('[data-testid="plugin-surface-title"]'))
    surface = surface.parentElement;
  const title = surface?.querySelector('[data-testid="plugin-surface-title"]');
  const close =
    surface?.querySelector('[data-testid="plugin-surface-close"]') ??
    surface?.querySelector('[data-testid="header-back-button"]');
  if (!title || !close || !source.firstElementChild) return () => {};
  let row = close.parentElement;
  while (row && !row.contains(title)) row = row.parentElement;
  if (!row || row.contains(source)) return () => {};
  const compact = close.getAttribute("data-testid") === "header-back-button";
  const frame = compact ? row.parentElement : row.closest('[data-testid="composer-dock-header"]');
  if (!frame?.parentElement?.contains(source)) return () => {};
  const branch = (node: Element) => {
    while (node.parentElement && node.parentElement !== row) node = node.parentElement;
    return node;
  };
  const left = branch(title),
    right = branch(close);
  const key = Math.random().toString(36).slice(2);
  const sourceAttribute = "data-toolkit-workbench-header-source";
  const titleAttribute = "data-toolkit-workbench-header-title";
  const copyAttribute = "data-toolkit-workbench-header-copy";
  const previousSource = source.getAttribute(sourceAttribute);
  const previousTitle = title.getAttribute(titleAttribute);
  const previousAria = source.getAttribute("aria-hidden");
  source.setAttribute(sourceAttribute, key);
  source.setAttribute("aria-hidden", "true");
  title.setAttribute(titleAttribute, key);
  const style = document.createElement("style");
  style.textContent = `[${sourceAttribute}="${key}"],[${titleAttribute}="${key}"]{display:none!important}[${copyAttribute}="${key}"]{-webkit-app-region:no-drag}`;
  document.body.appendChild(style);
  let copies: Element[] = [];
  let bindings: Array<{ source: Element; copy: Element }> = [];
  let stopped = false;
  const mirror = (original: Element, parent: Element, before: Element | null = null) => {
    const copy = original.cloneNode(true);
    copy.setAttribute(copyAttribute, key);
    const originals = Array.from(original.querySelectorAll('button,[role="button"]'));
    const buttons = Array.from(copy.querySelectorAll('button,[role="button"]'));
    buttons.forEach((button, index) => {
      const target = originals[index]!;
      const forward = () => {
        if (
          target.getAttribute("aria-disabled") === "true" ||
          target.getAttribute("disabled") !== null
        )
          return;
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: 0,
            clientY: 0,
            button: 0,
          }),
        );
      };
      button.addEventListener("click", (event) => {
        const input = event as { preventDefault(): void; stopPropagation(): void };
        input.preventDefault();
        input.stopPropagation();
        forward();
      });
      button.addEventListener("keydown", (event) => {
        const input = event as {
          key: string;
          repeat?: boolean;
          preventDefault(): void;
          stopPropagation(): void;
        };
        if (!["Enter", " "].includes(input.key)) return;
        input.preventDefault();
        input.stopPropagation();
        if (!input.repeat) forward();
      });
      bindings.push({ source: target, copy: button });
    });
    parent.insertBefore(copy, before);
    copies.push(copy);
  };
  const render = () => {
    if (stopped) return;
    const focused = bindings.find((binding) => binding.copy === document.activeElement)?.source;
    for (const copy of copies) copy.remove();
    copies = [];
    bindings = [];
    const content = source.firstElementChild;
    if (!content) return;
    if (compact) {
      mirror(content, left, title);
      for (let extra = content.nextElementSibling; extra; extra = extra.nextElementSibling)
        mirror(extra, frame);
    } else if (content.firstElementChild && content.lastElementChild) {
      mirror(content.firstElementChild, left);
      mirror(content.lastElementChild, right, right.firstElementChild);
    }
    if (focused) bindings.find((binding) => binding.source === focused)?.copy.focus();
  };
  render();
  const observer = new MutationObserver(render);
  observer.observe(source, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  const restore = (node: Element, attribute: string, previous: string | null) => {
    if (previous === null) node.removeAttribute(attribute);
    else node.setAttribute(attribute, previous);
  };
  return () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    for (const copy of copies) copy.remove();
    style.remove();
    restore(source, sourceAttribute, previousSource);
    restore(source, "aria-hidden", previousAria);
    restore(title, titleAttribute, previousTitle);
    copies = [];
    bindings = [];
  };
}

/** Only this adapter knows Paseo's DOM boundary; the tree itself never owns host React nodes. */
export function mountProjectSidebar(initialRender: (container: Element) => void) {
  let render = initialRender;
  let enabled = true;
  let stopped = false;
  const mounts = new Map<Element, { panel: Element; display: string }>();
  const restore = (native: Element) => {
    const mounted = mounts.get(native);
    if (!mounted) return;
    native.style.display = mounted.display;
    for (const cleanup of workspaceCleanups.get(mounted.panel) ?? []) cleanup();
    workspaceCleanups.delete(mounted.panel);
    workspaceBindings.delete(mounted.panel);
    workspaceRowIndexes.delete(mounted.panel);
    sidebarRenderStates.delete(mounted.panel);
    menuCleanups.get(mounted.panel)?.();
    mounted.panel.remove();
    mounts.delete(native);
  };
  function paint(native: Element, panel: Element) {
    try {
      render(panel);
      // Do not hide the native tree unless its replacement is actually populated.
      if (!panel.firstElementChild && !panel.textContent) throw new Error("Empty project tree");
      native.style.display = "none";
    } catch (error) {
      console.warn("[Toolkit project tree] Restoring native sidebar", error);
      enabled = false;
      for (const original of mounts.keys()) restore(original);
    }
  }
  function scan(refresh = false) {
    if (stopped || Platform.OS !== "web") return;
    for (const [native, { panel }] of mounts) {
      if (!enabled || !native.isConnected || !panel.isConnected) restore(native);
    }
    if (!enabled) return;
    const originals = indexNativeWorkspaceRows();
    for (const { panel } of mounts.values()) workspaceRowIndexes.set(panel, originals);
    if (refresh) for (const [native, { panel }] of mounts) paint(native, panel);
    if (!enabled) return;
    for (const scroller of Array.from(
      document.querySelectorAll('[data-testid="sidebar-project-workspace-list-scroll"]'),
    )) {
      const native = scroller.parentElement;
      const parent = native?.parentElement;
      // Refuse unknown layouts instead of hiding an arbitrary ancestor after a host upgrade.
      if (!native || !parent?.querySelector('[data-testid="sidebar-footer"]') || mounts.has(native))
        continue;
      const panel = document.createElement("section");
      panel.setAttribute("data-toolkit-project-tree", "true");
      Object.assign(panel.style, {
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0%",
        minHeight: "0",
        overflow: "hidden",
      });
      mounts.set(native, { panel, display: native.style.display });
      workspaceRowIndexes.set(panel, originals);
      parent.insertBefore(panel, native);
      paint(native, panel);
      if (!enabled) break;
    }
    for (const { panel } of mounts.values())
      for (const binding of workspaceBindings.get(panel) ?? [])
        binding.attach(originals.get(binding.expected));
  }
  const affectsSidebar = (entry: Element) => {
    // Mutation records also contain text nodes, which have no element methods.
    if (typeof entry.getAttribute !== "function") return false;
    const id = entry.getAttribute("data-testid");
    return (
      id === "sidebar-project-workspace-list-scroll" ||
      id === "sidebar-footer" ||
      id?.startsWith("sidebar-workspace-row-") ||
      entry.getAttribute("data-toolkit-project-tree") !== null ||
      !!entry.querySelector(
        '[data-testid="sidebar-project-workspace-list-scroll"],[data-testid="sidebar-footer"],[data-testid^="sidebar-workspace-row-"],[data-toolkit-project-tree]',
      )
    );
  };
  const observer =
    Platform.OS === "web"
      ? new MutationObserver((records) => {
          if (
            records.some(
              (record) =>
                !record.target.closest("[data-toolkit-project-tree]") &&
                [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
                  affectsSidebar,
                ),
            )
          )
            scan();
        })
      : null;
  if (observer) {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return {
    setEnabled(value: boolean) {
      if (stopped || enabled === value) return;
      observer?.takeRecords();
      enabled = value;
      scan();
    },
    update(next: (container: Element) => void) {
      if (stopped) return;
      render = next;
      // The full scan includes pending native changes; do not scan them a second time.
      observer?.takeRecords();
      scan(true);
    },
    dispose() {
      stopped = true;
      observer?.disconnect();
      for (const native of mounts.keys()) restore(native);
    },
  };
}

export function renderProjectSidebar(
  container: Element,
  options: {
    snapshot: CatalogSnapshot;
    theme: PluginTheme;
    collapsed: Set<string>;
    toggle(id: string): void;
    open(workspace: CatalogWorkspace): void;
    openSession?(workspace: CatalogWorkspace, session: CatalogSession): void;
    sessionLimits?: Map<string, number>;
    sessionVisibility?: ReadonlyMap<string, boolean>;
    showSessionsByDefault?: boolean;
    toggleSessions?(id: string, projectId?: string): void;
    workspaceMenuExtras?(workspace: CatalogWorkspace, projectId: string): WorkspaceMenuExtra[];
    loadSessions?(): void;
    run?(command: TreeCommand): Promise<void>;
    native(): void;
    viewName?: string;
    readOnly?: boolean;
    knowledgeSpace?: { open(): void };
    projectSourceId?(id: string): string;
    isFavoriteProject?(id: string): boolean;
    groupDisplay?(
      id: string,
    ):
      | { favorite?: boolean; workspacesOnly: boolean; disabled: boolean; toggle(): void }
      | undefined;
    showHidden?: boolean;
    toggleHidden?(): void;
    resetHidden?(): Promise<void>;
    history?: {
      canUndo: boolean;
      snapshots: Array<{
        id: string;
        name: string;
        createdAt: string;
        preview?: {
          nodesChanged: number;
          workspacePlacementsChanged: boolean;
          tabsChanged?: boolean;
          favoritesChanged?: boolean;
          scenariosChanged?: boolean;
        };
      }>;
    };
    saveSnapshot?(name: string): Promise<void>;
    restoreSnapshot?(snapshotId: string): Promise<void>;
    undo?(): Promise<void>;
    move?(id: string, parentId: string | null, beforeId?: string): void;
    moveWorkspace?(workspace: CatalogWorkspace, targetId: string): void;
    renameWorkspace?(workspace: CatalogWorkspace): void;
  },
) {
  if (Platform.OS !== "web") return;
  let state = sidebarRenderStates.get(container);
  if (!state) {
    state = { options: { ...options }, rows: new Map(), draggedId: null, draggedWorkspace: null };
    sidebarRenderStates.set(container, state);
  } else {
    const incoming = options;
    for (const key of Object.keys(state.options)) Reflect.deleteProperty(state.options, key);
    Object.assign(state.options, incoming);
  }
  options = state.options;
  const renderState = state;
  if (menuCleanups.has(container)) {
    if (
      state.menuOwnerId &&
      !options.snapshot.tree.nodes.some((node) => node.id === state.menuOwnerId)
    ) {
      menuCleanups.get(container)?.();
    } else {
      // A polling update must not tear down the menu or its anchor while it is in use.
      state.refreshPending = true;
      return;
    }
  }
  state.refreshPending = false;
  const previousRows = state.rows;
  const nextRows = new Map<string, RenderedWorkspace>();
  state.rows = nextRows;
  const { snapshot, theme, collapsed } = options;
  const originals = workspaceRowIndexes.get(container) ?? indexNativeWorkspaceRows();
  const colors = theme.colors;
  const cleanRow = (row: RenderedWorkspace) => {
    for (const cleanup of row.cleanups) cleanup();
  };
  const allCleanups: Array<() => void> = [
    () => {
      for (const row of previousRows.values()) cleanRow(row);
      previousRows.clear();
    },
  ];
  workspaceCleanups.set(container, allCleanups);
  const bindings: Array<{ expected: string; attach(source?: Element): void }> = [];
  workspaceBindings.set(container, bindings);
  const scrollBody = renderState.scrollBody;
  const scrollTop = scrollBody?.scrollTop ?? 0;
  if (scrollBody) {
    // Keep the native scrollbar alive while refreshing the header and rows.
    while (container.firstElementChild && container.firstElementChild !== scrollBody)
      container.firstElementChild.remove();
  } else container.textContent = "";
  Object.assign(container.style, {
    color: colors.foreground,
    background: colors.surface0,
    fontFamily: "inherit",
    fontSize: "14px",
  });
  const element = (tag: string, parent: Element, text?: string) => {
    const child = document.createElement(tag);
    if (text) child.textContent = text;
    parent.appendChild(child);
    return child;
  };
  const button = (parent: Element, text: string, click: () => void, hover = true) => {
    const child = element("button", parent, text);
    child.setAttribute("type", "button");
    child.setAttribute("aria-label", text);
    Object.assign(child.style, {
      border: "0",
      background: "transparent",
      color: "inherit",
      font: "inherit",
      textAlign: "left",
      cursor: "pointer",
      padding: "7px 10px",
      borderRadius: "6px",
      transition: "background-color 120ms ease-out",
    });
    child.addEventListener("click", click);
    if (hover)
      child.addEventListener("mouseenter", () => {
        if (child.getAttribute("disabled") !== null) return;
        child.style.background =
          parent.getAttribute("role") === "dialog" ? colors.surface2 : colors.surface1;
      });
    if (hover)
      child.addEventListener("mouseleave", () => {
        child.style.background = "transparent";
      });
    return child;
  };
  const glyph = (parent: Element, kind: GlyphKind, size = 16, strokeWidth = "1.6") => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      width: String(size),
      height: String(size),
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(key, value);
    for (const [tag, attributes] of glyphShapes[kind]) {
      const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
      svg.appendChild(shape);
    }
    parent.appendChild(svg);
    return svg;
  };
  const icon = (parent: Element, kind: GlyphKind) => glyph(parent, kind);
  /** 原生 meta 行的 host 徽标：12px 服务器图标 + 主机名，与原生 HostBadge 同款。 */
  const hostBadge = (parent: Element, label: string, suffix = "") => {
    const badge = element("div", parent);
    Object.assign(badge.style, {
      display: "flex",
      alignItems: "center",
      gap: "3px",
      minWidth: "0",
      flexShrink: "1",
    });
    const svg = glyph(badge, "server", 12, "2");
    svg.style.color = colors.foregroundMuted;
    svg.style.flexShrink = "0";
    const text = element("span", badge, `${label}${suffix}`);
    Object.assign(text.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: colors.foregroundMuted,
      fontSize: "12px",
      lineHeight: "16px",
    });
    return badge;
  };
  /**
   * Native project-row actions are 24×24, radius md.
   * Plus uses surfaceSidebarHover (light surface3, dark surface1); kebab uses surface2.
   */
  const actionButton = (child: Element, hover: "sidebar" | "surface2") => {
    child.setAttribute("data-toolkit-row-action", hover);
    child.classList.add("toolkit-row-action");
  };
  let activeHoverCard: (() => void) | null = null;
  /** Mirrors WorkspaceHoverCard: same content, width, placement and close grace as native Paseo. */
  const workspaceHoverCard = (anchor: Element, workspace: CatalogWorkspace, hostLabel: string) => {
    let card: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let copyCleanups: Array<() => void> = [];
    let removeViewportListeners = () => {};
    const clearCloseTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const close = () => {
      clearCloseTimer();
      for (const cleanup of copyCleanups) cleanup();
      copyCleanups = [];
      removeViewportListeners();
      removeViewportListeners = () => {};
      card?.remove();
      card = null;
      if (activeHoverCard === close) activeHoverCard = null;
    };
    const scheduleClose = () => {
      clearCloseTimer();
      timer = setTimeout(close, HOVER_CARD_CLOSE_GRACE);
    };
    const place = (element: Element) => {
      const rect = anchor.getBoundingClientRect();
      const sidebar = anchor.closest("[data-toolkit-project-tree]")?.getBoundingClientRect();
      const size = element.getBoundingClientRect();
      const width = size.width || HOVER_CARD_WIDTH;
      const height = size.height;
      const edge = sidebar?.right ?? rect.right;
      const available = window.innerWidth;
      let left = edge + HOVER_CARD_OFFSET;
      if (available > 0 && available - edge < width + HOVER_CARD_OFFSET)
        left = (sidebar?.left ?? rect.left) - width - HOVER_CARD_OFFSET;
      left = Math.max(HOVER_CARD_EDGE, Math.min(window.innerWidth - width - HOVER_CARD_EDGE, left));
      const top = Math.max(
        HOVER_CARD_EDGE,
        Math.min(window.innerHeight - height - HOVER_CARD_EDGE, rect.top),
      );
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${Math.round(top)}px`;
    };
    const open = () => {
      clearCloseTimer();
      if (card) return;
      activeHoverCard?.();
      copyCleanups = [];
      const next = element("div", document.body);
      card = next;
      next.setAttribute("data-toolkit-workspace-hover", "true");
      next.setAttribute("role", "menu");
      next.setAttribute("aria-label", workspace.name);
      Object.assign(next.style, {
        position: "fixed",
        zIndex: "100001",
        width: `${HOVER_CARD_WIDTH}px`,
        maxWidth: `calc(100vw - ${HOVER_CARD_EDGE * 2}px)`,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        paddingTop: "8px",
        background: colors.surface1,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
        color: colors.foreground,
        font: "14px system-ui, sans-serif",
        lineHeight: "20px",
      });
      const header = element("div", next);
      Object.assign(header.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 12px 8px",
      });
      const title = element("span", header, workspace.name);
      Object.assign(title.style, {
        flex: "1",
        minWidth: "0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: colors.foreground,
        fontSize: "14px",
        fontWeight: "400",
      });
      const infoRow = () => {
        const row = element("div", next);
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 12px 8px",
          minWidth: "0",
        });
        return row;
      };
      const infoIcon = (parent: Element, kind: GlyphKind) => {
        const svg = glyph(parent, kind, 12, "2");
        svg.style.color = colors.foregroundMuted;
        svg.style.flexShrink = "0";
        return svg;
      };
      const infoText = (parent: Element, value: string) => {
        const text = element("span", parent, value);
        Object.assign(text.style, {
          flex: "1",
          minWidth: "0",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: colors.foregroundMuted,
          fontSize: "12px",
          fontWeight: "400",
        });
        return text;
      };
      if (workspace.diffStat) {
        const row = infoRow();
        infoIcon(row, "diff");
        const stat = element("span", row);
        Object.assign(stat.style, {
          display: "flex",
          alignItems: "center",
          height: "20px",
          gap: "4px",
          flexShrink: "0",
        });
        const additions = element(
          "span",
          stat,
          `+${formatDiffCount(workspace.diffStat.additions)}`,
        );
        additions.style.color = colors.statusSuccess;
        additions.style.fontSize = "12px";
        const deletions = element(
          "span",
          stat,
          `-${formatDiffCount(workspace.diffStat.deletions)}`,
        );
        deletions.style.color = colors.statusDanger;
        deletions.style.fontSize = "12px";
      }
      const hostRow = infoRow();
      infoIcon(hostRow, "server");
      infoText(hostRow, hostLabel);
      const copyRow = (kind: GlyphKind, value: string, copyValue: string, copyLabel: string) => {
        const row = infoRow();
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-label", copyLabel);
        Object.assign(row.style, { cursor: "pointer", borderRadius: "6px" });
        const slot = element("span", row);
        Object.assign(slot.style, { display: "flex", alignItems: "center", flexShrink: "0" });
        const text = infoText(row, value);
        let hovered = false;
        let copied = false;
        let reset: ReturnType<typeof setTimeout> | undefined;
        const paint = () => {
          slot.textContent = "";
          const svg = glyph(slot, copied ? "check" : hovered ? "copy" : kind, 12, "2");
          svg.style.color = hovered || copied ? colors.foreground : colors.foregroundMuted;
          text.style.color = hovered || copied ? colors.foreground : colors.foregroundMuted;
        };
        const copy = () => {
          copied = true;
          paint();
          try {
            void navigator.clipboard?.writeText(copyValue).catch(() => {});
          } catch {
            /* Clipboard access can be denied in embedded webviews. */
          }
          if (reset) clearTimeout(reset);
          reset = setTimeout(() => {
            copied = false;
            paint();
          }, 2000);
        };
        paint();
        row.addEventListener("mouseenter", () => {
          hovered = true;
          paint();
        });
        row.addEventListener("mouseleave", () => {
          hovered = false;
          paint();
        });
        row.addEventListener("click", (event) => {
          (event as { stopPropagation(): void }).stopPropagation();
          copy();
        });
        row.addEventListener("keydown", (event) => {
          const input = event as { key: string; preventDefault(): void };
          if (input.key !== "Enter" && input.key !== " ") return;
          input.preventDefault();
          copy();
        });
        copyCleanups.push(() => {
          if (reset) clearTimeout(reset);
        });
      };
      if (workspace.currentBranch)
        copyRow("branch", workspace.currentBranch, workspace.currentBranch, tr("复制分支名称"));
      const directory = workspaceDirectoryLabel(workspace);
      if (directory) copyRow("directory", directory, workspace.cwd, tr("复制路径"));
      place(next);
      next.addEventListener("mouseenter", clearCloseTimer);
      next.addEventListener("mouseleave", scheduleClose);
      document.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
      removeViewportListeners = () => {
        document.removeEventListener("scroll", close, true);
        window.removeEventListener("resize", close);
      };
      activeHoverCard = close;
    };
    return { open, scheduleClose, close };
  };
  const style = element("style", container);
  if (scrollBody) container.insertBefore(style, scrollBody);
  style.textContent = [
    "[data-toolkit-tree-actions]{opacity:0}",
    "[data-toolkit-native-project-actions]{pointer-events:none}",
    "[data-toolkit-tree-row]:hover [data-toolkit-native-project-actions],[data-toolkit-tree-row]:focus-within [data-toolkit-native-project-actions],[data-toolkit-tree-row][data-toolkit-menu-open] [data-toolkit-native-project-actions]{pointer-events:auto}",
    "[data-toolkit-tree-row]:hover [data-toolkit-tree-actions],[data-toolkit-tree-row]:focus-within [data-toolkit-tree-actions],[data-toolkit-tree-row][data-toolkit-menu-open] [data-toolkit-tree-actions],[data-toolkit-workspace][aria-selected='true'] [data-toolkit-tree-actions]{opacity:1}",
    "[data-toolkit-workspace]:hover [data-toolkit-workspace-time],[data-toolkit-workspace]:focus-within [data-toolkit-workspace-time],[data-toolkit-workspace][aria-selected='true'] [data-toolkit-workspace-time]{visibility:hidden}",
    "@media(hover:none){[data-toolkit-tree-actions]{opacity:1}[data-toolkit-native-project-actions]{pointer-events:auto}[data-toolkit-workspace-time]{visibility:hidden}}",
    `.toolkit-row-action{box-sizing:border-box;width:24px!important;height:24px!important;padding:0!important;display:inline-flex!important;align-items:center;justify-content:center;flex-shrink:0;border-radius:6px!important;color:${colors.foregroundMuted}!important;background:transparent!important}`,
    `.toolkit-row-action:hover:not([disabled]),.toolkit-row-action:focus-visible:not([disabled]){color:${colors.foreground}!important}`,
    `.toolkit-row-action[data-toolkit-row-action="sidebar"]:hover:not([disabled]),.toolkit-row-action[data-toolkit-row-action="sidebar"]:focus-visible:not([disabled]){background:${colors.surface1}!important}`,
    `.toolkit-row-action[data-toolkit-row-action="surface2"]:hover:not([disabled]),.toolkit-row-action[data-toolkit-row-action="surface2"]:focus-visible:not([disabled]){background:${colors.surface2}!important}`,
  ].join("");
  const nativeGroups = nativeProjectGroups(
    Object.values(snapshot.catalogs).flatMap((catalog) => catalog.projects),
  );
  const nativeRows = Array.from(document.querySelectorAll('[data-testid^="sidebar-project-row-"]'));
  const context = JSON.stringify([
    options.readOnly,
    snapshot.editable,
    Object.values(snapshot.catalogs).map((catalog) => catalog.projects),
    colors,
    options.viewName?.trim() || tr("我的工作台"),
    [
      options.openSession,
      options.toggleSessions,
      options.moveWorkspace,
      options.renameWorkspace,
      options.run,
      options.move,
    ].map(Boolean),
  ]);
  const header = element("div", container);
  if (scrollBody) container.insertBefore(header, scrollBody);
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    minHeight: "36px",
    padding: "0 12px 0 16px",
    userSelect: "none",
  });
  if (options.readOnly) header.style.display = "none";
  const title = element("span", header, options.viewName?.trim() || tr("我的工作台"));
  Object.assign(title.style, {
    flex: "1",
    color: colors.foregroundMuted,
    fontSize: "12px",
    fontWeight: "400",
  });
  const settings = button(header, "", () =>
    showMenu(settings, [
      {
        label: tr("新增树节点..."),
        icon: "folderPlus",
        disabled: !snapshot.editable || !options.run,
        action: () =>
          renamePanel(settings, tr("新增树节点..."), "", (name) =>
            nodeCommand(undefined, { action: "folder", id: freshId(), name, parentId: null }),
          ),
      },
      {
        label: tr("显示隐藏节点"),
        icon: options.showHidden ? "check" : "show",
        action: () => options.toggleHidden?.(),
      },
      {
        label: tr("取消全部隐藏"),
        icon: "show",
        disabled: !snapshot.editable || !options.resetHidden,
        action: () => {
          void options.resetHidden?.().catch(() => {});
        },
      },
      ...(options.saveSnapshot
        ? [
            {
              label: tr("保存展示快照"),
              icon: "copy" as const,
              separatorBefore: true,
              disabled: !snapshot.editable,
              action: () =>
                renamePanel(
                  settings,
                  tr("保存展示快照"),
                  "",
                  (name) => {
                    void options.saveSnapshot?.(name).catch(() => {});
                  },
                  tr("保存快照"),
                ),
            },
          ]
        : []),
      ...(options.restoreSnapshot
        ? [
            {
              label: tr("恢复展示快照"),
              icon: "show" as const,
              disabled: !snapshot.editable || !options.history?.snapshots.length,
              action: () =>
                showMenu(
                  settings,
                  (options.history?.snapshots ?? []).map((saved) => ({
                    label: saved.name,
                    icon: "copy" as const,
                    action: () =>
                      confirmPanel(
                        settings,
                        tr("恢复展示配置；新发现的项目会保留，当前展示配置会先自动备份。") +
                          (saved.preview
                            ? ` ${saved.preview.nodesChanged} 个节点变更；${[saved.preview.workspacePlacementsChanged && "工作区位置", saved.preview.tabsChanged && "标签页", saved.preview.favoritesChanged && "收藏", saved.preview.scenariosChanged && "场景"].filter(Boolean).join("、") || "其余配置不变"}。`
                            : ""),
                        tr("恢复快照"),
                        () => {
                          void options.restoreSnapshot?.(saved.id).catch(() => {});
                        },
                      ),
                  })),
                ),
            },
          ]
        : []),
      ...(options.undo
        ? [
            {
              label: tr("撤销展示操作"),
              icon: "up" as const,
              disabled: !snapshot.editable || !options.history?.canUndo,
              action: () => {
                void options.undo?.().catch(() => {});
              },
            },
          ]
        : []),
      { label: tr("切换原生视图"), icon: "native", action: options.native, separatorBefore: true },
    ]),
  );
  const settingsIcon = icon(settings, "settings");
  settingsIcon.setAttribute("width", "14");
  settingsIcon.setAttribute("height", "14");
  Object.assign(settings.style, {
    color: colors.foregroundMuted,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
  });
  const settingsLabel = tr("{0}设置", { "0": options.viewName?.trim() || tr("我的工作台") });
  settings.setAttribute("aria-label", settingsLabel);
  settings.setAttribute("title", settingsLabel);
  settings.setAttribute("aria-haspopup", "menu");
  if (options.knowledgeSpace) {
    const pinned = button(container, "", () => options.knowledgeSpace?.open());
    if (scrollBody) container.insertBefore(pinned, scrollBody);
    pinned.setAttribute("data-toolkit-knowledge-space", "true");
    pinned.setAttribute("aria-label", tr("知行空间"));
    pinned.setAttribute("title", tr("固定工作区，工作台内不提供删除或移除操作。"));
    Object.assign(pinned.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      margin: "4px 8px 8px",
      padding: "10px 14px",
      flexShrink: "0",
    });
    const mark = icon(pinned, "session");
    mark.style.color = colors.accent;
    const name = element("span", pinned, tr("知行空间"));
    Object.assign(name.style, { flex: "1", fontWeight: "600", textAlign: "left" });
    const pin = element("span", pinned, tr("固定"));
    Object.assign(pin.style, { fontSize: "11px", color: colors.foregroundMuted });
  }
  const body = scrollBody ?? element("div", container);
  body.textContent = "";
  renderState.scrollBody = body;
  Object.assign(body.style, { flex: "1", overflow: "auto", minHeight: "0", padding: "0 8px 12px" });
  if (snapshot.organizationError) {
    const error = element("p", body, snapshot.organizationError);
    Object.assign(error.style, {
      color: colors.foregroundMuted,
      fontSize: "12px",
      padding: "0 8px",
    });
  }

  const drop = (
    target: Element,
    parentId: string | null,
    beforeId?: string,
    projectId?: string,
  ) => {
    target.addEventListener("dragover", (event) => {
      if (renderState.draggedId || (renderState.draggedWorkspace && projectId)) {
        (event as { preventDefault(): void }).preventDefault();
        target.style.outline = `1px solid ${colors.accent}`;
      }
    });
    target.addEventListener("dragleave", () => {
      target.style.outline = "";
    });
    target.addEventListener("drop", (event) => {
      const input = event as { preventDefault(): void; stopPropagation(): void };
      input.preventDefault();
      input.stopPropagation();
      target.style.outline = "";
      if (snapshot.editable) {
        if (renderState.draggedWorkspace && projectId)
          options.moveWorkspace?.(renderState.draggedWorkspace, projectId);
        else if (renderState.draggedId) options.move?.(renderState.draggedId, parentId, beforeId);
      }
      renderState.draggedId = null;
      renderState.draggedWorkspace = null;
    });
  };
  drop(header, null);
  const showPanel = (anchor: Element, height: number, role = "menu") => {
    menuCleanups.get(container)?.();
    const owner = anchor.closest("[data-toolkit-tree-row]:not([data-toolkit-workspace])");
    const ownerId = owner?.getAttribute("data-toolkit-tree-row") ?? undefined;
    const actionKind = anchor.getAttribute("data-toolkit-row-action");
    const anchorLabel = anchor.getAttribute("aria-label");
    renderState.menuOwnerId = ownerId;
    if (owner) {
      owner.setAttribute("data-toolkit-menu-open", "true");
      owner.style.background = colors.surface1;
    }
    anchor.setAttribute("aria-expanded", "true");
    const overlay = element("div", document.body);
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "99999",
      background: "transparent",
    });
    const menu = element("div", document.body);
    const close = () => {
      if (menuCleanups.get(container) !== close) return;
      menu.remove();
      overlay.remove();
      menuCleanups.delete(container);
      dialogContainers.delete(container);
      renderState.menuOwnerId = undefined;
      if (owner) {
        owner.removeAttribute("data-toolkit-menu-open");
        owner.style.background =
          owner.getAttribute("data-toolkit-hovered") === "true" ? colors.surface1 : "transparent";
      }
      anchor.setAttribute("aria-expanded", "false");
      if (anchor.isConnected) anchor.focus();
      if (renderState.refreshPending)
        void Promise.resolve().then(() => {
          if (
            sidebarRenderStates.get(container) !== renderState ||
            !container.isConnected ||
            !renderState.refreshPending
          )
            return;
          const restoreFocus = document.activeElement === anchor;
          renderProjectSidebar(container, { ...renderState.options });
          if (restoreFocus && !anchor.isConnected) {
            const nextOwner = ownerId
              ? Array.from(container.querySelectorAll("[data-toolkit-tree-row]")).find(
                  (row) => row.getAttribute("data-toolkit-tree-row") === ownerId,
                )
              : undefined;
            const nextAnchor =
              nextOwner && actionKind
                ? Array.from(nextOwner.querySelectorAll("[data-toolkit-row-action]")).find(
                    (entry) => entry.getAttribute("data-toolkit-row-action") === actionKind,
                  )
                : Array.from(container.querySelectorAll("[aria-label]")).find(
                    (entry) => entry.getAttribute("aria-label") === anchorLabel,
                  );
            nextAnchor?.focus();
          }
        });
    };
    menuCleanups.set(container, close);
    if (role === "dialog") dialogContainers.add(container);
    const dismiss = () => {
      if (menu.getAttribute("aria-busy") !== "true") close();
    };
    overlay.addEventListener("click", dismiss);
    const rect = anchor.getBoundingClientRect();
    Object.assign(menu.style, {
      position: "fixed",
      left: `${Math.max(8, Math.min(window.innerWidth - 256, rect.left + rect.width - 240))}px`,
      top: `${Math.max(8, Math.min(window.innerHeight - height - 16, rect.bottom + 4))}px`,
      width: "240px",
      maxHeight: `${Math.max(120, window.innerHeight - 32)}px`,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      zIndex: "100000",
      padding: "4px",
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      background: colors.surface1,
      // This portal is outside the sidebar's themed text inheritance.
      color: colors.foreground,
      font: "14px system-ui, sans-serif",
      lineHeight: "20px",
      boxShadow: "0 8px 24px #0003",
    });
    menu.setAttribute("role", role);
    if (role === "dialog") menu.setAttribute("aria-modal", "true");
    menu.addEventListener("keydown", (event) => {
      const input = event as { key: string; shiftKey: boolean; preventDefault(): void };
      if (role === "dialog" && input.key === "Tab") {
        const controls = Array.from(
          menu.querySelectorAll("input:not([disabled]),button:not([disabled])"),
        );
        if (controls.length) {
          input.preventDefault();
          const index = controls.findIndex((entry) => entry === document.activeElement);
          controls[
            index < 0 ? 0 : (index + (input.shiftKey ? -1 : 1) + controls.length) % controls.length
          ]?.focus();
        }
      }
      if ((event as { key: string }).key === "Escape") dismiss();
    });
    return { menu, close };
  };
  const showMenu = (
    anchor: Element,
    items: Array<{
      label: string;
      icon: GlyphKind;
      action(): void;
      disabled?: boolean;
      separatorBefore?: boolean;
      checked?: boolean;
      checkRole?: "checkbox";
    }>,
  ) => {
    const separators = items.filter((item, index) => index > 0 && item.separatorBefore).length;
    const { menu, close } = showPanel(anchor, items.length * 28 + separators * 9 + 8);
    let first: Element | undefined;
    const enabled: Element[] = [];
    let active: Element | undefined;
    const highlight = (entry?: Element) => {
      active = entry;
      for (const option of enabled)
        option.style.background = option === entry ? colors.surface2 : "transparent";
    };
    for (const item of items) {
      if (item.separatorBefore && item !== items[0]) {
        const separator = element("div", menu);
        separator.setAttribute("role", "separator");
        separator.setAttribute("aria-orientation", "horizontal");
        Object.assign(separator.style, {
          height: "1px",
          flexShrink: "0",
          background: colors.border,
          margin: "4px -4px",
        });
      }
      const entry = button(
        menu,
        "",
        () => {
          close();
          item.action();
        },
        false,
      );
      entry.setAttribute(
        "role",
        item.checked === undefined
          ? "menuitem"
          : item.checkRole === "checkbox"
            ? "menuitemcheckbox"
            : "menuitemradio",
      );
      if (item.checked !== undefined) entry.setAttribute("aria-checked", String(item.checked));
      entry.setAttribute("aria-label", item.label);
      const leading = icon(entry, item.icon);
      leading.style.flexShrink = "0";
      leading.style.color = colors.foregroundMuted;
      element("span", entry, item.label);
      Object.assign(entry.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minHeight: "28px",
        flexShrink: "0",
        padding: "4px 8px",
        border: "1px solid transparent",
        boxSizing: "border-box",
        lineHeight: "18px",
        outline: "none",
      });
      if (item.disabled) {
        entry.setAttribute("disabled", "true");
        entry.style.opacity = ".5";
      } else {
        first ??= entry;
        enabled.push(entry);
        entry.addEventListener("mouseenter", () => highlight(entry));
        entry.addEventListener("focus", () => highlight(entry));
        const clear = () => {
          if (active === entry) highlight();
        };
        entry.addEventListener("mouseleave", clear);
        entry.addEventListener("blur", clear);
      }
    }
    menu.addEventListener("keydown", (event) => {
      const input = event as { key: string; preventDefault(): void };
      if (!enabled.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(input.key)) return;
      input.preventDefault();
      const index = enabled.findIndex((entry) => entry === document.activeElement);
      const next =
        input.key === "Home"
          ? 0
          : input.key === "End"
            ? enabled.length - 1
            : input.key === "ArrowDown"
              ? (index + 1) % enabled.length
              : index < 0
                ? enabled.length - 1
                : (index - 1 + enabled.length) % enabled.length;
      enabled[next]?.focus();
    });
    first?.focus();
  };
  const freshId = () => `folder:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const execute = (command: TreeCommand | null, anchor: Element = container) => {
    if (!command || !options.run) return;
    const submission = createNodeSubmission(({ error }) => {
      if (!error || !container.isConnected) return;
      const { menu, close } = showPanel(anchor, 150, "dialog");
      element("p", menu, error).setAttribute("role", "alert");
      button(menu, tr("取消"), close);
    });
    void submission.perform(
      () => options.run!(command),
      () => {},
    );
  };
  const nodeCommand = (node: TreeNode | undefined, request: NodeActionRequest) =>
    nodeActionCommand(options.snapshot.tree, node?.id, request);
  const panelSubmission = (menu: Element) => {
    const error = element("p", menu);
    error.setAttribute("role", "alert");
    error.style.color = colors.foreground;
    const disabled = new Map<Element, boolean>();
    return createNodeSubmission((state) => {
      menu.setAttribute("aria-busy", String(state.pending));
      error.textContent = state.error;
      for (const control of Array.from(menu.querySelectorAll("input,button"))) {
        if (state.pending) {
          disabled.set(control, control.getAttribute("disabled") !== null);
          control.setAttribute("disabled", "true");
        } else if (!disabled.get(control)) control.removeAttribute("disabled");
      }
    });
  };
  const renamePanel = (
    anchor: Element,
    title: string,
    initial: string,
    command: (name: string) => TreeCommand | null | void,
    saveLabel?: string,
  ) => {
    const { menu, close } = showPanel(anchor, 150, "dialog");
    menu.setAttribute("aria-label", title);
    element("strong", menu, title);
    const input = element("input", menu);
    input.value = initial;
    input.setAttribute("aria-label", tr("名称"));
    input.setAttribute("maxlength", "120");
    Object.assign(input.style, {
      margin: "8px 4px",
      padding: "8px",
      width: "calc(100% - 8px)",
      boxSizing: "border-box",
      color: colors.foreground,
      background: colors.surface0,
      border: `1px solid ${colors.border}`,
      borderRadius: "6px",
      font: "inherit",
    });
    const submission = panelSubmission(menu);
    const save = () => {
      const name = input.value?.trim();
      if (!name) {
        input.focus();
        return;
      }
      const next = command(name);
      if (next && options.run) void submission.perform(() => options.run!(next), close);
      else if (!next) close();
    };
    input.addEventListener("keydown", (event) => {
      if ((event as { key: string }).key === "Enter") {
        (event as { preventDefault(): void }).preventDefault();
        save();
      }
    });
    button(menu, saveLabel ?? tr(initial ? "保存名称" : "创建文件夹"), save);
    button(menu, tr("取消"), close);
    input.focus();
    input.setSelectionRange(0, initial.length);
  };
  const confirmPanel = (
    anchor: Element,
    message: string,
    label: string,
    command: TreeCommand | (() => void),
  ) => {
    const { menu, close } = showPanel(anchor, 170, "dialog");
    menu.setAttribute("aria-label", label);
    const description = element("p", menu, message);
    description.style.padding = "4px 8px";
    const submission = panelSubmission(menu);
    button(menu, label, () => {
      if (typeof command === "function") {
        close();
        command();
      } else if (options.run) void submission.perform(() => options.run!(command), close);
    });
    button(menu, tr("取消"), close).focus();
  };
  const projectLabel = (node: TreeNode) =>
    `${nodePath(snapshot.tree, node)}${node.kind === "project" ? ` · ${node.members.map((member) => snapshot.hosts.find((host) => host.serverId === member.serverId)?.label ?? member.serverId).join(" / ")}` : ""}`;
  const sourceProjectId = (id: string) => options.projectSourceId?.(id) ?? id;
  const sessionsVisible = (id: string) =>
    sessionVisible(
      options.sessionVisibility,
      options.showSessionsByDefault ?? false,
      sourceProjectId(id),
    );
  const workspaceSessionsVisible = (workspace: CatalogWorkspace, projectId: string) =>
    sessionVisible(
      options.sessionVisibility,
      options.showSessionsByDefault ?? false,
      `${workspace.serverId}:${workspace.id}`,
      sourceProjectId(projectId),
    );
  const organize = (anchor: Element, node: TreeNode, create: () => void) => {
    const actions = nodeActions(snapshot.tree, node);
    const items = actions.map<Parameters<typeof showMenu>[1][number]>((item) => ({
      label: tr(item.label),
      icon:
        item.action === "display"
          ? item.checked
            ? "check"
            : "show"
          : item.action === "folder"
            ? "folderPlus"
            : item.action === "menu"
              ? "more"
              : item.action,
      separatorBefore: item.separatorBefore,
      checked: item.checked,
      disabled: item.disabled || (item.action !== "new" && (!snapshot.editable || !options.run)),
      action() {
        switch (item.action) {
          case "new":
            create();
            break;
          case "rename":
            renamePanel(anchor, `${tr("重命名")} · ${node.name}`, node.name, (name) =>
              nodeCommand(node, { action: "rename", name }),
            );
            break;
          case "folder":
            renamePanel(anchor, tr("新建分类文件夹"), "", (name) =>
              nodeCommand(node, { action: "folder", id: freshId(), name, parentId: node.id }),
            );
            break;
          case "up":
          case "down": {
            execute(nodeCommand(node, { action: item.action }), anchor);
            break;
          }
          case "top":
          case "bottom": {
            execute(nodeCommand(node, { action: item.action }), anchor);
            break;
          }
          case "display":
            if (item.mode) execute({ type: "display", id: node.id, mode: item.mode }, anchor);
            break;
          case "move":
            showMenu(anchor, [
              {
                label: tr("顶层"),
                icon: "top",
                action: () => execute({ type: "move", id: node.id, parentId: null }),
              },
              ...folderDestinations(snapshot.tree, node).map((folder) => ({
                label: nodePath(snapshot.tree, folder),
                icon: "folder" as const,
                action: () => execute({ type: "move", id: node.id, parentId: folder.id }),
              })),
            ]);
            break;
          case "merge":
            showMenu(
              anchor,
              snapshot.tree.nodes
                .filter((entry) => entry.kind === "project" && entry.id !== node.id)
                .map((target) => ({
                  label: projectLabel(target),
                  icon: "merge" as const,
                  action: () =>
                    confirmPanel(
                      anchor,
                      `${tr("整个项目及其全部 workspace 将合并显示。")}\n${node.name} → ${target.name}`,
                      tr("确认合并"),
                      nodeCommand(node, { action: "merge", targetId: target.id })!,
                    ),
                })),
            );
            break;
          case "split":
            if (node.kind === "project")
              showMenu(
                anchor,
                node.members.map((member) => {
                  const name =
                    snapshot.catalogs[member.serverId]?.projects.find(
                      (project) => project.projectId === member.projectId,
                    )?.name ?? node.name;
                  const host =
                    snapshot.hosts.find((host) => host.serverId === member.serverId)?.label ??
                    member.serverId;
                  return {
                    label: `${tr("拆出")} ${name} · ${host}`,
                    icon: "split" as const,
                    action: () =>
                      execute(
                        nodeCommand(node, {
                          action: "split",
                          member,
                          id: `split:${freshId()}`,
                          name,
                        }),
                        anchor,
                      ),
                  };
                }),
              );
            break;
          case "delete":
            confirmPanel(
              anchor,
              tr("内容会提升到上一层，不会删除项目或 workspace。"),
              tr("确认删除文件夹"),
              nodeCommand(node, { action: "delete" })!,
            );
            break;
        }
      },
    }));
    if (node.kind === "project" && options.toggleSessions) {
      const index = actions.findIndex((item) => item.action === "display");
      const hidden = !sessionsVisible(node.id);
      const separatorBefore = items[index]?.separatorBefore;
      if (items[index]) items[index]!.separatorBefore = false;
      items.splice(index, 0, {
        label: tr(hidden ? "显示会话列表" : "隐藏会话列表"),
        icon: hidden ? "show" : "hide",
        separatorBefore,
        action: () => options.toggleSessions?.(node.id),
      });
    }
    showMenu(anchor, items);
  };
  if (!snapshot.hosts.length) element("p", body, tr("正在读取项目…"));
  for (const host of snapshot.hosts)
    if (snapshot.errors[host.serverId]) {
      const error = element("p", body, `${host.label}: ${snapshot.errors[host.serverId]}`);
      Object.assign(error.style, {
        color: colors.foregroundMuted,
        fontSize: "12px",
        padding: "0 8px",
      });
    }
  for (const { node, depth, hidden, showContainer } of visibleTreeRows(snapshot.tree, {
    showHidden: options.showHidden,
    collapsed,
  })) {
    if (
      node.kind === "project" &&
      !options.readOnly &&
      !projectAvailable(snapshot, node.members, node.id)
    )
      continue;
    if (showContainer) {
      const native =
        node.kind === "project"
          ? nativeGroups.find((group) =>
              group.members.some((member) =>
                node.members.some(
                  (own) => own.serverId === member.serverId && own.projectId === member.projectId,
                ),
              ),
            )
          : undefined;
      const nativeRow =
        native &&
        nativeRows.find(
          (entry) => entry.getAttribute("data-testid") === `sidebar-project-row-${native.viewKey}`,
        );
      const row = element("div", body);
      row.setAttribute("data-toolkit-tree-row", node.id);
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        marginTop: "8px",
        paddingLeft: `${depth * 14}px`,
        borderRadius: "7px",
        minHeight: "34px",
        opacity: hidden ? ".55" : "1",
      });
      row.addEventListener("mouseenter", () => {
        row.setAttribute("data-toolkit-hovered", "true");
        row.style.background = colors.surface1;
        if (options.readOnly && nativeRow) {
          nativeRow.dispatchEvent(
            new MouseEvent("pointerover", {
              bubbles: true,
              cancelable: true,
              clientX: 0,
              clientY: 0,
              button: 0,
            }),
          );
          setTimeout(() => {
            const background = window.getComputedStyle(nativeRow).backgroundColor;
            if (
              row.isConnected &&
              row.getAttribute("data-toolkit-hovered") &&
              background &&
              background !== "transparent" &&
              background !== "rgba(0, 0, 0, 0)"
            )
              row.style.background = background;
            nativeRow.dispatchEvent(
              new MouseEvent("pointerout", {
                bubbles: true,
                cancelable: true,
                clientX: 0,
                clientY: 0,
                button: 0,
              }),
            );
          }, 16);
        }
      });
      row.addEventListener("mouseleave", () => {
        row.removeAttribute("data-toolkit-hovered");
        if (row.getAttribute("data-toolkit-menu-open") === null)
          row.style.background = "transparent";
      });
      const toggle = button(row, "", () => options.toggle(node.id), false);
      toggle.setAttribute("aria-label", node.name);
      toggle.setAttribute("aria-expanded", String(!collapsed.has(node.id)));
      Object.assign(toggle.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flex: "1",
        minWidth: "0",
        fontWeight: "500",
        padding: "7px 4px",
      });
      const chevron = icon(toggle, "chevron");
      chevron.style.transform = collapsed.has(node.id) ? "none" : "rotate(90deg)";
      chevron.style.flexShrink = "0";
      const groupDisplay = node.kind === "folder" ? options.groupDisplay?.(node.id) : undefined;
      if (node.kind === "folder") {
        const folder = icon(toggle, groupDisplay?.favorite ? "star" : "folder");
        folder.style.color = colors.accent;
      } else {
        const src = nativeRow?.querySelector("img")?.getAttribute("src");
        const leading = element(src ? "img" : "span", toggle, src ? undefined : [...node.name][0]);
        if (src) leading.setAttribute("src", src);
        Object.assign(leading.style, {
          width: "18px",
          height: "18px",
          minWidth: "18px",
          borderRadius: "4px",
          background: src ? "transparent" : colors.accent,
          color: colors.accentForeground,
          textAlign: "center",
          fontSize: "11px",
          lineHeight: "18px",
          objectFit: "contain",
        });
      }
      if (node.kind === "project" && options.isFavoriteProject?.(node.id)) {
        const star = icon(toggle, "star");
        star.style.color = colors.accent;
        star.style.flexShrink = "0";
      }
      const title = element("span", toggle, node.name);
      Object.assign(title.style, {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: "0",
      });
      if (options.showHidden && hidden) {
        const stateLabel = element("span", toggle, tr(node.hidden ? "已隐藏" : "仅显示 Workspace"));
        Object.assign(stateLabel.style, {
          fontSize: "11px",
          color: colors.foregroundMuted,
          flexShrink: "0",
        });
      }
      if (groupDisplay) {
        const actions = element("div", row);
        actions.setAttribute("data-toolkit-tree-actions", "true");
        const more = button(
          actions,
          "",
          () =>
            showMenu(more, [
              {
                label: tr("只显示工作空间"),
                icon: groupDisplay.workspacesOnly ? "check" : "directory",
                checked: groupDisplay.workspacesOnly,
                checkRole: "checkbox",
                disabled: groupDisplay.disabled,
                action: groupDisplay.toggle,
              },
            ]),
          false,
        );
        more.setAttribute("aria-label", `${tr("分组操作")} · ${node.name}`);
        more.setAttribute("aria-haspopup", "menu");
        icon(more, "more");
        actionButton(more, "surface2");
      }
      if (options.readOnly && node.kind === "project") {
        const actions = element("div", row);
        actions.setAttribute("data-toolkit-tree-actions", "true");
        actions.setAttribute("data-toolkit-native-project-actions", "true");
        Object.assign(actions.style, {
          display: "flex",
          alignItems: "center",
          gap: "2px",
          flexShrink: "0",
          paddingRight: "2px",
        });
        const add = button(
          actions,
          "",
          () => {
            if (native)
              void openNativeProjectCreate(native, () => add.isConnected).then((opened) => {
                if (!opened && add.isConnected) options.native();
              });
          },
          false,
        );
        add.setAttribute("aria-label", `${tr("新建 workspace")} · ${node.name}`);
        add.setAttribute("title", tr("新建 workspace"));
        const plusIcon = nativeRow
          ?.querySelector('[data-testid^="sidebar-project-new-worktree-"] svg')
          ?.cloneNode(true);
        if (plusIcon) {
          plusIcon.setAttribute("stroke", "currentColor");
          add.appendChild(plusIcon);
        } else glyph(add, "plus", 15, "2");
        actionButton(add, "sidebar");
        if (!nativeRow?.querySelector('[data-testid^="sidebar-project-new-worktree-"]'))
          add.setAttribute("disabled", "true");
        const more = button(
          actions,
          "",
          () => {
            if (!nativeRow) return;
            const cleanup = () => {
              if (menuCleanups.get(container) !== close) return;
              menuCleanups.delete(container);
              renderState.menuOwnerId = undefined;
              row.removeAttribute("data-toolkit-menu-open");
              if (!row.getAttribute("data-toolkit-hovered")) row.style.background = "transparent";
              if (renderState.refreshPending && container.isConnected)
                renderProjectSidebar(container, { ...renderState.options });
            };
            const close = () => {
              document.body.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
              );
              cleanup();
            };
            row.setAttribute("data-toolkit-menu-open", "true");
            renderState.menuOwnerId = node.id;
            menuCleanups.set(container, close);
            if (!openNativeMenu(nativeRow, more, { alignEnd: true, onClose: cleanup })) {
              cleanup();
              options.native();
            }
          },
          false,
        );
        more.setAttribute("aria-label", `${tr("项目操作")} · ${node.name}`);
        more.setAttribute("title", tr("项目操作"));
        more.setAttribute("aria-haspopup", "menu");
        const moreIcon = nativeRow
          ?.querySelector('[data-testid^="sidebar-project-kebab-"] svg')
          ?.cloneNode(true);
        if (moreIcon) {
          moreIcon.setAttribute("stroke", "currentColor");
          more.appendChild(moreIcon);
        } else glyph(more, "more", 14);
        actionButton(more, "surface2");
        if (!nativeRow?.querySelector('[data-testid^="sidebar-project-kebab-"]'))
          more.setAttribute("disabled", "true");
      }
      if (!options.readOnly) {
        const actions = element("div", row);
        actions.setAttribute("data-toolkit-tree-actions", "true");
        Object.assign(actions.style, {
          display: "flex",
          alignItems: "center",
          alignSelf: "stretch",
          flexShrink: "0",
          paddingRight: "4px",
        });
        const projectGroups =
          node.kind === "project" &&
          snapshot.hosts.every((host) => !!snapshot.catalogs[host.serverId])
            ? nativeGroupsWithin(nativeGroups, node.members).filter((group) =>
                nativeRows.some(
                  (entry) =>
                    entry.getAttribute("data-testid") === `sidebar-project-row-${group.viewKey}`,
                ),
              )
            : [];
        const groupLabel = (group: NativeProjectGroup) =>
          group.members
            .map(
              (member) =>
                snapshot.hosts.find((host) => host.serverId === member.serverId)?.label ??
                member.serverId,
            )
            .join(" / ");
        const create = async (group: NativeProjectGroup) => {
          if (!(await openNativeProjectCreate(group, () => add.isConnected)) && add.isConnected)
            options.native();
        };
        const createWorkspace = () => {
          if (projectGroups.length === 1) void create(projectGroups[0]!);
          else if (projectGroups.length > 1)
            showMenu(
              add,
              projectGroups.map((group) => ({
                label: `${tr("新建 workspace")} · ${groupLabel(group)}`,
                icon: "plus" as const,
                action: () => {
                  void create(group);
                },
              })),
            );
          else options.native();
        };
        const add = button(
          actions,
          "",
          () => {
            if (node.kind === "folder")
              renamePanel(add, tr("新建分类文件夹"), "", (name) => ({
                type: "folder",
                id: freshId(),
                name,
                parentId: node.id,
              }));
            else createWorkspace();
          },
          false,
        );
        add.setAttribute(
          "aria-label",
          `${node.kind === "folder" ? tr("新建分类文件夹") : tr("新建 workspace")} · ${node.name}`,
        );
        icon(add, "plus");
        actionButton(add, "sidebar");
        add.setAttribute(
          "title",
          node.kind === "folder" ? tr("新建分类文件夹") : tr("新建 workspace"),
        );
        if (node.kind === "folder" && !snapshot.editable) add.setAttribute("disabled", "true");
        const more = button(actions, "", () => organize(more, node, createWorkspace), false);
        more.setAttribute("aria-label", `${tr("项目操作")} · ${node.name}`);
        icon(more, "more");
        actionButton(more, "surface2");
        if (snapshot.editable && options.move) {
          row.setAttribute("draggable", "true");
          row.addEventListener("dragstart", (event) => {
            renderState.draggedId = node.id;
            renderState.draggedWorkspace = null;
            (
              event as { dataTransfer?: { setData(type: string, value: string): void } }
            ).dataTransfer?.setData("text/plain", node.id);
          });
          row.addEventListener("dragend", () => {
            renderState.draggedId = null;
          });
          drop(
            row,
            node.kind === "folder" ? node.id : node.parentId,
            node.kind === "project" ? node.id : undefined,
            node.kind === "project" ? node.id : undefined,
          );
        }
      }
    }
    if ((showContainer && collapsed.has(node.id)) || node.kind === "folder") continue;
    const workspaceDepth = depth + (showContainer ? 1 : 0);
    for (const workspace of projectWorkspaces(
      snapshot,
      node.members,
      options.projectSourceId?.(node.id) ?? node.id,
    )) {
      const host = snapshot.hosts.find((entry) => entry.serverId === workspace.serverId);
      const online = host?.status === "online";
      const sessionsOpen = Boolean(
        options.openSession && workspaceSessionsVisible(workspace, node.id),
      );
      const sessions = sessionsOpen ? workspaceSessions(snapshot, workspace) : [];
      const sessionCount = workspaceSessionCount(snapshot, workspace);
      const previousRule = body.lastElementChild?.getAttribute("data-toolkit-workspace-rule-edge");
      const favorite = !!options.isFavoriteProject?.(node.id);
      const cacheId = JSON.stringify([
        ...(options.readOnly ? [node.id] : []),
        workspace.serverId,
        workspace.id,
      ]);
      const key = JSON.stringify([
        workspace,
        host,
        node.id,
        node.parentId,
        workspaceDepth,
        hidden,
        sessionsOpen,
        sessions,
        sessionCount,
        favorite,
        options.sessionLimits?.get(JSON.stringify([workspace.serverId, workspace.id])) ?? 5,
        previousRule === "bottom",
      ]);
      const previous = previousRows.get(cacheId);
      previousRows.delete(cacheId);
      if (previous?.context === context && previous.key === key) {
        for (const entry of previous.elements) body.appendChild(entry);
        if (previous.binding) bindings.push(previous.binding);
        allCleanups.push(() => cleanRow(previous));
        nextRows.set(cacheId, previous);
        continue;
      }
      if (previous) cleanRow(previous);
      const before = body.lastElementChild;
      const rowCleanups: Array<() => void> = [];
      const retained: RenderedWorkspace = { context, key, elements: [], cleanups: rowCleanups };
      nextRows.set(cacheId, retained);
      allCleanups.push(() => cleanRow(retained));
      // Hairline above and below every workspace row. A following row skips its top
      // rule when the previous row already ended with one, so neighbors share a line.
      const workspaceRule = (edge: "top" | "bottom") => {
        const rule = element("div", body);
        rule.setAttribute("data-toolkit-workspace-rule", workspace.id);
        rule.setAttribute("data-toolkit-workspace-rule-edge", edge);
        rule.setAttribute("aria-hidden", "true");
        Object.assign(rule.style, {
          height: "1px",
          margin: "4px 8px",
          background: colors.border,
          opacity: ".55",
          pointerEvents: "none",
        });
      };
      if (previousRule !== "bottom") workspaceRule("top");
      const workspaceRow = element("div", body);
      workspaceRow.setAttribute(
        "data-toolkit-tree-row",
        `workspace:${workspace.serverId}:${workspace.id}`,
      );
      workspaceRow.setAttribute("data-toolkit-workspace", workspace.id);
      Object.assign(workspaceRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        // Native workspace rows have no folder glyph. A leading accent folder collides
        // with folder nodes and sits louder than the muted session bubbles under it.
        // The status dot already marks the row; a hairline under the group separates it.
        paddingLeft: `${workspaceDepth * 14 + 2}px`,
        borderRadius: "8px",
        opacity: online && !hidden ? "1" : ".55",
        position: "relative",
      });
      const content = button(
        workspaceRow,
        "",
        () => {
          if (online) options.open(workspace);
        },
        false,
      );
      let hovered = false;
      let nativeSelected = false;
      const routeMatches = () => {
        const active = activeWorkspaceFromLocation();
        return active?.serverId === workspace.serverId && active.workspaceId === workspace.id;
      };
      let routeSelected = routeMatches();
      let selected = routeSelected;
      // Native selected rows use surfaceSidebarSelected (dark: surface2). The plugin
      // theme omits that token, so keep the color read from the hidden native row.
      let selectedBackground = colors.surface2;
      const paintBackdrop = () => {
        selected = nativeSelected || routeSelected;
        workspaceRow.style.background = selected
          ? selectedBackground
          : hovered
            ? colors.surface1
            : "transparent";
        workspaceRow.setAttribute("aria-selected", String(selected));
      };
      paintBackdrop();
      rowCleanups.push(
        watchWorkspaceRoute(() => {
          const next = routeMatches();
          if (next === routeSelected) return;
          routeSelected = next;
          paintBackdrop();
        }),
      );
      const hostLabel = host?.label?.trim() || workspace.serverId;
      const hoverCard = workspaceHoverCard(workspaceRow, workspace, hostLabel);
      rowCleanups.push(hoverCard.close);
      workspaceRow.addEventListener("mouseenter", () => {
        hovered = true;
        paintBackdrop();
        if (!renderState.draggedWorkspace) hoverCard.open();
      });
      workspaceRow.addEventListener("mouseleave", () => {
        hovered = false;
        paintBackdrop();
        hoverCard.scheduleClose();
      });
      content.setAttribute(
        "aria-label",
        `${workspace.name} · ${host?.label ?? workspace.serverId}`,
      );
      Object.assign(content.style, {
        flex: "1",
        minWidth: "0",
        padding: "0",
        lineHeight: "20px",
      });
      if (!online) content.setAttribute("disabled", "true");
      const fallback = () => {
        content.textContent = "";
        Object.assign(content.style, {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 4px 8px 12px",
        });
        const dot = element("span", content);
        Object.assign(dot.style, {
          width: "6px",
          height: "6px",
          flexShrink: "0",
          borderRadius: "50%",
          background: colors.foregroundMuted,
          opacity: ".45",
        });
        const details = element("span", content);
        Object.assign(details.style, { minWidth: "0", display: "flex", flexDirection: "column" });
        const name = element("span", details, workspace.name);
        Object.assign(name.style, {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        const meta = element("span", details);
        Object.assign(meta.style, {
          display: "flex",
          alignItems: "center",
          minWidth: "0",
          marginTop: "2px",
        });
        hostBadge(
          meta,
          host?.label?.trim() || workspace.serverId,
          online ? "" : ` · ${tr("离线")}`,
        );
      };
      let mirrored: Element | undefined;
      let initialized = false;
      let unmirror = () => {};
      /**
       * 原生只在侧栏同时展示多个 Host 时才画 host 徽标，而工作台始终跨 Host 合并显示。
       * 克隆行里没有徽标时，按原生 meta 行的样式补一行「服务器图标 + 主机名」。
       */
      const ensureHostBadge = (clone: Element) => {
        if (clone.querySelector('[data-testid^="host-badge-"]')) return;
        const title = Array.from(clone.querySelectorAll("div"))
          .filter(
            (entry) => !entry.firstElementChild && entry.textContent?.trim() === workspace.name,
          )
          .pop();
        const titleRow = title?.parentElement;
        const column = titleRow?.parentElement;
        if (!titleRow || !column) return;
        const existing = titleRow.nextElementSibling;
        const meta = existing ?? element("div", column);
        if (existing) {
          const separator = element("span", meta, "·");
          Object.assign(separator.style, {
            color: colors.foregroundMuted,
            fontSize: "12px",
            lineHeight: "16px",
            flexShrink: "0",
          });
        } else {
          Object.assign(meta.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            minWidth: "0",
            marginTop: "1px",
          });
        }
        hostBadge(meta, hostLabel);
      };
      const attach = (source?: Element) => {
        if (initialized && source === mirrored) return;
        initialized = true;
        mirrored = source;
        unmirror();
        if (source) {
          Object.assign(content.style, { display: "block", padding: "0" });
          unmirror = mirrorNativeWorkspace(
            source,
            content,
            (active, background) => {
              nativeSelected = active;
              if (background && background !== "transparent" && background !== "rgba(0, 0, 0, 0)")
                selectedBackground = background;
              paintBackdrop();
            },
            ensureHostBadge,
          );
        } else {
          nativeSelected = false;
          paintBackdrop();
          unmirror = () => {};
          fallback();
        }
      };
      attach(originals.get(`sidebar-workspace-row-${workspace.serverId}:${workspace.id}`));
      if (favorite) {
        const star = glyph(workspaceRow, "star", 12);
        star.setAttribute("data-toolkit-workspace-favorite", "true");
        Object.assign(star.style, {
          position: "absolute",
          left: `${workspaceDepth * 14 + 11}px`,
          bottom: "12px",
          color: colors.accent,
          pointerEvents: "none",
        });
      }
      retained.binding = {
        expected: `sidebar-workspace-row-${workspace.serverId}:${workspace.id}`,
        attach,
      };
      bindings.push(retained.binding);
      rowCleanups.push(() => unmirror());
      // Overlay the overflow button so it does not reserve a column. The mirrored
      // timestamp then sits on the row's right edge, and hides while the button shows.
      const actions = element("div", workspaceRow);
      actions.setAttribute("data-toolkit-tree-actions", "true");
      Object.assign(actions.style, {
        position: "absolute",
        top: "0",
        right: "5px",
        bottom: "0",
        display: "flex",
        alignItems: "center",
        flexShrink: "0",
      });
      let more: Element;
      const nativeMenu = createNativeWorkspaceMenu({
        workspace,
        groups: nativeGroups,
        colors,
        workspaceMenuExtras: options.workspaceMenuExtras
          ? () => options.workspaceMenuExtras!(workspace, sourceProjectId(node.id))
          : undefined,
        fallback(anchor) {
          const hidden = !workspaceSessionsVisible(workspace, sourceProjectId(node.id));
          showMenu(anchor, [
            {
              label: tr("重命名 workspace"),
              icon: "rename",
              action: () => options.renameWorkspace?.(workspace),
              disabled: !online,
            },
            ...(options.toggleSessions
              ? [
                  {
                    label: tr(hidden ? "显示会话" : "隐藏会话"),
                    icon: "session" as const,
                    separatorBefore: true,
                    action: () =>
                      options.toggleSessions?.(
                        `${workspace.serverId}:${workspace.id}`,
                        sourceProjectId(node.id),
                      ),
                  },
                ]
              : []),
            {
              label: tr("切换原生视图"),
              icon: "native" as const,
              separatorBefore: true,
              action: options.native,
            },
          ]);
        },
      });
      rowCleanups.push(() => nativeMenu.dispose());
      const openMenu = () => {
        hoverCard.close();
        return nativeMenu.open(more);
      };
      more = button(
        actions,
        "",
        () => {
          void openMenu();
        },
        false,
      );
      more.setAttribute("aria-label", `${tr("工作区操作")} · ${workspace.name}`);
      icon(more, "more");
      actionButton(more, "surface2");
      workspaceRow.addEventListener("contextmenu", (event) => {
        (event as { preventDefault(): void }).preventDefault();
        void openMenu();
      });
      if (snapshot.editable && options.moveWorkspace) {
        workspaceRow.setAttribute("draggable", "true");
        workspaceRow.addEventListener("dragstart", (event) => {
          hoverCard.close();
          renderState.draggedId = null;
          renderState.draggedWorkspace = workspace;
          (
            event as { dataTransfer?: { setData(type: string, value: string): void } }
          ).dataTransfer?.setData("text/plain", JSON.stringify([workspace.serverId, workspace.id]));
        });
        workspaceRow.addEventListener("dragend", () => {
          renderState.draggedWorkspace = null;
        });
        drop(workspaceRow, node.parentId, undefined, node.id);
      }
      workspaceRule("bottom");
      if (sessionsOpen) {
        const sessionList = element("div", body);
        sessionList.setAttribute("data-toolkit-workspace-sessions", workspace.id);
        sessionList.setAttribute("role", "group");
        sessionList.style.opacity = hidden ? ".55" : "1";
        sessionList.setAttribute("aria-label", workspace.name);
        const key = JSON.stringify([workspace.serverId, workspace.id]);
        const limits = options.sessionLimits ?? new Map<string, number>();
        const renderSessions = () => {
          sessionList.textContent = "";
          const limit = limits.get(key) ?? 5;
          const visible = Math.min(limit, sessions.length);
          const styleSession = (entry: Element) =>
            Object.assign(entry.style, {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              minWidth: "0",
              boxSizing: "border-box",
              padding: `7px 10px 7px ${workspaceDepth * 14 + 18}px`,
            });
          for (const session of sessions.slice(0, visible)) {
            const title = session.title?.trim() || tr("未命名会话");
            const entry = button(sessionList, "", () => options.openSession?.(workspace, session));
            entry.setAttribute("data-toolkit-session", session.id);
            entry.setAttribute("aria-label", title);
            entry.setAttribute("title", title);
            if (!online) entry.setAttribute("disabled", "true");
            styleSession(entry);
            const sessionIcon = icon(entry, "session");
            sessionIcon.setAttribute("data-toolkit-session-icon", "true");
            Object.assign(sessionIcon.style, { color: colors.foregroundMuted, flexShrink: "0" });
            const name = element("span", entry, title);
            Object.assign(name.style, {
              flex: "1",
              minWidth: "0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            });
            const age = Math.max(0, Date.now() - Date.parse(session.updatedAt));
            const time = element(
              "span",
              entry,
              age >= 86400000
                ? `${Math.floor(age / 86400000)}d`
                : age >= 3600000
                  ? `${Math.floor(age / 3600000)}h`
                  : `${Math.floor(age / 60000)}m`,
            );
            Object.assign(time.style, {
              color: colors.foregroundMuted,
              fontSize: "12px",
              flexShrink: "0",
            });
            time.setAttribute("title", session.updatedAt);
          }
          const control = (label: string, next: number) => {
            const entry = button(sessionList, label, () => {
              limits.set(key, next);
              if (next > sessions.length) options.loadSessions?.();
              renderSessions();
            });
            styleSession(entry);
            if (!online && next > sessions.length) entry.setAttribute("disabled", "true");
            entry.style.color = colors.foregroundMuted;
          };
          if (visible < sessionCount)
            control(tr("更多会话({0})", { 0: sessionCount - visible }), visible + 5);
          if (visible > 5) control(tr("收起会话({0})", { 0: visible - 5 }), 5);
        };
        renderSessions();
      }
      for (
        let entry = before ? before.nextElementSibling : body.firstElementChild;
        entry;
        entry = entry.nextElementSibling
      )
        retained.elements.push(entry);
    }
  }
  for (const row of previousRows.values()) cleanRow(row);
  previousRows.clear();
  if (snapshot.hosts.length && !snapshot.tree.nodes.length) element("p", body, tr("暂无项目"));
  body.scrollTop = scrollTop;
}
