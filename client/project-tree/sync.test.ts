import { afterEach, expect, it, vi } from "vitest";
import { createCatalog, type HostCatalog } from "./catalog";
import { createWorkbenchSync } from "./sync";
import { applyTreeCommand, type Tree } from "../../shared/project-tree/model";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.useRealTimers();
});
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  vi.useFakeTimers();
  const catalog = createCatalog();
  catalog.restore();
  const adapter = {
    readTree: vi.fn(async (): Promise<Tree> => ({ revision: 0, nodes: [] })),
    changeTree: vi.fn(async (_revision: number, command: Parameters<typeof applyTreeCommand>[1]) =>
      applyTreeCommand(catalog.read().tree, command),
    ),
    readHost: vi.fn<Parameters<typeof createWorkbenchSync>[1]["readHost"]>(async () => ({
      projects: [],
      workspaces: [],
    })),
    sessionDemand: vi.fn(() => new Map([["w", 5]])),
  };
  const sync = createWorkbenchSync(catalog, adapter);
  cleanups.push(sync.dispose);
  sync.hosts([{ serverId: "pro", label: "Pro", status: "online" }]);
  sync.setEnabled(true);
  return { catalog, adapter, sync };
}
it("shares polling, reads sessions only for history demand, and stops at the last release", async () => {
  const { adapter, sync } = fixture();
  const first = sync.acquire();
  const second = sync.acquire();
  await flush();
  expect(adapter.readHost).toHaveBeenCalledTimes(1);
  expect(adapter.readHost.mock.calls[0]![1]).toMatchObject({ sessions: false });
  const history = sync.acquire(true);
  await flush();
  expect(adapter.readHost.mock.calls.at(-1)![1]).toMatchObject({
    sessions: true,
    sessionLimits: new Map([["w", 5]]),
  });
  first();
  second();
  await vi.advanceTimersByTimeAsync(5000);
  expect(adapter.readHost).toHaveBeenCalledTimes(3);
  history();
  history();
  await vi.advanceTimersByTimeAsync(10000);
  expect(adapter.readHost).toHaveBeenCalledTimes(3);
});
it("discards late Host data after the last release and refreshes a new demand", async () => {
  const { catalog, adapter, sync } = fixture();
  const old = deferred<HostCatalog>();
  const published: string[] = [];
  catalog.subscribe(() =>
    published.push(...(catalog.read().catalogs.pro?.projects.map((project) => project.name) ?? [])),
  );
  adapter.readHost.mockReturnValueOnce(old.promise);
  const release = sync.acquire();
  release();
  const nextRelease = sync.acquire();
  old.resolve({
    projects: [{ serverId: "pro", projectId: "stale", name: "Stale", root: "/stale" }],
    workspaces: [],
  });
  await flush();
  expect(adapter.readHost).toHaveBeenCalledTimes(2);
  expect(adapter.readTree).toHaveBeenCalledTimes(1);
  expect(published).not.toContain("Stale");
  expect(catalog.read().editable).toBe(true);
  nextRelease();
});
it("discards an old tree read across disable and reenable", async () => {
  const { catalog, adapter, sync } = fixture();
  const old = deferred<Tree>();
  adapter.readTree.mockReturnValueOnce(old.promise);
  sync.acquire();
  await flush();
  sync.setEnabled(false);
  sync.setEnabled(true);
  old.resolve({ revision: 99, nodes: [] });
  await flush();
  expect(adapter.readTree).toHaveBeenCalledTimes(2);
  expect(catalog.read().tree.revision).toBe(0);
  expect(catalog.read().editable).toBe(true);
});
it("waits for discovery before editing and never overwrites the edit with a poll", async () => {
  const { catalog, adapter, sync } = fixture();
  sync.acquire();
  await flush();
  const discovery = deferred<Tree>();
  adapter.readTree.mockReturnValueOnce(discovery.promise);
  const poll = sync.refresh();
  await flush();
  const edit = sync.run({ type: "folder", id: "f", name: "F", parentId: null });
  expect(adapter.changeTree).not.toHaveBeenCalled();
  discovery.resolve({ revision: 7, nodes: [] });
  await poll;
  await edit;
  expect(adapter.changeTree.mock.calls[0]![0]).toBe(7);
  expect(catalog.read().tree.nodes[0]?.id).toBe("f");
  expect(catalog.read().editable).toBe(true);
});
it("does not publish an edit response after its demand is released", async () => {
  const { catalog, adapter, sync } = fixture();
  const release = sync.acquire();
  await flush();
  const response = deferred<Tree>();
  adapter.changeTree.mockReturnValueOnce(response.promise);
  const edit = sync.run({ type: "folder", id: "late", name: "Late", parentId: null });
  const rejected = expect(edit).rejects.toThrow();
  release();
  response.resolve({
    revision: 1,
    nodes: [{ id: "late", kind: "folder", name: "Late", parentId: null }],
  });
  await rejected;
  expect(catalog.read().tree.nodes).toEqual([]);
  expect(catalog.read().editable).toBe(false);
});

it("does not read or publish remote tree synchronization while an edit is in flight", async () => {
  const { catalog, adapter, sync } = fixture();
  sync.acquire();
  await flush();
  const response = deferred<Tree>();
  adapter.changeTree.mockReturnValueOnce(response.promise);
  const edit = sync.run({ type: "folder", id: "f", name: "F", parentId: null });
  await sync.refresh();
  expect(adapter.readTree).toHaveBeenCalledTimes(1);
  expect(catalog.read().editable).toBe(false);
  response.resolve({
    revision: 1,
    nodes: [{ id: "f", kind: "folder", name: "F", parentId: null }],
  });
  await edit;
  expect(catalog.read().tree.nodes[0]!.id).toBe("f");
});

it("requires fresh target Host data for workspace creation even when the configuration Host responds", async () => {
  const { adapter, sync } = fixture();
  sync.acquire();
  await flush();
  adapter.readHost.mockRejectedValueOnce(new Error("Host read failed"));
  await expect(sync.refresh("pro")).rejects.toThrow("Host read failed");
  await sync.refresh("pro");
});

it("loads bounded workbench history then returns to visible sidebar session demand", async () => {
  const { adapter, sync } = fixture();
  const sidebar = sync.acquire(true);
  await flush();
  const workbench = sync.acquire("all");
  await flush();
  expect(adapter.readHost.mock.calls.at(-1)![1]).toMatchObject({
    sessions: true,
    maxSessionPages: 2,
  });
  expect(adapter.readHost.mock.calls.at(-1)![1].sessionLimits).toBeUndefined();
  workbench();
  await vi.advanceTimersByTimeAsync(5000);
  expect(adapter.readHost.mock.calls.at(-1)![1]).toMatchObject({
    sessions: true,
    sessionLimits: new Map([["w", 5]]),
  });
  expect(adapter.readHost.mock.calls.at(-1)![1].maxSessionPages).toBeUndefined();
  sidebar();
  expect(vi.getTimerCount()).toBe(0);
});
