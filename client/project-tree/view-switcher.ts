import { Platform } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Element, MutationObserverApi } from "../chat-view/dom";
import { tr } from "../i18n";
declare const document: {
  body: Element;
  createElement(tag: string): Element;
  querySelectorAll(selector: string): ArrayLike<Element>;
};
declare const MutationObserver: new (callback: () => void) => MutationObserverApi;

export function mountSidebarViewSwitcher(initial: {
  view: "workbench" | "native";
  theme: PluginTheme;
  select(view: "workbench" | "native"): void;
}) {
  let options = initial;
  const bars = new Map<Element, { bar: Element; track: Element; buttons: Element[] }>();
  const scan = () => {
    for (const [parent, entry] of bars)
      if (!parent.isConnected || !entry.bar.isConnected) {
        entry.bar.remove();
        bars.delete(parent);
      }
    for (const list of Array.from(
      document.querySelectorAll('[data-testid="sidebar-project-workspace-list-scroll"]'),
    )) {
      const native = list.parentElement,
        parent = native?.parentElement;
      if (!native || !parent?.querySelector('[data-testid="sidebar-footer"]')) continue;
      let entry = bars.get(parent);
      if (!entry) {
        const bar = document.createElement("div"),
          track = document.createElement("div");
        bar.setAttribute("data-toolkit-view-switcher", "true");
        track.setAttribute("role", "tablist");
        track.setAttribute("aria-label", tr("导航视图"));
        Object.assign(bar.style, { padding: "8px 12px", flexShrink: "0" });
        Object.assign(track.style, {
          display: "flex",
          padding: "3px",
          gap: "3px",
          borderRadius: "10px",
        });
        const buttons = (
          [
            ["workbench", "工作台视图"],
            ["native", "原生视图"],
          ] as const
        ).map(([view, label]) => {
          const button = document.createElement("button");
          button.setAttribute("type", "button");
          button.setAttribute("role", "tab");
          button.setAttribute("aria-label", tr(label));
          button.textContent = tr(label);
          Object.assign(button.style, {
            flex: "1",
            minWidth: "0",
            minHeight: "32px",
            border: "0",
            borderRadius: "8px",
            font: "14px system-ui",
            cursor: "pointer",
          });
          button.addEventListener("click", () => options.select(view));
          track.appendChild(button);
          return button;
        });
        bar.appendChild(track);
        parent.insertBefore(bar, parent.querySelector("[data-toolkit-project-tree]") ?? native);
        entry = { bar, track, buttons };
        bars.set(parent, entry);
      }
      entry.track.style.background = options.theme.colors.surface1;
      entry.buttons.forEach((button, index) => {
        const selected = (index === 0 ? "workbench" : "native") === options.view;
        button.setAttribute("aria-selected", String(selected));
        Object.assign(button.style, {
          color: selected ? options.theme.colors.foreground : options.theme.colors.foregroundMuted,
          background: selected ? options.theme.colors.surface2 : "transparent",
        });
      });
    }
  };
  const observer = Platform.OS === "web" ? new MutationObserver(scan) : null;
  if (observer) {
    scan();
    observer.observe(document.body, { subtree: true, childList: true });
  }
  return {
    update(next: typeof initial) {
      options = next;
      if (observer) scan();
    },
    dispose() {
      observer?.disconnect();
      for (const entry of bars.values()) entry.bar.remove();
      bars.clear();
    },
  };
}
