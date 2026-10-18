import { Platform } from "react-native";
import type { Document } from "../dom";

// Readonly-message DOM access: the stylesheet that drops the host's rewind control. This feature
// owns the conversation's "already sent" affordances; no other domain reaches into the trailing
// row, so the selectors below cannot drift into sticky or activity styling.
declare const document: Document;

/**
 * Hides the rewind trigger on sent user messages, which is the host's only way to edit a message
 * after it went out. Scoped CSS is what makes this cheap: the virtual list mounts and unmounts
 * rows constantly, and a stylesheet applies to rows that appear later without observing them.
 *
 * Two rules, because the trigger has a wrapper. `rewind-menu.tsx` renders a `collapsable={false}`
 * slot around the trigger; hiding only the trigger leaves that slot's padding behind, so the
 * wrapper is hidden too and flex closes the gap on its own.
 */
export function setupReadonlyStyles(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "chat-view-readonly");
  style.textContent = `
    [data-testid="user-message-trailing-row"] [data-testid="rewind-menu-trigger"] {
      display: none !important;
    }
    [data-testid="user-message-trailing-row"] > *:has([data-testid="rewind-menu-trigger"]) {
      display: none !important;
    }
  `;
  document.body.appendChild(style);
  return () => style.remove();
}
