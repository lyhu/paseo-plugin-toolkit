import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { claimWorkspace, readWorkspace } from "../../shared/quick-questions/contracts";
import { createDraftPill, type DraftPillController } from "./draft-pill";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

const PILL_SELECTOR = '[data-testid="composer-import-agent-pill"]';
const TOOLKIT_PILL = "toolkit-quick-questions-pill";

class FakeNode {
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: FakeNode[] = [];
  parentElement: FakeNode | null = null;
  textContent = "";
  isConnected = true;
  focused = false;
  dispatched: Array<{ type: string; key?: string }> = [];
  rect = { top: 0, bottom: 32, left: 0, width: 100, height: 32 };
  events = new Map<string, (event: unknown) => void>();
  selectorResults = new Map<string, FakeNode[]>();

  get nextElementSibling(): FakeNode | null {
    if (!this.parentElement) return null;
    const index = this.parentElement.children.indexOf(this);
    return index === -1 ? null : (this.parentElement.children[index + 1] ?? null);
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
  appendChild(child: FakeNode) {
    this.children.push(child);
    child.parentElement = this;
    child.isConnected = true;
  }
  insertBefore(child: FakeNode, before: FakeNode | null) {
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, child);
    child.parentElement = this;
    child.isConnected = true;
  }
  remove() {
    this.isConnected = false;
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }
  closest(selector: string) {
    let node = this.parentElement;
    while (node) {
      const testId = node.getAttribute("data-testid") ?? "";
      if (selector.startsWith('[data-testid^="workspace-deck-entry-"]')) {
        if (testId.startsWith("workspace-deck-entry-")) return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string) {
    return this.selectorResults.get(selector) ?? [];
  }
  getBoundingClientRect() {
    return this.rect;
  }
  addEventListener(name: string, callback: (event: unknown) => void) {
    this.events.set(name, callback);
  }
  removeEventListener() {}
  contains(other: unknown): boolean {
    if (other === this) return true;
    return this.children.some((child) => child.contains(other));
  }
  focus() {
    this.focused = true;
  }
  setSelectionRange() {}
  dispatchEvent(event: { type: string; key?: string }) {
    this.dispatched.push(event);
    return true;
  }
}

const textareaValues = new WeakMap<object, string>();

class FakeTextArea extends FakeNode {
  get value() {
    return textareaValues.get(this) ?? "";
  }
  set value(next: string) {
    textareaValues.set(this, next);
  }
}

class FakeEvent {
  type: string;
  bubbles?: boolean;
  constructor(type: string, options?: { bubbles?: boolean }) {
    this.type = type;
    this.bubbles = options?.bubbles;
  }
  preventDefault() {}
  stopPropagation() {}
}

class FakeKeyboardEvent extends FakeEvent {
  key?: string;
  code?: string;
  isComposing = false;
  constructor(
    type: string,
    options?: { key?: string; code?: string; bubbles?: boolean; cancelable?: boolean },
  ) {
    super(type, options);
    this.key = options?.key;
    this.code = options?.code;
  }
}

function findByTestId(root: FakeNode, testId: string): FakeNode | undefined {
  if (root.getAttribute("data-testid") === testId) return root;
  for (const child of root.children) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return undefined;
}

function click(node: FakeNode) {
  node.events.get("click")?.({ preventDefault() {}, stopPropagation() {} });
}

let controllers: DraftPillController[] = [];

function setup(hosts: Array<{ owns: boolean }>) {
  const deck = new FakeNode();
  deck.setAttribute("data-testid", "workspace-deck-entry-srv_owner:ws_1");
  const row = new FakeNode();
  const pill = new FakeNode();
  pill.setAttribute("data-testid", "composer-import-agent-pill");
  const composer = new FakeTextArea();
  composer.setAttribute("data-composer-input", "true");
  row.appendChild(pill);
  row.appendChild(composer);
  deck.appendChild(row);
  deck.selectorResults.set(PILL_SELECTOR, [pill]);
  row.selectorResults.set("textarea[data-composer-input]", [composer]);

  const body = new FakeNode();
  body.selectorResults.set(PILL_SELECTOR, [pill]);
  body.selectorResults.set('[data-testid^="workspace-deck-entry-"]', [deck]);

  vi.stubGlobal("document", {
    body,
    createElement: () => new FakeNode(),
    createElementNS: () => new FakeNode(),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("window", {
    innerWidth: 1200,
    innerHeight: 800,
    HTMLTextAreaElement: FakeTextArea,
    Event: FakeEvent,
    KeyboardEvent: FakeKeyboardEvent,
    getComputedStyle: () => ({
      display: "flex",
      visibility: "visible",
      backgroundColor: "rgba(0, 0, 0, 0.05)",
      color: "white",
      gap: "8px",
      minHeight: "32px",
      paddingTop: "4px",
      paddingRight: "12px",
      paddingBottom: "4px",
      paddingLeft: "12px",
      borderTopWidth: "1px",
      borderTopStyle: "solid",
      borderTopColor: "transparent",
      borderRadius: "16px",
      fontFamily: "sans-serif",
      fontSize: "13px",
      fontWeight: "400",
      lineHeight: "normal",
    }),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("navigator", {});

  controllers = hosts.map((host) => {
    const client = {
      rpc: vi.fn(async (contract: unknown) => {
        if (contract === claimWorkspace) return { claimed: host.owns };
        if (contract === readWorkspace) {
          return {
            featureEnabled: true,
            enabled: true,
            summaryPrompt: "prompt",
            historyLimit: 50,
            revision: 0,
            questions: [
              {
                id: "q1",
                text: "如何部署 170？",
                origin: "history",
                frequency: 2,
                sources: [],
              },
            ],
            model: { configured: false },
          };
        }
        throw new Error("unexpected RPC");
      }),
      openPanel: vi.fn(),
    } as unknown as PluginClientContext;
    return createDraftPill(client);
  });
  for (const controller of controllers) controller.setEnabled(true);
  return { body, deck, row, pill, composer };
}

function toolkitPills(row: FakeNode) {
  return row.children.filter((child) => child.getAttribute("data-testid") === TOOLKIT_PILL);
}

async function openPopover(row: FakeNode, body: FakeNode) {
  const pill = toolkitPills(row)[0]!;
  click(pill);
  await vi.advanceTimersByTimeAsync(0);
  const popover = findByTestId(body, "toolkit-quick-questions-popover");
  expect(popover).toBeDefined();
  return popover!;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const controller of controllers) controller.dispose();
  controllers = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("mounts once beside the import pill on the host that owns the workspace", async () => {
  const { row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(toolkitPills(row).length).toBe(1);
});

it("stays hidden on hosts that do not own the workspace", async () => {
  const { row } = setup([{ owns: false }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(toolkitPills(row).length).toBe(0);
});

it("keeps one button when several connected hosts evaluate the plugin", async () => {
  const { row } = setup([{ owns: false }, { owns: true }, { owns: false }]);
  await vi.advanceTimersByTimeAsync(0);
  expect(toolkitPills(row).length).toBe(1);
});

it("does not reorder the pill row on every poll", async () => {
  const { row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const before = row.children.map((child) => child.getAttribute("data-testid"));
  await vi.advanceTimersByTimeAsync(2_500);
  const after = row.children.map((child) => child.getAttribute("data-testid"));
  expect(after).toEqual(before);
});

it("sends the question directly when the row is clicked", async () => {
  const { body, row, composer } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);

  click(findByTestId(popover, "toolkit-quick-questions-send")!);

  expect(composer.value).toBe("如何部署 170？");
  expect(composer.dispatched.map((event) => event.type)).toEqual(["input", "keydown"]);
  expect(composer.dispatched[1]?.key).toBe("Enter");
  expect(findByTestId(body, "toolkit-quick-questions-popover")).toBeUndefined();
});

it("fills the composer without sending when the edit button is clicked", async () => {
  const { body, row, composer } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);

  click(findByTestId(popover, "toolkit-quick-questions-edit")!);

  expect(composer.value).toBe("如何部署 170？");
  expect(composer.dispatched.map((event) => event.type)).toEqual(["input"]);
  expect(findByTestId(body, "toolkit-quick-questions-popover")).toBeUndefined();
});

it("renders no search field in the popover", async () => {
  const { body, row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);

  expect(findByTestId(popover, "toolkit-quick-questions-search")).toBeUndefined();
});

it("numbers the questions in the list", async () => {
  const { body, row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);
  const send = findByTestId(popover, "toolkit-quick-questions-send")!;

  expect(send.children[0]?.textContent).toBe("1. 如何部署 170？");
});

it("shows the interaction hint as tooltips on the row and edit button", async () => {
  const { body, row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);

  expect(findByTestId(popover, "toolkit-quick-questions-send")!.getAttribute("title")).toBe(
    "点击问题直接发送",
  );
  expect(findByTestId(popover, "toolkit-quick-questions-edit")!.getAttribute("title")).toBe(
    "点击铅笔可先编辑",
  );
});

it("highlights a question row while the pointer is over it", async () => {
  const { body, row } = setup([{ owns: true }]);
  await vi.advanceTimersByTimeAsync(0);
  const popover = await openPopover(row, body);
  const item = findByTestId(popover, "toolkit-quick-questions-item")!;

  expect(item.style.backgroundColor).toBe("transparent");
  item.events.get("mouseenter")?.({});
  expect(item.style.backgroundColor).not.toBe("transparent");
  item.events.get("mouseleave")?.({});
  expect(item.style.backgroundColor).toBe("transparent");
});
