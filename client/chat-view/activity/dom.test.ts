import { afterEach, expect, it, vi } from "vitest";
import { setupCompactActivityStyles } from "./dom";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** The activity stylesheet only touches `document.body` and `createElement`, so the fake stays minimal. */
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

afterEach(() => {
  vi.unstubAllGlobals();
});

it("injects compact message and paragraph styling rules and removes them on cleanup", () => {
  const body = new StyleNode();
  vi.stubGlobal("document", { body, createElement: () => new StyleNode() });
  const remove = setupCompactActivityStyles();
  const styleNode = body.children.find(
    (child) => child.getAttribute("data-plugin") === "chat-view-activity",
  );
  expect(styleNode).toBeDefined();
  expect(styleNode?.textContent).toContain('data-testid="assistant-message"');
  expect(styleNode?.textContent).toContain('data-paseo-markdown-tag="p"');
  expect(styleNode?.textContent).toContain("margin-bottom: 8px !important;");
  expect(styleNode?.textContent).toContain("margin-bottom: 0 !important;");

  remove();
  expect(styleNode?.isConnected).toBe(false);
  expect(
    body.children.some((child) => child.getAttribute("data-plugin") === "chat-view-activity"),
  ).toBe(false);
});
