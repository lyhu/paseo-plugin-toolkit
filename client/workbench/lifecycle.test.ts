import { act, createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkbenchModel } from "./data";
import { createCatalog } from "../project-tree/catalog";
import { defaultWorkbenchState, readWorkbenchState } from "../../shared/workbench/state";
import { readPersonalAI } from "../../shared/workbench/ai";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
interface Root {
  render(node: ReactNode): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(container: Element): Root;
};
vi.mock("@getpaseo/plugin/client", () => ({
  getPaseoClient: () => ({ providers: { waitForReady: async () => ({ entries: [] }) } }),
}));
vi.mock("../project-tree/device", () => ({
  loadDevicePreferences: async () => {},
  readDevicePreference: () => null,
  writeDevicePreference: () => {},
}));
let root: Root | undefined, dom: JSDOM | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  dom?.window.close();
  dom = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup(
  readState: () => Promise<ReturnType<typeof defaultWorkbenchState>> = async () =>
    defaultWorkbenchState(),
) {
  vi.useFakeTimers();
  dom = new JSDOM("<div id='root'></div>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const catalog = createCatalog();
  catalog.restore();
  const rpc = vi.fn(async (contract: unknown) =>
    contract === readWorkbenchState
      ? readState()
      : contract === readPersonalAI
        ? { root: "", initialized: false, skills: [] }
        : [],
  );
  function Harness() {
    useWorkbenchModel(
      { rpc } as never,
      { host: { id: "configuration" } } as PluginScreenProps,
      catalog.read(),
      async () => {},
    );
    return null;
  }
  const mount = async () => {
    root = createRoot(document.getElementById("root")!);
    await act(async () => root!.render(createElement(Harness)));
  };
  await mount();
  return { rpc, mount };
}
it("releases polling timers over thirty mount/unmount cycles", async () => {
  const harness = await setup();
  for (let cycle = 0; cycle < 30; cycle++) {
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root!.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);
    if (cycle < 29) await harness.mount();
  }
  const reads = harness.rpc.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(harness.rpc).toHaveBeenCalledTimes(reads);
});
it("does not restart polling when an in-flight read resolves after unmount", async () => {
  let resolve!: (value: ReturnType<typeof defaultWorkbenchState>) => void;
  const pending = new Promise<ReturnType<typeof defaultWorkbenchState>>((r) => {
    resolve = r;
  });
  const harness = await setup(() => pending);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => {
    resolve(defaultWorkbenchState());
  });
  expect(vi.getTimerCount()).toBe(0);
  const reads = harness.rpc.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(harness.rpc).toHaveBeenCalledTimes(reads);
});
