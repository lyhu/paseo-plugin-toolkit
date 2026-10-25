import type { Element } from "../chat-view/dom";

/** Delegated HTML drag sorting; only marked items participate, so All is never a source or target. */
export function mountGroupReorder(
  value: unknown,
  prefix: string,
  horizontal: boolean,
  color: string,
  move: (source: string, target: string, after: boolean) => void,
  handlePrefix = prefix,
) {
  const root = value as Element | null;
  if (!root?.querySelectorAll) return () => {};
  const selector = `[data-testid^="${prefix}"]`,
    handles = Array.from(root.querySelectorAll(`[data-testid^="${handlePrefix}"]`));
  let source: string | null = null,
    marked: Element | null = null;
  const clear = () => {
    if (marked) {
      marked.style.outline = "";
      marked.style.outlineOffset = "";
    }
    marked = null;
  };
  for (const handle of handles) {
    handle.setAttribute("draggable", "true");
    handle.style.cursor = "grab";
  }
  interface Drag {
    target: Element;
    clientX: number;
    clientY: number;
    preventDefault(): void;
    dataTransfer?: {
      setData(type: string, value: string): void;
      effectAllowed: string;
      dropEffect: string;
    };
  }
  const destination = (event: Drag) => {
    const node = event.target.closest?.(selector);
    if (!source || !node || !root.contains(node)) return null;
    const id = node.getAttribute("data-testid")!.slice(prefix.length),
      rect = node.getBoundingClientRect();
    if (id === source) return null;
    return {
      node,
      id,
      after: horizontal
        ? event.clientX > rect.left + rect.width / 2
        : event.clientY > rect.top + rect.height / 2,
    };
  };
  const listeners: Record<string, (raw: unknown) => void> = {
    dragstart(raw) {
      const event = raw as Drag,
        handle = event.target.closest?.(`[data-testid^="${handlePrefix}"]`);
      if (!handle || !root.contains(handle)) return;
      source = handle.closest(selector)?.getAttribute("data-testid")?.slice(prefix.length) ?? null;
      if (source && event.dataTransfer) {
        event.dataTransfer.setData("text/plain", source);
        event.dataTransfer.effectAllowed = "move";
      }
    },
    dragover(raw) {
      const event = raw as Drag,
        target = destination(event);
      clear();
      if (!target) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      marked = target.node;
      marked.style.outline = `2px solid ${color}`;
      marked.style.outlineOffset = "-2px";
    },
    drop(raw) {
      const event = raw as Drag,
        target = destination(event);
      clear();
      if (source && target) {
        event.preventDefault();
        move(source, target.id, target.after);
      }
      source = null;
    },
    dragend() {
      source = null;
      clear();
    },
    dragleave(raw) {
      if (!root.contains((raw as { relatedTarget?: unknown }).relatedTarget)) clear();
    },
  };
  for (const [event, listener] of Object.entries(listeners)) root.addEventListener(event, listener);
  return () => {
    clear();
    for (const handle of handles) {
      handle.removeAttribute("draggable");
      handle.style.cursor = "";
    }
    for (const [event, listener] of Object.entries(listeners))
      root.removeEventListener(event, listener);
  };
}
