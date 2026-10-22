import { Platform } from "react-native";
import type { Element, MutationObserverApi } from "./chat-view/dom";
import type { CatalogSnapshot, CatalogWorkspace } from "./project-tree/catalog";
import { emptyProjectNodes, projectAvailable, projectWorkspaces } from "./project-tree/catalog";
import type { PluginTheme } from "@getpaseo/plugin";
import { tr } from "./i18n";
import {
  nativeGroupsWithin,
  nativeProjectGroups,
  type NativeProjectGroup,
} from "./project-tree/native-groups";
import type { TreeCommand, TreeNode } from "../shared/project-tree/model";
import {
  adjacentMove,
  edgeMove,
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
  querySelectorAll(selector: string): ArrayLike<Element>;
  addEventListener(name: string, callback: (event: unknown) => void, capture?: boolean): void;
  removeEventListener(name: string, callback: (event: unknown) => void, capture?: boolean): void;
};
declare const MutationObserver: new (callback: () => void) => MutationObserverApi;
declare const window: {
  innerWidth: number;
  innerHeight: number;
  location: { pathname: string };
  history: History;
  getComputedStyle(element: Element): { backgroundColor: string };
  addEventListener(name: string, callback: (event: unknown) => void): void;
  removeEventListener(name: string, callback: (event: unknown) => void): void;
};
declare const navigator: {
  clipboard?: { writeText(text: string): Promise<void> };
};
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
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
const formatDiffCount = (value: number) => compactDiffFormatter.format(value).toLowerCase();
/** Mirrors the native workspace card's path label, including the worktree slug when present. */
const workspaceDirectoryLabel = (workspace: CatalogWorkspace) =>
  workspace.worktreeSlug?.trim() || (workspace.cwd ?? "").replace(/^\/(?:Users|home)\/[^/]+/, "~");

type GlyphKind =
  | "folder"
  | "directory"
  | "chevron"
  | "plus"
  | "more"
  | "settings"
  | "diff"
  | "server"
  | "branch"
  | "copy"
  | "check";
/** Lucide geometry, kept here so the web adapter renders the same icons as the native card. */
const glyphShapes: Record<GlyphKind, Array<[string, Record<string, string>]>> = {
  folder: [["path", { d: "M3 7V5h6l2 2h10v12H3Z" }]],
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
};
const menuCleanups = new Map<Element, () => void>();
const workspaceCleanups = new Map<Element, Array<() => void>>();
const workspaceBindings = new Map<
  Element,
  Array<{ expected: string; attach(source?: Element): void }>
>();
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

const patchedHistories = new WeakSet<History>();
const workspaceRouteListeners = new Set<() => void>();

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

/** pushState does not emit popstate, so navigation has to notify selection directly. */
function watchWorkspaceRoute(listener: () => void) {
  if (Platform.OS !== "web") return () => {};
  if (!patchedHistories.has(window.history)) {
    patchedHistories.add(window.history);
    const notify = () => {
      for (const entry of workspaceRouteListeners) entry();
    };
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);
    for (const name of ["pushState", "replaceState"] as const) {
      const original = window.history[name].bind(window.history);
      window.history[name] = (...args: Parameters<History["pushState"]>) => {
        original(...args);
        notify();
      };
    }
  }
  workspaceRouteListeners.add(listener);
  return () => {
    workspaceRouteListeners.delete(listener);
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

function openNativeMenu(row: Element, anchor: Element) {
  const rect = anchor.getBoundingClientRect();
  return !row.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width,
      clientY: rect.bottom,
      button: 2,
    }),
  );
}

export function openNativeWorkspaceMenu(
  workspace: Pick<CatalogWorkspace, "serverId" | "id">,
  anchor: Element,
): boolean {
  if (Platform.OS !== "web") return false;
  const row = nativeWorkspaceRow(workspace);
  return row ? openNativeMenu(row, anchor) : false;
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
  function scan() {
    if (stopped || Platform.OS !== "web") return;
    for (const [native, { panel }] of mounts) {
      if (!enabled || !native.isConnected || !panel.isConnected) restore(native);
    }
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
      parent.insertBefore(panel, native);
      paint(native, panel);
      if (!enabled) break;
    }
    const originals = new Map(
      Array.from(document.querySelectorAll('[data-testid^="sidebar-workspace-row-"]')).map(
        (entry) => [entry.getAttribute("data-testid"), entry],
      ),
    );
    for (const { panel } of mounts.values())
      for (const binding of workspaceBindings.get(panel) ?? [])
        binding.attach(originals.get(binding.expected));
  }
  const observer = Platform.OS === "web" ? new MutationObserver(scan) : null;
  if (observer) {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return {
    setEnabled(value: boolean) {
      enabled = value;
      scan();
    },
    update(next: (container: Element) => void) {
      render = next;
      for (const [native, { panel }] of mounts) paint(native, panel);
      scan();
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
    run?(command: TreeCommand): Promise<void>;
    native(): void;
    showHidden?: boolean;
    toggleHidden?(): void;
    move?(id: string, parentId: string | null, beforeId?: string): void;
    moveWorkspace?(workspace: CatalogWorkspace, targetId: string): void;
    renameWorkspace?(workspace: CatalogWorkspace): void;
  },
) {
  if (Platform.OS !== "web") return;
  const { snapshot, theme, collapsed } = options;
  const colors = theme.colors;
  menuCleanups.get(container)?.();
  for (const cleanup of workspaceCleanups.get(container) ?? []) cleanup();
  const rowCleanups: Array<() => void> = [];
  workspaceCleanups.set(container, rowCleanups);
  const bindings: Array<{ expected: string; attach(source?: Element): void }> = [];
  workspaceBindings.set(container, bindings);
  container.textContent = "";
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
  style.textContent = [
    "[data-toolkit-tree-actions]{opacity:0}",
    "[data-toolkit-tree-row]:hover [data-toolkit-tree-actions],[data-toolkit-tree-row]:focus-within [data-toolkit-tree-actions],[data-toolkit-tree-row][data-toolkit-menu-open] [data-toolkit-tree-actions],[data-toolkit-workspace][aria-selected='true'] [data-toolkit-tree-actions]{opacity:1}",
    "@media(hover:none){[data-toolkit-tree-actions]{opacity:1}}",
    // Native trailing content stays on the right edge. Hover paints a 48px fade
    // (transparent until 55%) in the row background, then the 24px kebab on top.
    "[data-toolkit-workspace-scrim]{display:none}",
    "[data-toolkit-workspace]:hover [data-toolkit-workspace-scrim],[data-toolkit-workspace]:focus-within [data-toolkit-workspace-scrim],[data-toolkit-workspace][data-toolkit-menu-open] [data-toolkit-workspace-scrim]{display:block}",
    `.toolkit-row-action{box-sizing:border-box;width:24px!important;height:24px!important;padding:0!important;display:inline-flex!important;align-items:center;justify-content:center;flex-shrink:0;border-radius:6px!important;color:${colors.foregroundMuted}!important;background:transparent!important}`,
    `.toolkit-row-action:hover:not([disabled]),.toolkit-row-action:focus-visible:not([disabled]){color:${colors.foreground}!important}`,
    `.toolkit-row-action[data-toolkit-row-action="sidebar"]:hover:not([disabled]),.toolkit-row-action[data-toolkit-row-action="sidebar"]:focus-visible:not([disabled]){background:${colors.surface1}!important}`,
    `.toolkit-row-action[data-toolkit-row-action="surface2"]:hover:not([disabled]),.toolkit-row-action[data-toolkit-row-action="surface2"]:focus-visible:not([disabled]){background:${colors.surface2}!important}`,
  ].join("");
  const nativeGroups = nativeProjectGroups(
    Object.values(snapshot.catalogs).flatMap((catalog) => catalog.projects),
  );
  const nativeRows = Array.from(document.querySelectorAll('[data-testid^="sidebar-project-row-"]'));
  const header = element("div", container);
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    minHeight: "36px",
    padding: "0 12px 0 16px",
    userSelect: "none",
  });
  const title = element("span", header, tr("万象工作台"));
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
        disabled: !snapshot.editable || !options.run,
        action: () =>
          renamePanel(settings, tr("新增树节点..."), "", (name) => ({
            type: "folder",
            id: freshId(),
            name,
            parentId: null,
          })),
      },
      {
        label: `${options.showHidden ? "✓ " : ""}${tr("显示隐藏节点")}`,
        action: () => options.toggleHidden?.(),
      },
      { label: tr("切换原生视图"), action: options.native, separatorBefore: true },
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
  settings.setAttribute("aria-label", tr("万象工作台设置"));
  settings.setAttribute("title", tr("万象工作台设置"));
  settings.setAttribute("aria-haspopup", "menu");
  const body = element("div", container);
  Object.assign(body.style, { flex: "1", overflow: "auto", minHeight: "0", padding: "0 8px 12px" });
  if (snapshot.organizationError) {
    const error = element("p", body, snapshot.organizationError);
    Object.assign(error.style, {
      color: colors.foregroundMuted,
      fontSize: "12px",
      padding: "0 8px",
    });
  }
  let draggedId: string | null = null;
  let draggedWorkspace: CatalogWorkspace | null = null;
  const drop = (
    target: Element,
    parentId: string | null,
    beforeId?: string,
    projectId?: string,
  ) => {
    target.addEventListener("dragover", (event) => {
      if (draggedId || (draggedWorkspace && projectId)) {
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
        if (draggedWorkspace && projectId) options.moveWorkspace?.(draggedWorkspace, projectId);
        else if (draggedId) options.move?.(draggedId, parentId, beforeId);
      }
      draggedId = null;
      draggedWorkspace = null;
    });
  };
  drop(header, null);
  const showPanel = (anchor: Element, height: number, role = "menu") => {
    menuCleanups.get(container)?.();
    const owner = anchor.closest("[data-toolkit-tree-row]:not([data-toolkit-workspace])");
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
      menu.remove();
      overlay.remove();
      menuCleanups.delete(container);
      if (owner) {
        owner.removeAttribute("data-toolkit-menu-open");
        owner.style.background =
          owner.getAttribute("data-toolkit-hovered") === "true" ? colors.surface1 : "transparent";
      }
      anchor.setAttribute("aria-expanded", "false");
      if (anchor.isConnected) anchor.focus();
    };
    menuCleanups.set(container, close);
    overlay.addEventListener("click", close);
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
      if ((event as { key: string }).key === "Escape") {
        close();
        anchor.focus();
      }
    });
    return { menu, close };
  };
  const showMenu = (
    anchor: Element,
    items: Array<{ label: string; action(): void; disabled?: boolean; separatorBefore?: boolean }>,
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
        item.label,
        () => {
          close();
          item.action();
        },
        false,
      );
      entry.setAttribute("role", "menuitem");
      Object.assign(entry.style, {
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
  const execute = (command: TreeCommand) => {
    if (options.run) void options.run(command).catch(() => {});
  };
  const renamePanel = (
    anchor: Element,
    title: string,
    initial: string,
    command: (name: string) => TreeCommand,
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
    const save = () => {
      const name = input.value?.trim();
      if (!name) {
        input.focus();
        return;
      }
      close();
      execute(command(name));
    };
    input.addEventListener("keydown", (event) => {
      if ((event as { key: string }).key === "Enter") {
        (event as { preventDefault(): void }).preventDefault();
        save();
      }
    });
    button(menu, tr(initial ? "保存名称" : "创建文件夹"), save);
    button(menu, tr("取消"), close);
    input.focus();
    input.setSelectionRange(0, initial.length);
  };
  const confirmPanel = (anchor: Element, message: string, label: string, command: TreeCommand) => {
    const { menu, close } = showPanel(anchor, 170, "dialog");
    menu.setAttribute("aria-label", label);
    const description = element("p", menu, message);
    description.style.padding = "4px 8px";
    button(menu, label, () => {
      close();
      execute(command);
    });
    button(menu, tr("取消"), close).focus();
  };
  const projectLabel = (node: TreeNode) =>
    `${nodePath(snapshot.tree, node)}${node.kind === "project" ? ` · ${node.members.map((member) => snapshot.hosts.find((host) => host.serverId === member.serverId)?.label ?? member.serverId).join(" / ")}` : ""}`;
  const organize = (anchor: Element, node: TreeNode, create: () => void) =>
    showMenu(
      anchor,
      nodeActions(snapshot.tree, node, emptyProjectNodes(snapshot).length).map((item) => ({
        label: tr(item.label),
        separatorBefore: item.separatorBefore,
        disabled: item.disabled || (item.action !== "new" && (!snapshot.editable || !options.run)),
        action() {
          switch (item.action) {
            case "new":
              create();
              break;
            case "rename":
              renamePanel(anchor, `${tr("重命名")} · ${node.name}`, node.name, (name) => ({
                type: "rename",
                id: node.id,
                name,
              }));
              break;
            case "folder":
              renamePanel(anchor, tr("新建分类文件夹"), "", (name) => ({
                type: "folder",
                id: freshId(),
                name,
                parentId: node.id,
              }));
              break;
            case "up":
            case "down": {
              const command = adjacentMove(snapshot.tree, node, item.action);
              if (command) execute(command);
              break;
            }
            case "top":
            case "bottom": {
              const command = edgeMove(snapshot.tree, node, item.action);
              if (command) execute(command);
              break;
            }
            case "hide":
              execute({ type: "hide", id: node.id, hidden: !node.hidden });
              break;
            case "hideEmpty":
              execute({
                type: "hideEmpty",
                ids: emptyProjectNodes(snapshot).map((entry) => entry.id),
              });
              break;
            case "move":
              showMenu(anchor, [
                {
                  label: tr("顶层"),
                  action: () => execute({ type: "move", id: node.id, parentId: null }),
                },
                ...folderDestinations(snapshot.tree, node).map((folder) => ({
                  label: nodePath(snapshot.tree, folder),
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
                    action: () =>
                      confirmPanel(
                        anchor,
                        `${tr("整个项目及其全部 workspace 将合并显示。")}\n${node.name} → ${target.name}`,
                        tr("确认合并"),
                        { type: "merge", sourceId: node.id, targetId: target.id },
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
                      action: () =>
                        execute({
                          type: "split",
                          id: node.id,
                          member,
                          newId: `split:${freshId()}`,
                          name,
                        }),
                    };
                  }),
                );
              break;
            case "delete":
              confirmPanel(
                anchor,
                tr("内容会提升到上一层，不会删除项目或 workspace。"),
                tr("确认删除文件夹"),
                { type: "removeFolder", id: node.id },
              );
              break;
          }
        },
      })),
    );
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
  const renderNodes = (parentId: string | null, depth: number) => {
    for (const node of snapshot.tree.nodes.filter((entry) => entry.parentId === parentId)) {
      if (node.hidden && !options.showHidden) continue;
      if (node.kind === "project" && !projectAvailable(snapshot, node.members, node.id)) continue;
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
        opacity: node.hidden ? ".55" : "1",
      });
      row.addEventListener("mouseenter", () => {
        row.setAttribute("data-toolkit-hovered", "true");
        row.style.background = colors.surface1;
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
      if (node.kind === "folder") {
        const folder = icon(toggle, "folder");
        folder.style.color = colors.accent;
      } else {
        const native = nativeGroups.find((group) =>
          group.members.some((member) =>
            node.members.some(
              (own) => own.serverId === member.serverId && own.projectId === member.projectId,
            ),
          ),
        );
        const nativeRow =
          native &&
          nativeRows.find(
            (entry) =>
              entry.getAttribute("data-testid") === `sidebar-project-row-${native.viewKey}`,
          );
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
      const title = element("span", toggle, node.name);
      Object.assign(title.style, {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: "0",
      });
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
          draggedId = node.id;
          draggedWorkspace = null;
          (
            event as { dataTransfer?: { setData(type: string, value: string): void } }
          ).dataTransfer?.setData("text/plain", node.id);
        });
        row.addEventListener("dragend", () => {
          draggedId = null;
        });
        drop(
          row,
          node.kind === "folder" ? node.id : node.parentId,
          node.kind === "project" ? node.id : undefined,
          node.kind === "project" ? node.id : undefined,
        );
      }
      if (collapsed.has(node.id)) continue;
      if (node.kind === "folder") {
        renderNodes(node.id, depth + 1);
        continue;
      }
      for (const workspace of projectWorkspaces(snapshot, node.members, node.id)) {
        const host = snapshot.hosts.find((entry) => entry.serverId === workspace.serverId);
        const online = host?.status === "online";
        const workspaceRow = element("div", body);
        workspaceRow.setAttribute(
          "data-toolkit-tree-row",
          `workspace:${workspace.serverId}:${workspace.id}`,
        );
        workspaceRow.setAttribute("data-toolkit-workspace", workspace.id);
        Object.assign(workspaceRow.style, {
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "2px",
          paddingLeft: `${depth * 14}px`,
          borderRadius: "8px",
          opacity: online ? "1" : ".55",
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
        const scrim = element("div", workspaceRow);
        scrim.setAttribute("data-toolkit-workspace-scrim", "true");
        scrim.setAttribute("aria-hidden", "true");
        Object.assign(scrim.style, {
          display: "none",
          position: "absolute",
          top: "0",
          right: "0",
          bottom: "0",
          width: "48px",
          pointerEvents: "none",
          borderRadius: "0 8px 8px 0",
        });
        const paintScrim = () => {
          const background = workspaceRow.style.background;
          scrim.style.background = `linear-gradient(to right, transparent, ${
            background && background !== "transparent" ? background : colors.surface0
          } 55%)`;
        };
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
          paintScrim();
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
          if (!draggedWorkspace) hoverCard.open();
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
         * 原生只在侧栏同时展示多个 Host 时才画 host 徽标，而万象工作台始终跨 Host 合并显示。
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
        attach(nativeWorkspaceRow(workspace));
        bindings.push({
          expected: `sidebar-workspace-row-${workspace.serverId}:${workspace.id}`,
          attach,
        });
        rowCleanups.push(() => unmirror());
        paintScrim();
        const actions = element("div", workspaceRow);
        actions.setAttribute("data-toolkit-tree-actions", "true");
        Object.assign(actions.style, {
          position: "absolute",
          top: "0",
          right: "5px",
          bottom: "0",
          display: "flex",
          alignItems: "center",
        });
        let more: Element;
        const openMenu = async () => {
          hoverCard.close();
          if (openNativeWorkspaceMenu(workspace, more)) return;
          // The original project may be collapsed or paginated. Reveal its row without moving
          // any React-owned DOM, then let the native context menu handle all operations.
          const group = nativeGroups.find((entry) =>
            entry.members.some(
              (member) =>
                member.serverId === workspace.serverId && member.projectId === workspace.projectId,
            ),
          );
          if (group) {
            const project = nativeRows.find(
              (entry) =>
                entry.getAttribute("data-testid") === `sidebar-project-row-${group.viewKey}`,
            );
            const list = () =>
              Array.from(
                document.querySelectorAll('[data-testid^="sidebar-workspace-list-"]'),
              ).find(
                (entry) =>
                  entry.getAttribute("data-testid") === `sidebar-workspace-list-${group.viewKey}`,
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
            if (project && !list()) {
              click(project);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            for (let page = 0; page < 20 && more.isConnected; page += 1) {
              if (openNativeWorkspaceMenu(workspace, more)) return;
              const next = Array.from(
                document.querySelectorAll('[data-testid^="sidebar-project-show-more-"]'),
              ).find(
                (entry) =>
                  entry.getAttribute("data-testid") ===
                  `sidebar-project-show-more-${group.viewKey}`,
              );
              if (!next) break;
              click(next);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
          if (more.isConnected)
            showMenu(more, [
              {
                label: tr("重命名 workspace"),
                action: () => options.renameWorkspace?.(workspace),
                disabled: !online,
              },
              { label: tr("切换原生视图"), action: options.native },
            ]);
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
            draggedId = null;
            draggedWorkspace = workspace;
            (
              event as { dataTransfer?: { setData(type: string, value: string): void } }
            ).dataTransfer?.setData(
              "text/plain",
              JSON.stringify([workspace.serverId, workspace.id]),
            );
          });
          workspaceRow.addEventListener("dragend", () => {
            draggedWorkspace = null;
          });
          drop(workspaceRow, node.parentId, undefined, node.id);
        }
      }
    }
  };
  renderNodes(null, 0);
  if (snapshot.hosts.length && !snapshot.tree.nodes.length) element("p", body, tr("暂无项目"));
}
