import type { PluginTheme } from "@getpaseo/plugin";
import type { Element, MutationObserverApi } from "../chat-view/dom";

declare const document: {
  body: Element;
  createElement(tag: string): Element;
  querySelectorAll(selector: string): ArrayLike<Element>;
};
declare const MutationObserver: new (callback: () => void) => MutationObserverApi;
declare const MouseEvent: new (type: string, options: { bubbles: boolean }) => unknown;

/** Own only the appended entry; the host keeps its menu rows and dismissal lifecycle. */
export function mountProjectTreeMenu(options: { title: string; theme: PluginTheme; open(): void }) {
  const entries = new Map<Element, Element>();
  const scan = () => {
    for (const [page, entry] of entries)
      if (!page.isConnected || !entry.isConnected) {
        entry.remove();
        entries.delete(page);
      }
    for (const surface of Array.from(
      document.querySelectorAll('[data-testid="sidebar-display-preferences-content"]'),
    )) {
      const grouping = surface.querySelector('[data-testid="sidebar-display-grouping"]');
      let page = grouping?.parentElement;
      while (
        page &&
        surface.contains(page) &&
        !page.querySelector('[data-testid="sidebar-display-show"]')
      )
        page = page.parentElement;
      if (!page || !surface.contains(page) || entries.has(page)) continue;
      const entry = document.createElement("div");
      entry.setAttribute("data-toolkit-project-tree-menu", "true");
      const separator = document.createElement("div");
      separator.setAttribute("role", "separator");
      Object.assign(separator.style, {
        height: "1px",
        margin: "4px 0",
        background: options.theme.colors.border,
      });
      entry.appendChild(separator);
      const button = document.createElement("button");
      button.setAttribute("type", "button");
      button.setAttribute("role", "menuitem");
      button.setAttribute("data-menu-item", "true");
      button.setAttribute("data-menu-disabled", "false");
      button.setAttribute("tabindex", "-1");
      button.setAttribute("aria-label", options.title);
      button.textContent = options.title;
      Object.assign(button.style, {
        display: "block",
        width: "calc(100% - 8px)",
        minHeight: "28px",
        margin: "0 4px",
        padding: "4px 8px",
        boxSizing: "border-box",
        border: "1px solid transparent",
        borderRadius: "6px",
        outline: "none",
        background: "transparent",
        color: options.theme.colors.foreground,
        font: "14px system-ui, sans-serif",
        lineHeight: "18px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background-color 120ms ease-out",
      });
      const highlight = () => {
        button.style.background = options.theme.colors.surface2;
      };
      const clear = () => {
        button.style.background = "transparent";
      };
      button.addEventListener("mouseenter", highlight);
      button.addEventListener("focus", highlight);
      button.addEventListener("mouseleave", clear);
      button.addEventListener("blur", clear);
      button.addEventListener("click", () => {
        const trigger = Array.from(
          document.querySelectorAll('[data-testid="sidebar-display-preferences-menu"]'),
        ).find((candidate) => candidate.getAttribute("aria-expanded") === "true");
        trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        options.open();
      });
      entry.appendChild(button);
      entries.set(page, entry);
      page.appendChild(entry);
    }
  };
  const observer = new MutationObserver(scan);
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const entry of entries.values()) entry.remove();
    entries.clear();
  };
}
