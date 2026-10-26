import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));
import { getTitleComposer } from "../web";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  platform.OS = "web";
  const dom = new JSDOM(`<main>
    <section><span data-testid="session-title-composer-other"></span><textarea data-composer-input>other</textarea></section>
    <section id="current"><span data-testid="session-title-composer-a"></span><textarea data-composer-input></textarea><button role="button" aria-label="Send message"></button></section>
  </main>`);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("MouseEvent", dom.window.MouseEvent);
  const input = dom.window.document.querySelector("#current textarea")! as HTMLTextAreaElement;
  Object.defineProperties(input, { clientWidth: { value: 400 }, clientHeight: { value: 80 } });
  return { dom, input };
}

it("fills only the clicked conversation and dispatches input without submitting", () => {
  const { input, dom } = fixture();
  const events: string[] = [];
  for (const name of ["input", "keydown", "submit"])
    input.addEventListener(name, () => events.push(name));
  const access = getTitleComposer("a")!;
  expect(access.write("/clear")).toBe(true);
  expect(input.value).toBe("/clear");
  expect(events).toEqual(["input"]);
  expect(dom.window.document.querySelector("textarea")!.value).toBe("other");
  expect(dom.window.document.activeElement).toBe(input);
});

it("refuses to fill an input reused by another conversation", () => {
  const { dom } = fixture();
  const access = getTitleComposer("a")!;
  dom.window.document
    .querySelector("#current span")!
    .setAttribute("data-testid", "session-title-composer-b");
  expect(access.write("/clear")).toBe(false);
});

it("refuses detached inputs and cannot fall through to another pane", () => {
  const { input } = fixture();
  const access = getTitleComposer("a")!;
  input.remove();
  expect(access.write("/clear")).toBe(false);
  expect(getTitleComposer("missing")).toBeUndefined();
});

it("does not access DOM on native clients", () => {
  fixture();
  platform.OS = "ios";
  expect(getTitleComposer("a")).toBeUndefined();
});

it("submits /clear through the host send button after committing its input value", async () => {
  const { input, dom } = fixture();
  const submitted: string[] = [];
  dom.window.document
    .querySelector("button")!
    .addEventListener("click", () => submitted.push(input.value));
  expect(await getTitleComposer("a")!.submitClear(new AbortController().signal)).toBe(true);
  expect(submitted).toEqual(["/clear"]);
});

it("refuses to submit with attachments, so /clear cannot fall through to an agent prompt", async () => {
  const { input, dom } = fixture();
  const tray = dom.window.document.createElement("div");
  tray.setAttribute("data-testid", "composer-attachment-tray");
  dom.window.document.querySelector("#current")!.appendChild(tray);
  const click = vi.fn();
  dom.window.document.querySelector("button")!.addEventListener("click", click);
  expect(await getTitleComposer("a")!.submitClear(new AbortController().signal)).toBe(false);
  expect(click).not.toHaveBeenCalled();
  expect(input.value).toBe("");
});

it("does not submit after teardown or when the native send button is disabled", async () => {
  const { dom } = fixture();
  const access = getTitleComposer("a")!;
  const controller = new AbortController();
  controller.abort();
  expect(await access.submitClear(controller.signal)).toBe(false);
  dom.window.document.querySelector("button")!.setAttribute("aria-disabled", "true");
  expect(await access.submitClear(new AbortController().signal)).toBe(false);
});
