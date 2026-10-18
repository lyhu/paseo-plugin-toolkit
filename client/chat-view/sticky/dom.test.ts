import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLocalePreference } from "../locale";
import { installStickyMessages } from "./dom";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ copyText: vi.fn() }));

class Node {
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Node[] = [];
  parentElement: Node | null = null;
  textContent = "";
  isConnected = true;
  clientWidth = 500;
  clientHeight = 500;
  clientLeft = 0;
  clientTop = 0;
  scrollTop = 0;
  scrollHeight = 1000;
  rect = { top: 0, bottom: 500, left: 0, width: 500, height: 500 };
  message: Node | undefined;
  rows: Node[] = [];
  events = new Map<string, () => void>();
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  appendChild(child: Node) {
    this.children.push(child);
    child.parentElement = this;
  }
  remove() {
    this.isConnected = false;
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
  insertBefore(child: Node, before: Node | null) {
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child);
    child.parentElement = this;
  }
  closest() {
    return this;
  }
  querySelector() {
    return this.message ?? null;
  }
  querySelectorAll() {
    return this.rows;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  addEventListener(name: string, callback: () => void) {
    this.events.set(name, callback);
  }
  removeEventListener() {}
}

let frames: Map<number, () => void>;
let observers: Array<() => void>;
let frameId: number;
let cleanup: (() => void) | undefined;
function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback();
}
function setup() {
  const parent = new Node();
  const scroller = new Node();
  parent.appendChild(scroller);
  const prompt = new Node();
  prompt.setAttribute("data-history-row-id", "prompt");
  prompt.message = new Node();
  prompt.message.textContent = "question";
  prompt.message.rect = { top: 20, bottom: 60, left: 0, width: 500, height: 40 };
  const answer = new Node();
  answer.setAttribute("data-history-row-id", "answer");
  scroller.rows = [prompt, answer];
  cleanup = installStickyMessages(scroller, () => ({ id: "prompt", text: "question" }), {
    background: "black",
    foreground: "white",
    muted: "gray",
    border: "gray",
  });
  flushFrame();
  const bar = parent.children.find((node) =>
    node.getAttribute("data-conversation-sticky-message"),
  )!;
  const change = () => {
    observers[0]!();
    flushFrame();
  };
  return { scroller, prompt, answer, bar, change };
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  observers = [];
  frameId = 0;
  vi.stubGlobal("document", {
    body: new Node(),
    createElement: () => new Node(),
    createElementNS: () => new Node(),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: () => void) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    getComputedStyle: () => ({ paddingLeft: "0", paddingRight: "0" }),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("does not flash when a visible prompt is briefly unmounted by the virtual list", () => {
  const { scroller, prompt, answer, bar, change } = setup();
  expect(bar.style.display).toBe("none");
  for (let i = 0; i < 6; i++) {
    scroller.rows = [answer];
    change();
    expect(bar.style.display).toBe("none");
    vi.advanceTimersByTime(16);
    scroller.rows = [prompt, answer];
    change();
    expect(bar.style.display).toBe("none");
  }
});

it("shows after a stable absence and hides immediately when any part becomes visible", () => {
  const { prompt, bar, change } = setup();
  prompt.message!.rect.top = -40;
  prompt.message!.rect.bottom = 0;
  change();
  expect(bar.style.display).toBe("none");
  vi.advanceTimersByTime(100);
  flushFrame();
  expect(bar.style.display).toBe("flex");
  prompt.message!.rect.bottom = 0.1;
  change();
  expect(bar.style.display).toBe("none");
});

it("filters repeated subpixel boundary jitter without flashing", () => {
  const { prompt, bar, change } = setup();
  for (let i = 0; i < 20; i++) {
    prompt.message!.rect.top = -40;
    prompt.message!.rect.bottom = -0.1;
    change();
    vi.advanceTimersByTime(16);
    flushFrame();
    expect(bar.style.display).toBe("none");
    prompt.message!.rect.bottom = 0.1;
    change();
    vi.advanceTimersByTime(16);
    flushFrame();
    expect(bar.style.display).toBe("none");
  }
});

it("keeps visible prompts hidden at the bottom and cancels pending shows on cleanup", () => {
  const { scroller, prompt, bar, change } = setup();
  scroller.scrollTop = 500;
  change();
  vi.advanceTimersByTime(200);
  flushFrame();
  expect(bar.style.display).toBe("none");
  prompt.message!.rect.top = -40;
  prompt.message!.rect.bottom = 0;
  change();
  cleanup!();
  cleanup = undefined;
  vi.advanceTimersByTime(200);
  flushFrame();
  expect(bar.isConnected).toBe(false);
  expect(bar.style.display).toBe("none");
});

it("shows only the question body, three lines tall, with the copy button beside it", () => {
  const { bar, prompt, change } = setup();
  prompt.message!.rect.top = -40;
  prompt.message!.rect.bottom = 0;
  change();
  vi.advanceTimersByTime(100);
  flushFrame();
  expect(bar.style.display).toBe("flex");
  // The hover <style>, the text block, and the copy button: no label line, no toggle row.
  expect(bar.children).toHaveLength(3);
  const [style, message, copy] = bar.children;
  expect(style!.textContent).toContain("[data-sticky-copy]");
  const [text, ellipsis] = message!.children;
  expect(text!.style.maxHeight).toBe("63px");
  // Vertical padding is trimmed to 4px so the strip is three lines plus a little air.
  expect(bar.style.paddingTop || bar.style.padding).toBe("4px 16px");
  // The mock text always overflows its box, so the plugin-drawn ellipsis stands in for "…".
  expect(ellipsis!.textContent).toBe("…");
  expect(ellipsis!.style.display).toBe("block");
  expect(bar.style.cursor).toBe("pointer");
  expect(copy!.style.flexShrink).toBe("0");
});

it("expands and collapses the question when the bar itself is clicked", () => {
  const { bar, prompt, change } = setup();
  prompt.message!.rect.top = -40;
  prompt.message!.rect.bottom = 0;
  change();
  vi.advanceTimersByTime(100);
  flushFrame();
  const [message] = bar.children.slice(1);
  const [text, ellipsis] = message!.children;
  expect(text!.style.maxHeight).toBe("63px");
  bar.events.get("click")!();
  flushFrame();
  expect(Number.parseFloat(text!.style.maxHeight)).toBeGreaterThan(63);
  expect(text!.style.overflowY).toBe("auto");
  expect(ellipsis!.style.display).toBe("none");
  bar.events.get("click")!();
  flushFrame();
  expect(text!.style.maxHeight).toBe("63px");
  expect(text!.style.overflowY).toBe("hidden");
  expect(ellipsis!.style.display).toBe("block");
});

it("relabels the bar and its copy button when the plugin language changes", () => {
  const { bar } = setup();
  // Bar children in order: the hover <style>, the message, then the copy button.
  const [, , copy] = bar.children;
  expect(copy!.getAttribute("aria-label")).toBe("复制当前提问");
  expect(bar.getAttribute("aria-label")).toBe("展开当前提问全文");
  setLocalePreference("en-US");
  flushFrame();
  expect(copy!.getAttribute("aria-label")).toBe("Copy current question");
  expect(bar.getAttribute("aria-label")).toBe("Expand full question");
  setLocalePreference("zh-CN");
});
