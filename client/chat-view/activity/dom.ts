import { Platform } from "react-native";
import type { Document, Element, Window } from "../dom";

// Compact-activity DOM access: the scoped stylesheet tightening the host conversation rhythm, and
// the scroll-into-view bridge the detail panels use. Neither is observable from the sticky
// viewport module, so the two features cannot grow entangled selectors.
declare const document: Document;
declare const window: Window;

/** Scoped CSS also applies to rows mounted later by the virtual list. */
export function setupCompactActivityStyles(): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "chat-view-activity");
  style.textContent = `
    /* 活动折叠组间距优化 */
    [data-testid="agent-chat-scroll"] [data-history-row-id]:has([data-testid="folded-activity-group"]) > div {
      margin-top: 1px !important;
      margin-bottom: 2px !important;
    }
    [data-testid="agent-chat-scroll"] [data-history-row-id]:has([data-testid="folded-activity-follower"]) > div {
      margin-bottom: 0 !important;
    }

    /* 用户提问气泡底部间距适度紧凑化 */
    [data-testid="agent-chat-scroll"] [data-history-row-id]:has([data-testid="user-message"]) > div {
      margin-bottom: 8px !important;
    }

    /* 助手消息容器垂直 padding 紧凑化，消除原生默认上下 12px 的过大留白 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] {
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }

    /* 助手消息直接子块容器间距优化 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] > div {
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] > div:last-child {
      margin-bottom: 0 !important;
    }

    /* Markdown 段落间距紧凑优化与专业美化，消除末尾段落多余的底部留白 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is(p, [data-paseo-markdown-tag="p"]) {
      margin-top: 0 !important;
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is(p, [data-paseo-markdown-tag="p"]):last-child {
      margin-bottom: 0 !important;
    }

    /* 列表块及列表项间距优化 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is([data-paseo-markdown-tag="ul"], [data-paseo-markdown-tag="ol"]) {
      margin-top: 4px !important;
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is([data-paseo-markdown-tag="ul"], [data-paseo-markdown-tag="ol"]):last-child {
      margin-bottom: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="li"] {
      margin-bottom: 3px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="li"]:last-child {
      margin-bottom: 0 !important;
    }

    /* 代码块与引用块间距紧凑化 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="pre"] {
      margin-top: 6px !important;
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="pre"]:first-child {
      margin-top: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="pre"]:last-child {
      margin-bottom: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="blockquote"] {
      margin-top: 6px !important;
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="blockquote"]:first-child {
      margin-top: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="blockquote"]:last-child {
      margin-bottom: 0 !important;
    }

    /* 标题间距优化 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="h1"],
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="h2"] {
      margin-top: 14px !important;
      margin-bottom: 6px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is([data-paseo-markdown-tag="h3"], [data-paseo-markdown-tag="h4"], [data-paseo-markdown-tag="h5"], [data-paseo-markdown-tag="h6"]) {
      margin-top: 10px !important;
      margin-bottom: 4px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is([data-paseo-markdown-tag="h1"], [data-paseo-markdown-tag="h2"], [data-paseo-markdown-tag="h3"], [data-paseo-markdown-tag="h4"], [data-paseo-markdown-tag="h5"], [data-paseo-markdown-tag="h6"]):first-child {
      margin-top: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] :is([data-paseo-markdown-tag="h1"], [data-paseo-markdown-tag="h2"], [data-paseo-markdown-tag="h3"], [data-paseo-markdown-tag="h4"], [data-paseo-markdown-tag="h5"], [data-paseo-markdown-tag="h6"]):last-child {
      margin-bottom: 0 !important;
    }

    /* 表格与水平分割线间距紧凑化 */
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="table"] {
      margin-top: 6px !important;
      margin-bottom: 8px !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="table"]:last-child {
      margin-bottom: 0 !important;
    }
    [data-testid="agent-chat-scroll"] [data-testid="assistant-message"] [data-paseo-markdown-tag="hr"] {
      margin-top: 8px !important;
      margin-bottom: 8px !important;
    }

    /* 图片尺寸自适应约束 */
    [data-testid="agent-chat-scroll"] [role="img"]:not([role="dialog"] *):not([data-testid="attachment-lightbox"] *) {
      max-width: min(440px, 100%) !important; max-height: 320px !important; align-self: flex-start !important;
    }
    [data-testid="agent-chat-scroll"] img:not([role="dialog"] *):not([data-testid="attachment-lightbox"] *) {
      max-width: 100% !important; max-height: 320px !important; width: auto !important; height: auto !important; object-fit: contain !important;
    }
  `;
  document.body.appendChild(style);
  return () => style.remove();
}

export function scrollActivityIntoView(anchor: unknown): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const element = anchor as Element | null;
  window.requestAnimationFrame(() => {
    if (element?.isConnected) element.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  });
}
