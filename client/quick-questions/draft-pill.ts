import { Platform } from "react-native";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  claimWorkspace,
  readWorkspace,
  type Question,
} from "../../shared/quick-questions/contracts";
import type { Document, Element, Window } from "../chat-view/dom";
import { subscribeLocale } from "../chat-view/locale";
import { tr } from "../i18n";
import {
  findDraftComposerInput,
  getDraftComposerAccess,
  sendDraftComposer,
} from "./draft-composer";

declare const document: Document;
declare const window: Window;
declare const navigator: {
  clipboard?: { writeText(text: string): Promise<void> };
};

const IMPORT_PILL = '[data-testid="composer-import-agent-pill"]';
const DECK_PREFIX = "workspace-deck-entry-";
const DECK_ENTRY = `[data-testid^="${DECK_PREFIX}"]`;
const POLL_INTERVAL_MS = 250;
const CLAIM_RETRY_MS = 3000;
const POPOVER_WIDTH = 340;
const POPOVER_GAP = 8;
const POPOVER_MAX_HEIGHT = 460;

const ICON_MESSAGE = [
  "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  "M13 8H7",
  "M17 12H7",
];
const ICON_SETTINGS = [
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
];
const ICON_EDIT = ["M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"];

interface QuestionsData {
  featureEnabled: boolean;
  enabled: boolean;
  questions: Question[];
}

interface Palette {
  surface: string;
  surfaceAlt: string;
  foreground: string;
  muted: string;
  border: string;
  hover: string;
  danger: string;
}

export interface DraftPillController {
  setEnabled(next: boolean): void;
  dispose(): void;
}

/**
 * The host offers no draft seam to plugins: `addComposerPill` needs an agent, and the draft row is
 * plain DOM. This adapter places a matching button beside the import-session pill and renders its
 * quick-questions popover in the same realm, so the whole entry point stays inside the plugin.
 */
export function createDraftPill(client: PluginClientContext): DraftPillController {
  let enabled = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let button: Element | null = null;
  let label: Element | null = null;
  let anchor: Element | null = null;
  let styledPill: Element | null = null;
  let popover: Element | null = null;
  let listElement: Element | null = null;
  let statusElement: Element | null = null;
  let detachPopoverListeners: (() => void) | null = null;
  let workspaceId = "";
  /**
   * A workspace is owned by exactly one connected host. Every host evaluates this plugin, so the
   * host must prove ownership before touching the shared draft pill row.
   */
  let ownership: "unknown" | "owned" | "foreign" = "unknown";
  const ownershipByWorkspace = new Map<string, boolean>();
  let claimToken = 0;
  let claimRetry: ReturnType<typeof setTimeout> | undefined;
  let data: QuestionsData | null = null;
  let loading = false;
  let error = "";
  let message = "";
  let request = 0;
  let baseBackground = "transparent";
  let baseColor = "inherit";
  let hoverBackground = "transparent";
  let hoverColor = "inherit";
  let palette: Palette = {
    surface: "#ffffff",
    surfaceAlt: "#f4f4f5",
    foreground: "#1a1a1e",
    muted: "#71717a",
    border: "rgba(0, 0, 0, 0.12)",
    hover: "rgba(0, 0, 0, 0.05)",
    danger: "#dc2626",
  };

  const unsubscribeLocale = subscribeLocale(() => {
    if (stopped || !enabled || !isWeb()) return;
    closePopover();
    removeButton();
    sync();
  });

  function sync() {
    if (stopped || !enabled || !isWeb()) return;
    const pill = visibleImportPill();
    if (!pill) {
      detach();
      return;
    }
    const nextWorkspaceId = workspaceIdFor(pill);
    if (!nextWorkspaceId) {
      detach();
      return;
    }
    if (nextWorkspaceId !== workspaceId) {
      closePopover();
      workspaceId = nextWorkspaceId;
      data = null;
      error = "";
      message = "";
      const claimed = ownershipByWorkspace.get(nextWorkspaceId);
      ownership = claimed === undefined ? "unknown" : claimed ? "owned" : "foreign";
      if (claimed === undefined) claimOwnership();
    }
    anchor = pill;
    if (ownership === "owned") mountButton(pill);
    else removeButton();
    if (popover) positionPopover();
  }

  function claimOwnership() {
    const target = workspaceId;
    if (!target || stopped || !enabled) return;
    clearClaimRetry();
    const token = ++claimToken;
    void client
      .rpc(claimWorkspace, { workspaceId: target })
      .then((result) => {
        if (stopped || !enabled || workspaceId !== target || token !== claimToken) return;
        ownershipByWorkspace.set(target, result.claimed);
        ownership = result.claimed ? "owned" : "foreign";
        if (result.claimed) sync();
        else removeButton();
      })
      .catch(() => {
        if (stopped || !enabled || workspaceId !== target || token !== claimToken) return;
        // Leave ownership unknown and retry; a disconnected host must not claim the row.
        ownership = "unknown";
        claimRetry = setTimeout(() => {
          claimRetry = undefined;
          claimOwnership();
        }, CLAIM_RETRY_MS);
      });
  }

  function clearClaimRetry() {
    if (claimRetry !== undefined) clearTimeout(claimRetry);
    claimRetry = undefined;
  }

  function mountButton(pill: Element) {
    const parent = pill.parentElement;
    if (!parent) return;
    if (!button) button = buildButton();
    // Only insert when the button is detached. Reasserting the exact sibling position every poll
    // makes two plugin instances trade places forever when several hosts are connected.
    if (button.parentElement !== parent) {
      parent.insertBefore(button, pill.nextElementSibling);
    }
    if (styledPill !== pill) {
      styleButton(button, pill);
      styledPill = pill;
    }
  }

  function buildButton(): Element {
    const element = document.createElement("button");
    element.setAttribute("type", "button");
    element.setAttribute("data-testid", "toolkit-quick-questions-pill");
    element.setAttribute("aria-haspopup", "dialog");
    element.setAttribute("aria-expanded", "false");
    const icon = createIcon(ICON_MESSAGE, 14);
    icon.style.pointerEvents = "none";
    label = document.createElement("span");
    label.textContent = tr("快捷提问");
    label.style.pointerEvents = "none";
    element.appendChild(icon);
    element.appendChild(label);
    element.addEventListener("click", (event) => {
      stopEvent(event);
      if (popover) closePopover();
      else openPopover();
    });
    element.addEventListener("mouseenter", () => {
      if (!element.isConnected) return;
      element.style.backgroundColor = hoverBackground;
      element.style.color = hoverColor;
    });
    element.addEventListener("mouseleave", () => {
      if (!element.isConnected) return;
      element.style.backgroundColor = baseBackground;
      element.style.color = baseColor;
    });
    applyLabels(element);
    return element;
  }

  function applyLabels(element: Element) {
    const text = tr("快捷提问");
    element.setAttribute("aria-label", text);
    element.setAttribute("title", text);
    if (label) label.textContent = text;
  }

  function styleButton(element: Element, pill: Element) {
    const pillStyle = window.getComputedStyle(pill);
    const pillLabel = labelElement(pill);
    const labelStyle = pillLabel ? window.getComputedStyle(pillLabel) : pillStyle;
    const input = findDraftComposerInput(workspaceId);
    const inputStyle = input ? window.getComputedStyle(input) : labelStyle;
    baseBackground = pillStyle.backgroundColor || "transparent";
    baseColor = labelStyle.color || pillStyle.color || "inherit";
    hoverColor = inputStyle.color || baseColor;
    hoverBackground =
      baseBackground === "transparent"
        ? baseBackground
        : mix(baseBackground, hoverColor || baseColor, 7);
    Object.assign(element.style, {
      appearance: "none",
      webkitAppearance: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      columnGap: pillStyle.gap || "8px",
      minHeight: pillStyle.minHeight || "32px",
      paddingTop: pillStyle.paddingTop || "4px",
      paddingRight: pillStyle.paddingRight || "12px",
      paddingBottom: pillStyle.paddingBottom || "4px",
      paddingLeft: pillStyle.paddingLeft || "12px",
      borderRadius: pillStyle.borderTopLeftRadius || "16px",
      borderWidth: pillStyle.borderTopWidth || "1px",
      borderStyle: pillStyle.borderTopStyle || "solid",
      borderColor: pillStyle.borderTopColor || "transparent",
      backgroundColor: baseBackground,
      color: baseColor,
      fontFamily: labelStyle.fontFamily || pillStyle.fontFamily || "inherit",
      fontSize: labelStyle.fontSize || pillStyle.fontSize || "13px",
      fontWeight: labelStyle.fontWeight || "400",
      lineHeight: labelStyle.lineHeight || "normal",
      whiteSpace: "nowrap",
      cursor: "pointer",
      boxSizing: "border-box",
      transition: "background-color 120ms ease, color 120ms ease",
    });
  }

  function openPopover() {
    if (!button || !anchor || !workspaceId) return;
    palette = resolvePalette(anchor);
    popover = buildPopover();
    document.body.appendChild(popover);
    button.setAttribute("aria-expanded", "true");
    installPopoverListeners();
    render();
    positionPopover();
    void load();
  }

  function closePopover() {
    detachPopoverListeners?.();
    detachPopoverListeners = null;
    popover?.remove();
    popover = null;
    listElement = null;
    statusElement = null;
    request += 1;
    button?.setAttribute("aria-expanded", "false");
  }

  function detach() {
    closePopover();
    removeButton();
    claimToken += 1;
    clearClaimRetry();
    ownership = "unknown";
    workspaceId = "";
    data = null;
    error = "";
    message = "";
  }

  function removeButton() {
    button?.remove();
    button = null;
    label = null;
    anchor = null;
    styledPill = null;
  }

  function load() {
    const target = workspaceId;
    const token = ++request;
    loading = true;
    error = "";
    message = "";
    render();
    return client
      .rpc(readWorkspace, { workspaceId: target })
      .then((result) => {
        if (!popover || target !== workspaceId || token !== request) return;
        data = result;
        loading = false;
        render();
      })
      .catch((cause: unknown) => {
        if (!popover || target !== workspaceId || token !== request) return;
        data = null;
        loading = false;
        error = cause instanceof Error ? cause.message : String(cause);
        render();
      });
  }

  function buildPopover(): Element {
    const surface = palette.surface;
    const container = document.createElement("div");
    container.setAttribute("data-testid", "toolkit-quick-questions-popover");
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", tr("快捷提问"));
    Object.assign(container.style, {
      position: "fixed",
      zIndex: "2147483000",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: `${POPOVER_WIDTH}px`,
      padding: "10px",
      boxSizing: "border-box",
      overflow: "hidden",
      background: surface,
      color: palette.foreground,
      border: `1px solid ${palette.border}`,
      borderRadius: "12px",
      boxShadow: "0 16px 40px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)",
      fontFamily: "inherit",
      fontSize: "13px",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexShrink: "0",
    });
    const title = document.createElement("div");
    title.textContent = tr("快捷提问");
    Object.assign(title.style, {
      flex: "1",
      minWidth: "0",
      color: palette.muted,
      fontSize: "12px",
      fontWeight: "600",
    });
    header.appendChild(title);
    const settings = document.createElement("button");
    settings.setAttribute("type", "button");
    settings.setAttribute("data-testid", "toolkit-quick-questions-settings");
    settings.setAttribute("aria-label", tr("设置快捷提问"));
    settings.setAttribute("title", tr("设置快捷提问"));
    Object.assign(settings.style, iconButtonStyle());
    const settingsIcon = createIcon(ICON_SETTINGS, 16);
    settingsIcon.style.pointerEvents = "none";
    settings.appendChild(settingsIcon);
    settings.addEventListener("mouseenter", () => {
      settings.style.backgroundColor = palette.hover;
      settings.style.color = palette.foreground;
    });
    settings.addEventListener("mouseleave", () => {
      settings.style.backgroundColor = "transparent";
      settings.style.color = palette.muted;
    });
    settings.addEventListener("click", (event) => {
      stopEvent(event);
      const target = workspaceId;
      closePopover();
      if (target) client.openPanel("quick-questions", { workspaceId: target });
    });

    header.appendChild(settings);
    container.appendChild(header);

    const hint = document.createElement("div");
    hint.textContent = tr("点击问题直接发送；点击铅笔可先编辑。");
    Object.assign(hint.style, {
      color: palette.muted,
      fontSize: "12px",
      lineHeight: "18px",
      flexShrink: "0",
    });
    container.appendChild(hint);

    const list = document.createElement("div");
    list.setAttribute("data-testid", "toolkit-quick-questions-list");
    Object.assign(list.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      overflowY: "auto",
      minHeight: "0",
      flex: "1 1 auto",
      marginLeft: "-2px",
      marginRight: "-2px",
    });
    listElement = list;
    container.appendChild(list);

    const status = document.createElement("div");
    status.setAttribute("data-testid", "toolkit-quick-questions-status");
    Object.assign(status.style, {
      display: "none",
      color: palette.muted,
      fontSize: "13px",
      lineHeight: "18px",
      flexShrink: "0",
    });
    statusElement = status;
    container.appendChild(status);

    return container;
  }

  function iconButtonStyle(): Record<string, string> {
    return {
      width: "34px",
      height: "34px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      border: "none",
      borderRadius: "6px",
      background: "transparent",
      color: palette.muted,
      cursor: "pointer",
      padding: "0",
    };
  }

  function render() {
    if (!popover) return;
    renderList();
    renderStatus();
  }

  function renderList() {
    if (!listElement) return;
    listElement.textContent = "";
    if (!data?.enabled || !data.featureEnabled) return;
    const questions = data.questions;
    if (questions.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = tr("暂无问题");
      Object.assign(empty.style, {
        padding: "8px",
        color: palette.muted,
        fontSize: "13px",
      });
      listElement.appendChild(empty);
      return;
    }
    for (const question of questions) listElement.appendChild(questionRow(question));
  }

  function questionRow(question: Question): Element {
    const row = document.createElement("div");
    row.setAttribute("data-testid", "toolkit-quick-questions-item");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      width: "100%",
      minHeight: "36px",
      borderRadius: "6px",
      backgroundColor: "transparent",
      transition: "background-color 120ms ease",
    });

    const send = document.createElement("button");
    send.setAttribute("type", "button");
    send.setAttribute("data-testid", "toolkit-quick-questions-send");
    send.setAttribute("aria-label", tr("直接发送：{0}", { "0": question.text }));
    send.setAttribute("title", tr("直接发送"));
    Object.assign(send.style, {
      display: "flex",
      alignItems: "center",
      flex: "1",
      minWidth: "0",
      minHeight: "36px",
      padding: "8px",
      border: "none",
      borderRadius: "6px",
      background: "transparent",
      color: palette.foreground,
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
      fontSize: "14px",
      lineHeight: "20px",
    });
    const text = document.createElement("span");
    text.textContent = question.text;
    Object.assign(text.style, {
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      display: "-webkit-box",
      webkitBoxOrient: "vertical",
      webkitLineClamp: "2",
      wordBreak: "break-word",
      pointerEvents: "none",
    });
    send.appendChild(text);
    send.addEventListener("click", (event) => {
      stopEvent(event);
      sendNow(question.text);
    });

    const edit = document.createElement("button");
    edit.setAttribute("type", "button");
    edit.setAttribute("data-testid", "toolkit-quick-questions-edit");
    edit.setAttribute("aria-label", tr("编辑后发送"));
    edit.setAttribute("title", tr("编辑后发送"));
    Object.assign(edit.style, {
      width: "30px",
      height: "30px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      marginRight: "2px",
      border: "none",
      borderRadius: "6px",
      background: "transparent",
      color: palette.muted,
      cursor: "pointer",
      padding: "0",
      transition: "background-color 120ms ease, color 120ms ease",
    });
    const icon = createIcon(ICON_EDIT, 14);
    icon.style.pointerEvents = "none";
    edit.appendChild(icon);
    edit.addEventListener("click", (event) => {
      stopEvent(event);
      editFirst(question.text);
    });

    row.appendChild(send);
    row.appendChild(edit);
    row.addEventListener("mouseenter", () => {
      row.style.backgroundColor = palette.hover;
      edit.style.color = palette.foreground;
    });
    row.addEventListener("mouseleave", () => {
      row.style.backgroundColor = "transparent";
      edit.style.color = palette.muted;
    });
    return row;
  }

  function renderStatus() {
    if (!statusElement) return;
    const status = statusElement;
    status.textContent = "";
    status.style.display = "none";
    status.style.alignItems = "";
    status.style.gap = "";
    if (loading) {
      showStatus(status, tr("正在读取快捷提问…"), palette.muted);
      return;
    }
    if (error) {
      status.style.display = "flex";
      status.style.alignItems = "center";
      status.style.gap = "8px";
      const text = document.createElement("span");
      text.textContent = error;
      text.style.flex = "1";
      text.style.minWidth = "0";
      text.style.color = palette.danger;
      const retry = document.createElement("button");
      retry.setAttribute("type", "button");
      retry.setAttribute("data-testid", "toolkit-quick-questions-retry");
      retry.textContent = tr("重试");
      Object.assign(retry.style, {
        flexShrink: "0",
        padding: "3px 8px",
        border: `1px solid ${palette.border}`,
        borderRadius: "6px",
        background: "transparent",
        color: palette.foreground,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "13px",
      });
      retry.addEventListener("click", (event) => {
        stopEvent(event);
        void load();
      });
      status.appendChild(text);
      status.appendChild(retry);
      return;
    }
    if (message) {
      showStatus(status, message, palette.danger);
      return;
    }
    if (data && (!data.enabled || !data.featureEnabled)) {
      showStatus(status, tr("已停用"), palette.muted);
    }
  }

  function showStatus(status: Element, text: string, color: string) {
    status.textContent = text;
    status.style.display = "block";
    status.style.color = color;
  }

  function sendNow(text: string) {
    if (workspaceId && sendDraftComposer(workspaceId, text)) {
      closePopover();
      return;
    }
    copyQuestion(text, tr("无法发送，已复制到剪贴板。"), tr("无法发送。"));
  }

  function editFirst(text: string) {
    if (workspaceId && getDraftComposerAccess(workspaceId)?.write(text)) {
      closePopover();
      return;
    }
    copyQuestion(text, tr("无法写入输入框，已复制到剪贴板。"), tr("无法写入输入框。"));
  }

  function copyQuestion(text: string, copiedMessage: string, failureMessage: string) {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      message = failureMessage;
      renderStatus();
      return;
    }
    void clipboard.writeText(text).then(
      () => {
        message = copiedMessage;
        renderStatus();
      },
      () => {
        message = failureMessage;
        renderStatus();
      },
    );
  }

  function installPopoverListeners() {
    const onPointerDown = (event: unknown) => {
      const target = (event as { target?: unknown }).target;
      if (!popover || !button) return;
      if (popover.contains(target) || button.contains(target)) return;
      closePopover();
    };
    const onKeyDown = (event: unknown) => {
      if ((event as { key?: string }).key === "Escape") closePopover();
    };
    const reposition = () => {
      if (popover) positionPopover();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    detachPopoverListeners = () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }

  function positionPopover() {
    if (!popover || !button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const width = Math.max(220, Math.min(POPOVER_WIDTH, viewportWidth - 16));
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const spaceAbove = rect.top - POPOVER_GAP - 8;
    const spaceBelow = viewportHeight - rect.bottom - POPOVER_GAP - 8;
    const placeAbove = spaceAbove >= 200 || spaceAbove >= spaceBelow;
    const maxHeight = Math.max(
      140,
      Math.min(POPOVER_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow),
    );
    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.maxHeight = `${maxHeight}px`;
    if (placeAbove) {
      popover.style.top = "";
      popover.style.bottom = `${viewportHeight - rect.top + POPOVER_GAP}px`;
    } else {
      popover.style.bottom = "";
      popover.style.top = `${rect.bottom + POPOVER_GAP}px`;
    }
  }

  function resolvePalette(pill: Element): Palette {
    const pillStyle = window.getComputedStyle(pill);
    const pillLabel = labelElement(pill);
    const labelStyle = pillLabel ? window.getComputedStyle(pillLabel) : pillStyle;
    const input = findDraftComposerInput(workspaceId);
    const inputStyle = input ? window.getComputedStyle(input) : labelStyle;
    const surface = surfaceBackground(pill);
    const surfaceAlt = opaque(pillStyle.backgroundColor) ? pillStyle.backgroundColor : surface;
    const foreground = inputStyle.color || labelStyle.color || "#1a1a1e";
    const muted = labelStyle.color || foreground;
    return {
      surface,
      surfaceAlt,
      foreground,
      muted,
      border: mix(foreground, "transparent", 86),
      hover: mix(surface, foreground, 6),
      danger: "#dc2626",
    };
  }

  function surfaceBackground(pill: Element): string {
    let current = pill.parentElement;
    for (let depth = 0; current && depth < 16; depth += 1) {
      const color = window.getComputedStyle(current).backgroundColor;
      if (opaque(color)) return color;
      current = current.parentElement;
    }
    return opaque(window.getComputedStyle(pill).backgroundColor)
      ? window.getComputedStyle(pill).backgroundColor
      : "#ffffff";
  }

  function start() {
    if (timer !== undefined || stopped || !isWeb()) return;
    timer = setInterval(sync, POLL_INTERVAL_MS);
    sync();
  }

  function stop() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  return {
    setEnabled(next: boolean) {
      if (stopped || next === enabled) return;
      enabled = next;
      if (next) start();
      else {
        stop();
        detach();
      }
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      enabled = false;
      stop();
      detach();
      unsubscribeLocale();
    },
  };
}

function isWeb(): boolean {
  return Platform.OS === "web" && typeof document !== "undefined";
}

function visibleImportPill(): Element | undefined {
  if (!isWeb()) return undefined;
  const pills = document.body.querySelectorAll(IMPORT_PILL);
  for (let index = 0; index < pills.length; index += 1) {
    const pill = pills[index];
    if (pill && isVisible(pill)) return pill;
  }
  return undefined;
}

function workspaceIdFor(pill: Element): string {
  const entry = pill.closest(DECK_ENTRY);
  if (!entry || !isWeb()) return "";
  const testId = entry.getAttribute("data-testid") ?? "";
  if (!testId.startsWith(DECK_PREFIX)) return "";
  const separator = testId.lastIndexOf(":");
  return separator === -1 ? "" : testId.slice(separator + 1);
}

function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function labelElement(pill: Element): Element | undefined {
  const nodes = pill.querySelectorAll("*");
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!node) continue;
    if ((node.textContent ?? "").trim() && !node.querySelector("*")) return node;
  }
  return undefined;
}

function createIcon(paths: string[], size: number): Element {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const definition of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", definition);
    svg.appendChild(path);
  }
  return svg;
}

function opaque(color: string | undefined): boolean {
  if (!color) return false;
  const normalized = color.replace(/\s+/g, "").toLocaleLowerCase();
  return normalized !== "transparent" && !normalized.endsWith(",0)") && !normalized.endsWith("/0)");
}

function mix(color: string, tint: string, tintPercent: number): string {
  return `color-mix(in srgb, ${color} ${100 - tintPercent}%, ${tint} ${tintPercent}%)`;
}

function stopEvent(event: unknown) {
  const candidate = event as { preventDefault?(): void; stopPropagation?(): void };
  candidate.preventDefault?.();
  candidate.stopPropagation?.();
}
