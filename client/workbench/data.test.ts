import { act, createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
interface Root {
  render(node: ReactNode): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(container: Element): Root;
};
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkbenchModel } from "./data";
import type { WorkbenchModel } from "./types";
import { createCatalog } from "../project-tree/catalog";
import {
  defaultWorkbenchState,
  readWorkbenchState,
  saveWorkbenchPreferences,
  saveWorkbenchMemory,
  removeWorkbenchMemory,
} from "../../shared/workbench/state";
import {
  readPersonalAI,
  createPersonalAISession,
  saveWorkbenchSkill,
  toggleWorkbenchSkill,
} from "../../shared/workbench/ai";
import {
  listCreationPlans,
  executeCreationPlan,
  cancelCreationPlan,
} from "../../shared/workbench/operations";
import {
  readSearchStatus,
  searchWorkbenchHistory,
  indexWorkbenchSession,
  cancelWorkbenchIndex,
  clearWorkbenchIndex,
} from "../../shared/workbench/search";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@getpaseo/plugin/client", () => ({
  getPaseoClient: () => ({ providers: { waitForReady: mocks.providers } }),
}));
vi.mock("../project-tree/device", () => ({
  loadDevicePreferences: mocks.load,
  readDevicePreference: mocks.read,
  writeDevicePreference: mocks.write,
}));
let root: Root | undefined, dom: JSDOM | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  dom?.window.close();
  dom = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function setup() {
  vi.useFakeTimers();
  dom = new JSDOM("<div id='root'></div>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.providers.mockResolvedValue({
    entries: [
      {
        provider: "codex",
        status: "ready",
        enabled: true,
        models: [{ id: "test", label: "Test" }],
      },
      { provider: "unavailable", enabled: false, models: [] },
    ],
  });
  mocks.load.mockResolvedValue(undefined);
  mocks.read.mockReturnValue("B");
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "Mini", status: "offline" },
  ]);
  catalog.restore();
  for (const serverId of ["pro", "mini"])
    catalog.update(serverId, {
      projects: [
        { serverId, projectId: "p", name: "Project " + serverId, root: "/project/" + serverId },
      ],
      workspaces: [
        {
          serverId,
          projectId: "p",
          id: "w",
          name: "Workspace " + serverId,
          cwd: "/workspace/" + serverId,
        },
      ],
      sessions: [
        { id: "same", workspaceId: "w", title: "Session " + serverId, updatedAt: "2026-10-24" },
      ],
    });
  catalog.connection(true);
  let saved = { ...defaultWorkbenchState(), revision: 5 };
  const responses = new Map<unknown, unknown>([
    [
      readPersonalAI,
      {
        root: "/ai",
        initialized: true,
        serverId: "pro",
        projectId: "p",
        workspaceId: "w",
        skills: [],
      },
    ],
    [listCreationPlans, []],
    [readSearchStatus, []],
    [searchWorkbenchHistory, { hits: [], coverage: [] }],
  ]);
  const rpc = vi.fn(async (contract: unknown, input: Record<string, unknown>) => {
    if (contract === readWorkbenchState) return saved;
    if (contract === saveWorkbenchPreferences) {
      saved = {
        ...saved,
        revision: saved.revision + 1,
        preferences: input.preferences as typeof saved.preferences,
      };
      return saved;
    }
    if (contract === saveWorkbenchMemory || contract === removeWorkbenchMemory) {
      saved = { ...saved, revision: saved.revision + 1 };
      return saved;
    }
    return responses.get(contract);
  });
  const refreshCatalog = vi.fn(async () => {});
  let model!: WorkbenchModel;
  function Harness() {
    model = useWorkbenchModel(
      { rpc } as never,
      { host: { id: "pro" } } as PluginScreenProps,
      catalog.read(),
      refreshCatalog,
    );
    return null;
  }
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(createElement(Harness)));
  return {
    get model() {
      return model;
    },
    rpc,
    responses,
    refreshCatalog,
    get saved() {
      return saved;
    },
    set saved(value) {
      saved = value;
    },
  };
}
it("hydrates host catalog, device layout and providers, and saves with the latest accepted revision", async () => {
  const h = await setup();
  expect(h.model.loading).toBe(false);
  expect(h.model.preferences.layout).toBe("B");
  expect(h.model.ai.providers).toEqual([{ id: "codex/test", label: "codex · Test" }]);
  expect(h.model.workspaces.map((w) => [w.serverId, w.id])).toEqual([
    ["pro", "w"],
    ["mini", "w"],
  ]);
  await act(async () => h.model.savePreferences({ favorites: ["project"] }));
  expect(h.rpc).toHaveBeenCalledWith(
    saveWorkbenchPreferences,
    expect.objectContaining({ revision: 5 }),
  );
  await act(async () => h.model.savePreferences({ layout: "C" }));
  expect(mocks.write).toHaveBeenCalledWith("pro.workbench.layout", "C");
  await act(async () =>
    h.model.saveMemory({
      title: "Remember",
      body: "Reference",
      scope: "personal",
      confirmed: true,
      enabled: true,
    }),
  );
  expect(h.rpc).toHaveBeenCalledWith(
    saveWorkbenchMemory,
    expect.objectContaining({ revision: 6, confirmed: true }),
  );
  await act(async () => h.model.removeMemory("memory"));
  expect(h.rpc).toHaveBeenCalledWith(removeWorkbenchMemory, { id: "memory", revision: 7 });
});
it("rejects concurrent writes and ignores a delayed poll older than a successful mutation", async () => {
  const h = await setup(),
    poll = deferred<unknown>(),
    save = deferred<unknown>();
  const defaultRPC = h.rpc.getMockImplementation()!;
  h.rpc.mockImplementation(async (contract, input) =>
    contract === readWorkbenchState
      ? poll.promise
      : contract === saveWorkbenchPreferences
        ? save.promise
        : defaultRPC(contract, input),
  );
  let refresh!: Promise<void>, mutation!: Promise<void>;
  await act(async () => {
    refresh = h.model.refresh();
    mutation = h.model.savePreferences({ favorites: ["new"] });
  });
  await expect(h.model.savePreferences({ favorites: ["concurrent"] })).rejects.toThrow("正在保存");
  await act(async () => {
    save.resolve({
      ...h.saved,
      revision: 6,
      preferences: { ...h.saved.preferences, favorites: ["new"] },
    });
    await mutation;
  });
  await act(async () => {
    poll.resolve(h.saved);
    await refresh;
  });
  expect(h.model.preferences.favorites).toEqual(["new"]);
});
it("maps search and indexing results to full host addresses and marks offline history", async () => {
  const h = await setup();
  h.responses.set(searchWorkbenchHistory, {
    hits: [
      {
        serverId: "mini",
        workspaceId: "w",
        agentId: "same",
        title: "History",
        text: "needle body",
        seq: 9,
        epoch: "e",
        indexedAt: "2026-10-24",
      },
    ],
    coverage: [{ status: "ready" }],
  });
  const found = await h.model.search("needle", "session");
  expect(found.results).toEqual([
    expect.objectContaining({ serverId: "mini", workspaceId: "w", agentId: "same", stale: true }),
  ]);
  expect(found.coverage).toContain("1 个会话正文");
  const session = h.model.sessions[0]!;
  await act(async () => h.model.indexSession!(session));
  expect(h.rpc).toHaveBeenCalledWith(
    indexWorkbenchSession,
    expect.objectContaining({ serverId: "pro", workspaceId: "w", agentId: "same" }),
  );
  h.responses.set(createPersonalAISession, {
    serverId: "mini",
    workspaceId: "remote",
    agentId: "new",
  });
  await expect(h.model.newSession({ provider: "codex/test", title: "New" })).resolves.toEqual({
    id: "new",
    serverId: "mini",
    workspaceId: "remote",
    title: "New",
  });
  expect(h.refreshCatalog).toHaveBeenCalled();
});
it("maps index cancellation and clearing to each stored host/session address", async () => {
  const h = await setup();
  const statuses = [
    { serverId: "pro", workspaceId: "w", agentId: "a", title: "A", status: "queued", count: 0 },
    { serverId: "mini", workspaceId: "w", agentId: "b", title: "B", status: "ready", count: 3 },
  ];
  h.responses.set(readSearchStatus, statuses);
  await act(async () => h.model.refresh());
  await act(async () => h.model.cancelIndex!());
  expect(h.rpc).toHaveBeenCalledWith(cancelWorkbenchIndex, statuses[0]);
  expect(h.rpc).not.toHaveBeenCalledWith(cancelWorkbenchIndex, statuses[1]);
  await act(async () => h.model.clearSearchIndex!());
  expect(h.rpc).toHaveBeenCalledWith(clearWorkbenchIndex, statuses[0]);
  expect(h.rpc).toHaveBeenCalledWith(clearWorkbenchIndex, statuses[1]);
});
it("passes skill and creation-plan identifiers through public RPCs", async () => {
  const h = await setup(),
    personal = { root: "/ai", initialized: true, skills: [] };
  h.responses.set(saveWorkbenchSkill, personal);
  h.responses.set(toggleWorkbenchSkill, personal);
  await act(async () =>
    h.model.saveSkill({ slug: "example", name: "Example", content: "Instructions" }),
  );
  expect(h.rpc).toHaveBeenCalledWith(saveWorkbenchSkill, {
    slug: "example",
    name: "Example",
    description: "Example",
    content: "Instructions",
  });
  await act(async () => h.model.toggleSkill("example", false));
  expect(h.rpc).toHaveBeenCalledWith(toggleWorkbenchSkill, { slug: "example", enabled: false });
  await act(async () => h.model.executePlan("plan", 4));
  expect(h.rpc).toHaveBeenCalledWith(executeCreationPlan, { id: "plan", revision: 4 });
  await act(async () => h.model.cancelPlan("plan", 5));
  expect(h.rpc).toHaveBeenCalledWith(cancelCreationPlan, { id: "plan", revision: 5 });
});
it("surfaces a failed refresh and recovers editability after the host returns", async () => {
  const h = await setup(),
    defaultRPC = h.rpc.getMockImplementation()!;
  h.rpc.mockImplementation(async (contract, input) => {
    if (contract === readWorkbenchState) throw new Error("Host offline");
    return defaultRPC(contract, input);
  });
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(h.model.error).toContain("Host offline");
  expect(h.model.editable).toBe(false);
  h.rpc.mockImplementation(defaultRPC);
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(h.model.error).toBeUndefined();
  expect(h.model.editable).toBe(true);
});

it("keeps a failed write retryable without advancing the local revision", async () => {
  const h = await setup(),
    defaultRPC = h.rpc.getMockImplementation()!;
  h.rpc.mockImplementationOnce(async () => {
    throw new Error("revision conflict");
  });
  await expect(h.model.savePreferences({ favorites: ["stale"] })).rejects.toThrow(
    "revision conflict",
  );
  h.rpc.mockImplementation(defaultRPC);
  await act(async () => h.model.savePreferences({ favorites: ["retry"] }));
  expect(h.rpc).toHaveBeenLastCalledWith(
    saveWorkbenchPreferences,
    expect.objectContaining({ revision: 5 }),
  );
  expect(h.model.preferences.favorites).toEqual(["retry"]);
});

it("returns cached metadata with explicit coverage when history Host is offline", async () => {
  const h = await setup(),
    original = h.rpc.getMockImplementation()!;
  h.rpc.mockImplementation(async (contract, input) => {
    if (contract === searchWorkbenchHistory) throw new Error("offline");
    return original(contract, input);
  });
  const found = await h.model.search(h.model.projects[0]!.name, "all");
  expect(found.results.some((r) => r.kind === "project")).toBe(true);
  expect(found.coverage).toContain("正文搜索暂不可用");
});
