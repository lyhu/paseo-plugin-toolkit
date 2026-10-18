import { Platform } from "react-native";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { subscribeLocale, tr } from "../locale";
import type { Document, Element, MutationObserverApi, ResizeObserverApi, Window } from "../dom";

// Sticky-question DOM access: host scroll-container discovery, the overlay bar and its 100ms
// show confirmation live here. No other feature reaches into the conversation viewport.
declare const document: Document;
declare const window: Window;
declare const MutationObserver: new (
  callback: (records: Array<{ target: unknown }>) => void,
) => MutationObserverApi;
declare const ResizeObserver: new (callback: () => void) => ResizeObserverApi;

export interface StickyPrompt {
  id: string;
  text: string;
  aliases?: readonly string[];
}

/** Resolve the preceding user prompt for a mounted history row, including virtualized history. */
export type ResolveStickyPrompt = (
  rowId: string,
  messageId: string | null,
) => StickyPrompt | undefined;

const SCROLL_SELECTOR = '[data-testid="agent-chat-scroll"]';
const ROW_SELECTOR = "[data-history-row-id], [data-chat-view-hidden-row-id]";
/** Text and copy button sit side by side, so flex is the bar's visible display. */
const SHOWN_DISPLAY = "flex";
export interface StickyColors {
  background: string;
  foreground: string;
  muted: string;
  border: string;
}
const installations = new Map<Element, { count: number; cleanup: () => void }>();

export function getStickyViewport(anchor: unknown): unknown | undefined {
  if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
  let element = anchor as Element | null;
  const direct = element?.closest?.(SCROLL_SELECTOR);
  if (direct) return direct;
  while (element) {
    const scrolls = element.querySelectorAll(SCROLL_SELECTOR);
    if (scrolls.length === 1) return scrolls[0];
    if (scrolls.length > 1) return undefined;
    element = element.parentElement;
  }
  return undefined;
}

/** Decorate the host viewport without replacing native prompts or touching its scrolling model. */
export function installStickyMessages(
  anchor: unknown,
  resolvePrompt: ResolveStickyPrompt,
  colors: StickyColors,
  subscribeChanges?: (listener: () => void) => () => void,
  onDetached?: () => void,
  getLatestPrompt?: () => StickyPrompt | undefined,
): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const foundScroller = getStickyViewport(anchor) as Element | undefined;
  if (!foundScroller) return () => {};
  const scroller: Element = foundScroller;
  const existing = installations.get(scroller);
  if (existing) {
    existing.count += 1;
    return () => release(scroller);
  }

  let overlay:
    | { bar: Element; text: Element; ellipsis: Element; resetCopy: () => void }
    | undefined;
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingPromptId: string | undefined;
  let showReady = false;
  let frame: number | null = null;
  let stopped = false;
  let lastPrompt: StickyPrompt | undefined;
  let lastContentBounds: { left: number; width: number } | undefined;
  const appliedStyles: Record<string, string> = {};
  let expanded = false;
  let clampedOverflowing = false;
  let ellipsisBackground: string | undefined;
  let displayedPromptId: string | undefined;
  let textLineHeight = 21;
  // The strip is exactly as tall as three text lines plus a small breathing space, so the bubble's
  // padding is trimmed to 4px vertically; the label and the old action row are gone entirely.
  let userAppearance: Record<string, string> = {
    backgroundColor: colors.background,
    border: "0",
    borderRadius: "16px",
    borderTopRightRadius: "2px",
    padding: "4px 16px",
  };

  function cancelPendingShow() {
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = undefined;
    pendingPromptId = undefined;
    showReady = false;
  }

  let userAppearanceMatched = false;
  function matchUserAppearance(rows: Element[]) {
    if (userAppearanceMatched) return userAppearance;
    const message = rows
      .map((row) => row.querySelector('[data-testid="user-message"] [data-message-text="true"]'))
      .find(Boolean);
    if (message?.parentElement) {
      userAppearanceMatched = true;
      const bubble = window.getComputedStyle(message.parentElement);
      for (const key of [
        "backgroundColor",
        "borderRadius",
        "borderTopRightRadius",
        "paddingTop",
        "paddingBottom",
        "paddingLeft",
        "paddingRight",
      ]) {
        userAppearance[key] = bubble[key] ?? "";
      }
      const text = window.getComputedStyle(message);
      textLineHeight = Number.parseFloat(text.lineHeight ?? "") || 21;
      // Keep a little air around the three lines instead of the bubble's full padding.
      userAppearance.paddingTop = "4px";
      userAppearance.paddingBottom = "4px";
      if (overlay) {
        Object.assign(overlay.text.style, {
          fontSize: text.fontSize,
          lineHeight: `${textLineHeight}px`,
          fontFamily: text.fontFamily,
        });
        overlay.ellipsis.style.lineHeight = `${textLineHeight}px`;
      }
    }
    return userAppearance;
  }

  function updateDisclosure(prompt: StickyPrompt, viewportHeight: number) {
    if (!overlay) return;
    if (displayedPromptId !== prompt.id) {
      displayedPromptId = prompt.id;
      expanded = false;
      overlay.resetCopy();
      overlay.text.scrollTop = 0;
    }
    overlay.text.style.maxHeight = expanded
      ? `${Math.max(textLineHeight * 3, viewportHeight - 96)}px`
      : `${textLineHeight * 3}px`;
    overlay.text.style.overflowY = expanded ? "auto" : "hidden";
    const overflowing = overlay.text.scrollHeight > overlay.text.clientHeight + 1;
    // Only the collapsed measurement decides whether the bar has anything to disclose; while
    // expanded the scroll height reflects the taller box instead.
    if (!expanded) clampedOverflowing = overflowing;
    overlay.ellipsis.style.display = !expanded && clampedOverflowing ? "block" : "none";
    overlay.bar.style.cursor = clampedOverflowing || expanded ? "pointer" : "default";
    describeDisclosure();
  }

  /** The bar is its own disclosure control, so its wording is set by a new frame and by a language change alike. */
  function describeDisclosure() {
    if (!overlay) return;
    const description = expanded ? tr("sticky.ariaCollapse") : tr("sticky.ariaExpand");
    if (overlay.bar.getAttribute("aria-label") !== description) {
      overlay.bar.setAttribute("aria-label", description);
      overlay.bar.setAttribute("title", description);
    }
  }

  function toggleExpanded() {
    // A question that fits in three lines has nothing to disclose.
    if (!expanded && !clampedOverflowing) return;
    expanded = !expanded;
    schedule();
  }

  /** Static overlay text lives in nodes created once, so a language change rewrites it here. */
  function relabelOverlay() {
    if (!overlay) return;
    overlay.resetCopy();
    describeDisclosure();
  }

  function nativePrompt(row: Element): StickyPrompt | undefined {
    const text = row.querySelector(
      '[data-testid="user-message"] [data-message-text="true"]',
    )?.textContent;
    const id = row.getAttribute("data-history-row-id");
    return text?.trim() && id ? { id, text } : undefined;
  }

  function resolveRow(row: Element): StickyPrompt | undefined {
    return (
      nativePrompt(row) ??
      resolvePrompt(
        row.getAttribute("data-history-row-id") ?? "",
        row.getAttribute("data-message-id"),
      )
    );
  }

  function readingContext(rows: Element[], viewportTop: number, atBottom: boolean) {
    const firstIndex = rows.findIndex(
      (row) => row.getBoundingClientRect().bottom > viewportTop + 1,
    );
    const index = atBottom || firstIndex < 0 ? rows.length - 1 : firstIndex;
    let prompt = atBottom ? getLatestPrompt?.() : undefined;
    for (let previous = index; !prompt && previous >= 0; previous -= 1) {
      prompt = resolveRow(rows[previous]!);
    }
    // Keep context during a virtualizer's transient empty frame or an async history lookup.
    prompt ??= lastPrompt;
    if (prompt) lastPrompt = prompt;
    return { index, prompt };
  }

  function promptIsVisible(rows: Element[], prompt: StickyPrompt, top: number, bottom: number) {
    const ids = new Set([prompt.id, ...(prompt.aliases ?? [])]);
    const row = rows.find(
      (item) =>
        ids.has(item.getAttribute("data-history-row-id") ?? "") ||
        ids.has(item.getAttribute("data-message-id") ?? ""),
    );
    if (!row) return false;
    const message = row.querySelector('[data-testid="user-message"] [data-message-text="true"]');
    const rect = (message ?? row).getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom;
  }

  function contentBounds(row: Element | undefined, viewportLeft: number) {
    if (lastContentBounds && lastContentBounds.width > 0) {
      return lastContentBounds;
    }
    const content = row?.firstElementChild;
    if (content) {
      const rect = content.getBoundingClientRect();
      const style = window.getComputedStyle(content);
      const paddingLeft = Number.parseFloat(style.paddingLeft ?? "0") || 0;
      const paddingRight = Number.parseFloat(style.paddingRight ?? "0") || 0;
      if (rect.width > 0)
        lastContentBounds = {
          left: rect.left + paddingLeft,
          width: rect.width - paddingLeft - paddingRight,
        };
    }
    return lastContentBounds ?? { left: viewportLeft + 16, width: scroller.clientWidth - 32 };
  }

  function createOverlay() {
    const parent = scroller.parentElement;
    if (!parent) return undefined;
    const bar = document.createElement("div");
    bar.setAttribute("data-conversation-sticky-message", "true");
    bar.setAttribute("role", "note");
    // The whole strip is the disclosure control; it stays focusable for keyboard users.
    bar.setAttribute("tabindex", "0");
    bar.setAttribute("aria-label", tr("sticky.ariaExpand"));
    bar.setAttribute("title", tr("sticky.ariaExpand"));
    Object.assign(bar.style, {
      position: "absolute",
      zIndex: "20",
      boxSizing: "border-box",
      display: "none",
      alignItems: "center",
      gap: "6px",
      padding: "4px 16px",
      pointerEvents: "auto",
      border: "1px solid",
      borderRadius: "8px",
      overflow: "hidden",
      fontFamily: "inherit",
      lineHeight: "20px",
    });
    // No line-clamp: the third line is cut by max-height and the "…" marker is drawn by the
    // plugin, so the collapsed state always ends in a visible ellipsis.
    const text = document.createElement("div");
    Object.assign(text.style, {
      fontSize: "15px",
      lineHeight: "21px",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      overflow: "hidden",
    });
    const message = document.createElement("div");
    Object.assign(message.style, { minWidth: "0", flex: "1 1 auto", position: "relative" });
    const ellipsis = document.createElement("span");
    ellipsis.setAttribute("data-sticky-ellipsis", "true");
    ellipsis.setAttribute("aria-hidden", "true");
    ellipsis.textContent = "…";
    Object.assign(ellipsis.style, {
      display: "none",
      position: "absolute",
      right: "0",
      bottom: "0",
      paddingLeft: "12px",
      lineHeight: "21px",
      pointerEvents: "none",
    });
    const copy = document.createElement("button");
    copy.setAttribute("type", "button");
    copy.setAttribute("data-sticky-copy", "true");
    copy.setAttribute("aria-label", tr("sticky.copy"));
    copy.setAttribute("title", tr("sticky.copy"));
    Object.assign(copy.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      width: "24px",
      height: "24px",
      padding: "5px",
      border: "0",
      borderRadius: "4px",
      background: "transparent",
      color: colors.muted,
      cursor: "pointer",
      transition: "background-color 150ms ease",
    });
    const hoverStyle = document.createElement("style");
    hoverStyle.textContent = `
      [data-conversation-sticky-message] [data-sticky-copy]:hover,
      [data-conversation-sticky-message] [data-sticky-copy]:focus-visible {
        background-color: color-mix(in srgb, currentColor 10%, transparent) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-conversation-sticky-message] [data-sticky-copy] {
          transition: none !important;
        }
      }
    `;
    bar.appendChild(hoverStyle);
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.75",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      icon.setAttribute(name, value);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [name, value] of Object.entries({
      x: "9",
      y: "9",
      width: "13",
      height: "13",
      rx: "2",
    }))
      rect.setAttribute(name, value);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
    icon.appendChild(rect);
    icon.appendChild(path);
    copy.appendChild(icon);
    const copyPath = path.getAttribute("d")!;
    function resetCopy() {
      if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
      rect.style.display = "";
      path.setAttribute("d", copyPath);
      copy.setAttribute("title", tr("sticky.copy"));
      copy.setAttribute("aria-label", tr("sticky.copy"));
    }
    copy.addEventListener("click", (event) => {
      // Copying is not a disclosure gesture.
      (event as { stopPropagation?: () => void } | null)?.stopPropagation?.();
      const copiedText = text.textContent ?? "";
      resetCopy();
      void copyText(copiedText).then(
        () => {
          if (stopped || text.textContent !== copiedText) return;
          rect.style.display = "none";
          path.setAttribute("d", "M5 12l4 4L19 6");
          copy.setAttribute("title", tr("sticky.copied"));
          copy.setAttribute("aria-label", tr("sticky.ariaCopied"));
          copyResetTimer = setTimeout(resetCopy, 1800);
        },
        () => copy.setAttribute("title", tr("sticky.copyFailed")),
      );
    });
    message.appendChild(text);
    message.appendChild(ellipsis);
    bar.addEventListener("click", () => toggleExpanded());
    bar.addEventListener("keydown", (event) => {
      const key = (event as { key?: string } | null)?.key;
      if (key !== "Enter" && key !== " ") return;
      (event as { preventDefault?: () => void }).preventDefault?.();
      toggleExpanded();
    });
    bar.appendChild(message);
    bar.appendChild(copy);
    parent.appendChild(bar);
    return { bar, text, ellipsis, resetCopy };
  }

  function update() {
    frame = null;
    if (stopped) return;
    if (!scroller.isConnected) {
      installations.get(scroller)?.cleanup();
      installations.delete(scroller);
      onDetached?.();
      return;
    }
    overlay ??= createOverlay();
    if (!overlay) return;
    const viewport = scroller.getBoundingClientRect();
    const rows = Array.from(scroller.querySelectorAll(ROW_SELECTOR));
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2;
    const { index: readingIndex, prompt } = readingContext(rows, viewport.top, atBottom);
    if (
      !prompt ||
      !prompt.text.trim() ||
      promptIsVisible(rows, prompt, viewport.top, viewport.bottom) ||
      viewport.height <= 0 ||
      viewport.width <= 0
    ) {
      cancelPendingShow();
      if (overlay.bar.style.display !== "none") overlay.bar.style.display = "none";
      appliedStyles.display = "none";
      return;
    }
    // A virtualized row may disappear for a frame. Hide immediately when the prompt is visible,
    // but require a stable absence before showing the bar to avoid flashing during reconciliation.
    if (overlay.bar.style.display !== SHOWN_DISPLAY) {
      if (pendingPromptId !== prompt.id) {
        cancelPendingShow();
        pendingPromptId = prompt.id;
        showTimer = setTimeout(() => {
          showTimer = undefined;
          showReady = true;
          schedule();
        }, 100);
      }
      if (!showReady) return;
    }
    cancelPendingShow();
    const parent = scroller.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const bounds = contentBounds(rows[readingIndex], viewport.left);
    const topOffset = Math.round(viewport.top - parentRect.top - parent.clientTop);
    const styles = {
      display: SHOWN_DISPLAY,
      top: `${Math.abs(topOffset) <= 1 ? 0 : topOffset}px`,
      left: `${bounds.left - parentRect.left - parent.clientLeft}px`,
      width: `${bounds.width}px`,
      color: colors.foreground,
      backgroundColor: colors.background,
      borderColor: colors.border,
      ...matchUserAppearance(rows),
    };
    // Avoid writing identical inline styles on every stream/scroll frame.
    for (const [key, value] of Object.entries(styles)) {
      if (appliedStyles[key] !== value) {
        overlay.bar.style[key] = value;
        appliedStyles[key] = value;
      }
    }
    if (overlay.text.textContent !== prompt.text) overlay.text.textContent = prompt.text;
    // The "…" marker sits on the cut third line, so it paints the bar's own colour underneath.
    if (ellipsisBackground !== styles.backgroundColor) {
      ellipsisBackground = styles.backgroundColor;
      overlay.ellipsis.style.backgroundColor = styles.backgroundColor;
    }
    updateDisclosure(prompt, viewport.height);
  }
  function schedule() {
    if (!stopped && frame === null) frame = window.requestAnimationFrame(update);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(scroller, {
    childList: true,
    subtree: true,
  });
  const parentElement = scroller.parentElement;
  const detachObserver = parentElement
    ? new MutationObserver(() => {
        if (!scroller.isConnected) schedule();
      })
    : null;
  if (parentElement && detachObserver) detachObserver.observe(parentElement, { childList: true });
  const onResize = () => {
    lastContentBounds = undefined;
    userAppearanceMatched = false;
    schedule();
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(scroller);
  // Listen on the scroller itself: a capture-phase listener on document also fires for the
  // plugin's own nested scroll panels, each forcing a full-viewport layout pass.
  scroller.addEventListener("scroll", schedule);
  window.addEventListener("resize", onResize);
  const unsubscribe = subscribeChanges?.(schedule);
  const unsubscribeLocale = subscribeLocale(() => {
    relabelOverlay();
    schedule();
  });
  schedule();
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    detachObserver?.disconnect();
    resizeObserver.disconnect();
    unsubscribe?.();
    unsubscribeLocale();
    scroller.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", onResize);
    if (frame !== null) window.cancelAnimationFrame(frame);
    cancelPendingShow();
    if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
    overlay?.bar.remove();
  };
  installations.set(scroller, { count: 1, cleanup });
  return () => release(scroller);
}

function release(scroller: Element) {
  const installation = installations.get(scroller);
  if (!installation) return;
  installation.count -= 1;
  if (installation.count === 0) {
    installation.cleanup();
    installations.delete(scroller);
  }
}
