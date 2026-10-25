import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { mountWideWorkbenchModal, mountWorkbenchHeader } from "../web";

const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));
let dispose: (() => void) | undefined;
let dom: JSDOM;
it("widens only the containing desktop dialog and restores its width", () => {
  dom = new JSDOM(
    '<div role="dialog" style="max-width:520px"><div id="body"></div></div><div role="dialog" id="other" style="max-width:520px"></div>',
  );
  const dialog = dom.window.document.querySelector<HTMLElement>('[role="dialog"]')!;
  dispose = mountWideWorkbenchModal(dom.window.document.getElementById("body"));
  expect(dialog.style.maxWidth).toBe("960px");
  expect(dom.window.document.getElementById("other")!.style.maxWidth).toBe("520px");
  dispose();
  expect(dialog.style.maxWidth).toBe("520px");
  expect(() => mountWideWorkbenchModal(dom.window.document.body)()).not.toThrow();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  dom?.window.close();
  platform.OS = "web";
  vi.unstubAllGlobals();
});
function setup(compact = false) {
  dom = new JSDOM(`<main><section id="surface">
    ${
      compact
        ? `<header><div id="host-row"><div><button data-testid="header-back-button">Back</button></div><div id="host-title"><span data-testid="plugin-surface-title">Workbench</span></div><div><button id="host-picker">Host</button></div></div></header>`
        : `<header data-testid="composer-dock-header"><div><div id="host-row"><div id="host-title"><span data-testid="plugin-surface-title">Workbench</span></div><div id="host-actions"><button id="host-picker">Host</button><button data-testid="plugin-surface-close">Close</button></div></div></div></header>`
    }
    <article><div id="source" aria-hidden="false"><div>
      ${compact ? `<div><button id="ai" role="button">AI</button></div><button role="button" aria-label="工作台菜单">More</button>` : `<div>个人空间 › 工作台</div><div><span id="status">2 / 2 在线</span><button id="ai" role="button">AI 工作空间</button><button id="refresh" role="button">刷新</button></div>`}
    </div></div><div>Projects</div></article>
  </section><section id="other"><header>Other plugin</header></section></main>`);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  vi.stubGlobal("MutationObserver", dom.window.MutationObserver);
  const document = dom.window.document;
  const source = document.getElementById("source")!;
  return { document, source, host: document.getElementById("host-row")! };
}
it("puts live workbench actions in the host header while retaining native close and host selection", async () => {
  const { document, source, host } = setup();
  const close = document.querySelector<HTMLButtonElement>('[data-testid="plugin-surface-close"]')!;
  const closeParent = close.parentElement;
  const onClose = vi.fn(),
    onAI = vi.fn(),
    onHost = vi.fn();
  close.onclick = onClose;
  document.getElementById("ai")!.onclick = onAI;
  document.getElementById("host-picker")!.onclick = onHost;
  dispose = mountWorkbenchHeader(source);
  expect(dom.window.getComputedStyle(source).display).toBe("none");
  expect(
    dom.window.getComputedStyle(document.querySelector('[data-testid="plugin-surface-title"]')!)
      .display,
  ).toBe("none");
  const ai = host.querySelector<HTMLButtonElement>('[id="ai"]')!;
  ai.click();
  ai.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onAI).toHaveBeenCalledTimes(2);
  expect(close.parentElement).toBe(closeParent);
  expect(closeParent!.lastElementChild).toBe(close);
  close.click();
  document.getElementById("host-picker")!.click();
  expect(onClose).toHaveBeenCalledOnce();
  expect(onHost).toHaveBeenCalledOnce();
  ai.focus();
  source.querySelector("#status")!.textContent = "1 / 2 在线";
  await Promise.resolve();
  expect(host.textContent).toContain("1 / 2 在线");
  expect(document.activeElement).toBe(host.querySelector('[id="ai"]'));
  source.querySelector("#refresh")!.setAttribute("aria-disabled", "true");
  const refresh = vi.fn();
  (source.querySelector("#refresh") as HTMLButtonElement).onclick = refresh;
  await Promise.resolve();
  host.querySelector<HTMLButtonElement>('[id="refresh"]')!.click();
  expect(refresh).not.toHaveBeenCalled();
});
it("restores the source header and native title on cleanup without changing another plugin", () => {
  const { document, source, host } = setup();
  dispose = mountWorkbenchHeader(source);
  dispose();
  expect(source.getAttribute("aria-hidden")).toBe("false");
  expect(dom.window.getComputedStyle(source).display).not.toBe("none");
  expect(
    dom.window.getComputedStyle(document.querySelector('[data-testid="plugin-surface-title"]')!)
      .display,
  ).not.toBe("none");
  expect(host.querySelector('[id="ai"]')).toBeNull();
  expect(document.getElementById("other")!.innerHTML).toBe("<header>Other plugin</header>");
  expect(document.querySelector("style")).toBeNull();
});
it("keeps the compact back button and updates expanded workbench tools", async () => {
  const { document, source, host } = setup(true);
  const back = document.querySelector<HTMLButtonElement>('[data-testid="header-back-button"]')!;
  const onBack = vi.fn();
  back.onclick = onBack;
  dispose = mountWorkbenchHeader(source);
  expect(host.querySelector('[id="ai"]')).not.toBeNull();
  back.click();
  expect(onBack).toHaveBeenCalledOnce();
  const extra = document.createElement("div");
  extra.textContent = "Expanded tools";
  source.append(extra);
  await Promise.resolve();
  expect(host.parentElement!.textContent).toContain("Expanded tools");
});
it("leaves native platforms and unsupported host markup untouched", () => {
  const { source, document } = setup();
  platform.OS = "ios";
  dispose = mountWorkbenchHeader(source);
  expect(source.getAttribute("aria-hidden")).toBe("false");
  expect(document.querySelector("style")).toBeNull();
  platform.OS = "web";
  document.querySelector('[data-testid="plugin-surface-title"]')!.remove();
  dispose = mountWorkbenchHeader(source);
  expect(source.getAttribute("aria-hidden")).toBe("false");
  expect(document.querySelector("style")).toBeNull();
});
