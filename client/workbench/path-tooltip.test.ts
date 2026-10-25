import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { mountPathTooltip } from "./path-tooltip";
import type { PluginTheme } from "@getpaseo/plugin";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../i18n", () => ({ tr: (value: string) => value }));
let dom: JSDOM, dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dom?.window.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("shows the entire path outside clipped columns and keeps its copy action usable", async () => {
  vi.useFakeTimers();
  dom = new JSDOM(
    '<div style="overflow:hidden"><div id="path"><span>long…</span><button><svg></svg></button></div></div>',
  );
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  const source = dom.window.document.getElementById("path")!;
  const copy = vi.fn(async () => {}),
    path = "/Users/long directory/project/complete-path";
  dispose = mountPathTooltip(
    source,
    path,
    { surface2: "#222", foreground: "#fff", border: "#333" } as PluginTheme["colors"],
    copy,
  );
  source.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  const tooltip = dom.window.document.querySelector<HTMLElement>('[role="tooltip"]')!;
  expect(tooltip.parentElement).toBe(dom.window.document.body);
  expect(tooltip.textContent).toContain(path);
  const unrelated = dom.window.document.createElement("aside");
  dom.window.document.body.appendChild(unrelated);
  unrelated.dispatchEvent(new dom.window.Event("scroll"));
  expect(tooltip.isConnected).toBe(true);
  const button = tooltip.querySelector("button")!;
  expect(button.querySelector("svg")).not.toBeNull();
  source.dispatchEvent(new dom.window.MouseEvent("mouseleave"));
  tooltip.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  await vi.advanceTimersByTimeAsync(200);
  expect(tooltip.isConnected).toBe(true);
  button.click();
  await Promise.resolve();
  expect(copy).toHaveBeenCalledOnce();
  expect(button.textContent).toContain("已复制");
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
  expect(tooltip.isConnected).toBe(false);
  source.dispatchEvent(new dom.window.FocusEvent("focusin"));
  expect(dom.window.document.querySelector('[role="tooltip"]')).not.toBeNull();
  dispose();
  expect(dom.window.document.querySelector('[role="tooltip"]')).toBeNull();
  source.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  expect(dom.window.document.querySelector('[role="tooltip"]')).toBeNull();
});
