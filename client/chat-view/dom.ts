/**
 * The plugin's shared TS config has no DOM library, so the minimal DOM surface the plugin actually
 * touches is declared here once. Each web-only adapter (`sticky/dom`, `activity/dom`,
 * `enhance/dom`) imports these shapes and declares the globals it uses, so the host conversation
 * selectors, styles and observers stay private to the feature that owns them.
 */

export interface Element {
  parentElement: Element | null;
  textContent: string | null;
  isConnected: boolean;
  clientWidth: number;
  clientHeight: number;
  clientLeft: number;
  clientTop: number;
  scrollTop: number;
  scrollHeight: number;
  firstElementChild: Element | null;
  value?: string;
  focus(): void;
  dispatchEvent(event: unknown): boolean;
  setSelectionRange(start: number, end: number): void;
  scrollIntoView(options: { block: string; behavior: string }): void;
  style: Record<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  closest(selector: string): Element | null;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
  getBoundingClientRect(): {
    top: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  };
  appendChild(element: Element): void;
  insertBefore(element: Element, before: Element | null): void;
  addEventListener(name: string, callback: (event: unknown) => void): void;
  removeEventListener(name: string, callback: (event: unknown) => void): void;
  remove(): void;
}

export interface Document {
  body: Element;
  createElement(tag: string): Element;
  createElementNS(namespace: string, tag: string): Element;
  addEventListener(name: string, callback: () => void, capture?: boolean): void;
  removeEventListener(name: string, callback: () => void, capture?: boolean): void;
}

export interface Window {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  getComputedStyle(element: Element): Record<string, string>;
  addEventListener(name: string, callback: () => void): void;
  removeEventListener(name: string, callback: () => void): void;
}

export interface MutationObserverApi {
  observe(element: Element, options: Record<string, boolean>): void;
  disconnect(): void;
}

export interface ResizeObserverApi {
  observe(element: Element): void;
  disconnect(): void;
}

/** The subset of `window` the composer bridge reaches for when restoring a draft. */
export interface WindowConstructors {
  HTMLTextAreaElement?: { prototype: object };
  Event?: new (type: string, options?: { bubbles?: boolean }) => unknown;
}
