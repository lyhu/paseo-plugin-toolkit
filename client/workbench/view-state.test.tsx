// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkbenchViewState } from "./view-state";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): { render(node: unknown): void; unmount(): void };
};
const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  load: vi.fn(async (_keys: string[]) => {}),
  write: vi.fn(),
}));
vi.mock("../project-tree/device", () => ({
  loadDevicePreferences: mocks.load,
  readDevicePreference: (key: string) => mocks.storage.get(key) ?? null,
  writeDevicePreference: (key: string, value: string) => {
    mocks.write(key, value);
    mocks.storage.set(key, value);
  },
}));
let root: ReturnType<typeof createRoot> | undefined;
let view: ReturnType<typeof useWorkbenchViewState>;
function Harness({ host = "pro" }: { host?: string }) {
  view = useWorkbenchViewState(host);
  return null;
}
async function mount(host = "pro") {
  if (!root) {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(createElement(Harness, { host })));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.storage.clear();
  mocks.load.mockResolvedValue(undefined);
  mocks.write.mockClear();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

it("restores browsing state after closing and reopening, isolated by configuration Host", async () => {
  await mount();
  const chosen = {
    tab: "operations",
    host: "mini",
    scenario: "ops" as const,
    query: "cluster",
    scope: "workspace" as const,
    filtersOpen: true,
    hostView: "list" as const,
  };
  await act(async () => view[1](chosen));
  await act(async () => root!.unmount());
  root = undefined;
  await mount();
  expect(view[0]).toEqual(chosen);
  await mount("other");
  expect(view[0]).toMatchObject({ tab: "all", query: "", hostView: "grid" });
  expect(JSON.parse(mocks.storage.get("pro.workbench.view")!)).toEqual(chosen);
  await mount("pro");
  expect(view[0]).toEqual(chosen);
});

it("does not overwrite saved state before asynchronous hydration and retains early user changes", async () => {
  let resolve!: () => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  await mount();
  expect(view[2]).toBe(false);
  await act(async () => view[1]({ tab: "new-choice" }));
  expect(mocks.write).not.toHaveBeenCalled();
  mocks.storage.set(
    "pro.workbench.view",
    JSON.stringify({ tab: "old-choice", query: "saved search", hostView: "list" }),
  );
  await act(async () => resolve());
  expect(view[0]).toMatchObject({ tab: "new-choice", query: "saved search", hostView: "list" });
  expect(view[2]).toBe(true);
});

it("ignores a delayed read after switching Hosts and tolerates invalid saved data", async () => {
  let resolve!: () => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  mocks.storage.set("other.workbench.view", "invalid JSON");
  await mount();
  await mount("other");
  await act(async () => view[1]({ tab: "other-group" }));
  mocks.storage.set("pro.workbench.view", JSON.stringify({ tab: "pro-group" }));
  await act(async () => resolve());
  expect(view[0].tab).toBe("other-group");
  expect(JSON.parse(mocks.storage.get("pro.workbench.view")!)).toEqual({ tab: "pro-group" });
});
