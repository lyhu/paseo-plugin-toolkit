import type { Element } from "../chat-view/dom";

export function orderedHosts<T extends { id: string }>(
  hosts: readonly T[],
  order: readonly string[] = [],
): T[] {
  const remaining = new Map(hosts.map((host) => [host.id, host]));
  const result: T[] = [];
  for (const id of order) {
    const host = remaining.get(id);
    if (host) result.push(host);
    remaining.delete(id);
  }
  return [...result, ...remaining.values()];
}

export function moveHost(ids: string[], source: string, target: string, after: boolean): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const next = ids.filter((id) => id !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
}

interface DragEvent {
  target: Element;
  relatedTarget?: Element | null;
  clientX: number;
  clientY: number;
  preventDefault(): void;
  dataTransfer?: {
    effectAllowed: string;
    dropEffect: string;
    setData(type: string, value: string): void;
  };
}

/** Only the title bar starts a drag; project links within a Host keep their normal behavior. */
export function mountHostReorder(
  root: unknown,
  grid: boolean,
  color: string,
  onMove: (source: string, target: string, after: boolean) => void,
): () => void {
  const container = root as Element | null;
  if (!container?.querySelectorAll) return () => {};
  const handles = Array.from(container.querySelectorAll('[data-testid^="workbench-host-handle:"]'));
  for (const handle of handles) {
    handle.setAttribute("draggable", "true");
    handle.style.cursor = "grab";
  }
  let source: string | null = null;
  let marked: Element | null = null;
  function clear() {
    if (marked) {
      marked.style.boxShadow = "";
      marked.style.outline = "";
      marked.style.outlineOffset = "";
    }
    marked = null;
  }
  function target(event: DragEvent) {
    const card = event.target.closest?.('[data-testid^="workbench-host-node:"]');
    if (!source || !card || !container?.contains(card)) return null;
    const id = card.getAttribute("data-testid")!.slice("workbench-host-node:".length);
    if (id === source) return null;
    const rect = card.getBoundingClientRect();
    const after = grid
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    return { card, id, after };
  }
  const listeners: Record<string, (raw: unknown) => void> = {
    dragstart(raw) {
      const event = raw as DragEvent;
      const handle = event.target.closest?.('[data-testid^="workbench-host-handle:"]');
      if (!handle || !container.contains(handle)) return;
      source =
        handle
          .closest('[data-testid^="workbench-host-node:"]')
          ?.getAttribute("data-testid")
          ?.slice("workbench-host-node:".length) ?? null;
      if (event.dataTransfer && source) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", source);
      }
    },
    dragover(raw) {
      const event = raw as DragEvent;
      const destination = target(event);
      clear();
      if (!destination) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      marked = destination.card;
      marked.style.outline = `1px solid ${color}`;
      marked.style.outlineOffset = "-1px";
      marked.style.boxShadow = `inset ${grid ? (destination.after ? -3 : 3) : 0}px ${grid ? 0 : destination.after ? -3 : 3}px 0 ${color}`;
    },
    drop(raw) {
      const event = raw as DragEvent;
      const destination = target(event);
      clear();
      if (source && destination) {
        event.preventDefault();
        onMove(source, destination.id, destination.after);
      }
      source = null;
    },
    dragend() {
      source = null;
      clear();
    },
    dragleave(raw) {
      if (!container.contains((raw as DragEvent).relatedTarget)) clear();
    },
  };
  for (const [name, listener] of Object.entries(listeners))
    container.addEventListener(name, listener);
  return () => {
    clear();
    for (const handle of handles) {
      handle.removeAttribute("draggable");
      handle.style.cursor = "";
    }
    for (const [name, listener] of Object.entries(listeners))
      container.removeEventListener(name, listener);
  };
}
