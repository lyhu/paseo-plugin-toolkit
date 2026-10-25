import { Platform } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Document, Element, Window } from "../chat-view/dom";
import { tr } from "../i18n";
declare const document: Document & { activeElement: Element | null };
declare const window: Window;

/** Portalled so a Host column's overflow cannot clip the full path or copy action. */
export function mountPathTooltip(
  value: unknown,
  path: string,
  colors: PluginTheme["colors"],
  copy: () => Promise<void>,
): () => void {
  if (!value || Platform.OS !== "web") return () => {};
  const source = value as Element;
  let panel: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  const close = () => {
    cancel();
    panel?.remove();
    panel = null;
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      if (!source.contains(document.activeElement) && !panel?.contains(document.activeElement))
        close();
    }, 150);
  };
  const open = () => {
    cancel();
    if (panel) return;
    panel = document.createElement("div");
    panel.setAttribute("role", "tooltip");
    panel.setAttribute("aria-label", tr("完整路径"));
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "100000",
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "12px",
      border: `1px solid ${colors.border}`,
      borderRadius: "8px",
      background: colors.surface2,
      color: colors.foreground,
      boxShadow: "0 6px 24px #0004",
      fontSize: "12px",
      lineHeight: "19px",
      boxSizing: "border-box",
      maxWidth: "min(600px, calc(100vw - 16px))",
    });
    const text = document.createElement("span");
    text.textContent = path;
    Object.assign(text.style, { minWidth: "0", overflowWrap: "anywhere", userSelect: "text" });
    const button = document.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", `${tr("复制完整路径")} · ${path}`);
    Object.assign(button.style, {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      gap: "5px",
      cursor: "pointer",
      background: "transparent",
      border: "0",
      color: "inherit",
      padding: "3px",
      font: "inherit",
    });
    const svg = source.querySelector("svg");
    if (svg) button.appendChild(svg.cloneNode(true));
    const label = document.createElement("span");
    label.textContent = tr("复制");
    button.appendChild(label);
    button.addEventListener("click", () => {
      void copy()
        .then(() => {
          label.textContent = tr("已复制");
        })
        .catch(() => {
          label.textContent = tr("复制失败");
        });
    });
    panel.appendChild(text);
    panel.appendChild(button);
    document.body.appendChild(panel);
    const rect = source.getBoundingClientRect(),
      size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - size.width - 8))}px`;
    panel.style.top = `${Math.max(8, rect.bottom + size.height + 8 < window.innerHeight ? rect.bottom + 6 : rect.top - size.height - 6)}px`;
    panel.addEventListener("mouseenter", cancel);
    panel.addEventListener("mouseleave", schedule);
    panel.addEventListener("focusin", cancel);
    panel.addEventListener("focusout", schedule);
  };
  const escape = (event: unknown) => {
    if ((event as { key: string }).key === "Escape") close();
  };
  const scroll = (event: unknown) => {
    const target = (event as { target?: { contains?(node: unknown): boolean } }).target;
    if (target?.contains?.(source)) close();
  };
  source.addEventListener("mouseenter", open);
  source.addEventListener("mouseleave", schedule);
  source.addEventListener("focusin", open);
  source.addEventListener("focusout", schedule);
  document.addEventListener("keydown", escape);
  window.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", close);
  return () => {
    close();
    source.removeEventListener("mouseenter", open);
    source.removeEventListener("mouseleave", schedule);
    source.removeEventListener("focusin", open);
    source.removeEventListener("focusout", schedule);
    document.removeEventListener("keydown", escape);
    window.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", close);
  };
}
