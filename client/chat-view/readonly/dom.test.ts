import { afterEach, expect, it, vi } from "vitest";
import { setupReadonlyStyles } from "./dom";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** The readonly stylesheet only touches `document.body` and `createElement`, so the fake stays minimal. */
class StyleNode {
  textContent = "";
  isConnected = true;
  parentElement: StyleNode | null = null;
  children: StyleNode[] = [];
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  appendChild(child: StyleNode) {
    this.children.push(child);
    child.parentElement = this;
  }
  remove() {
    this.isConnected = false;
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
}

function stubDocument() {
  const body = new StyleNode();
  vi.stubGlobal("document", { body, createElement: () => new StyleNode() });
  return body;
}

function readonlyStyle(body: StyleNode) {
  return body.children.find((child) => child.getAttribute("data-plugin") === "chat-view-readonly");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("hides the rewind trigger and its wrapper, and removes them on cleanup", () => {
  const body = stubDocument();
  const remove = setupReadonlyStyles();
  const styleNode = readonlyStyle(body);
  expect(styleNode).toBeDefined();
  // The trigger, plus the slot the host wraps it in — hiding the trigger alone leaves that gap.
  expect(styleNode?.textContent).toContain('[data-testid="rewind-menu-trigger"]');
  expect(styleNode?.textContent).toContain(
    '[data-testid="user-message-trailing-row"] > *:has([data-testid="rewind-menu-trigger"])',
  );
  // Scoped to the trailing row so the copy button and timestamp are untouched.
  expect(styleNode?.textContent).toContain('[data-testid="user-message-trailing-row"]');
  expect(styleNode?.textContent).not.toContain('data-testid="user-message"]');

  remove();
  expect(styleNode?.isConnected).toBe(false);
  expect(readonlyStyle(body)).toBeUndefined();
});

it("does nothing where there is no document", () => {
  vi.stubGlobal("document", undefined);
  expect(() => setupReadonlyStyles()()).not.toThrow();
});
