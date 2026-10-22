import { expect, it, vi } from "vitest";
import { createCatalog, projectAvailable, projectWorkspaces, readHostCatalog } from "./catalog";
import { applyTreeCommand } from "../../shared/project-tree/model";
const host = { serverId: "mini", label: "Mini", status: "online" } as const;
it("loads paginated history by workspace identity, excluding unrelated and internal sessions", async () => {
  const session = (id: string, workspaceId?: string, internal = false) => ({
    agent: { id, workspaceId, internal, title: id, updatedAt: "2026-10-22T00:00:00Z" },
  });
  const list = vi
    .fn()
    .mockResolvedValueOnce({
      entries: [session("first", "w"), session("other", "other"), session("legacy")],
      pageInfo: { nextCursor: "next" },
    })
    .mockResolvedValueOnce({
      entries: [session("second", "w"), session("internal", "w", true)],
      pageInfo: { nextCursor: null },
    });
  const api = {
    projects: { list: async () => ({ projects: [] }) },
    workspaces: {
      list: async () => ({
        entries: [
          { id: "w", projectId: "p", name: "W", workspaceDirectory: "/same" },
          { id: "background", background: true },
        ],
        pageInfo: { nextCursor: null },
      }),
    },
    agents: { list },
  };
  const result = await readHostCatalog(api as never, "mini");
  expect(result.sessions?.map((session) => session.id)).toEqual(["first", "second"]);
  expect(list.mock.calls[1]![0].page.cursor).toBe("next");
  expect(list.mock.calls[0]![0].filter).toEqual({ includeArchived: true });
});
it("places only the dragged workspace in its target display group and retains Host identity across refreshes", () => {
  const catalog = createCatalog();
  catalog.hosts([host, { serverId: "pro", label: "Pro", status: "online" }]);
  catalog.restore();
  catalog.update("mini", {
    projects: [{ serverId: "mini", projectId: "m", name: "Mini", root: "/mini" }],
    workspaces: [
      { serverId: "mini", projectId: "m", id: "w", name: "Moved", cwd: "/mini" },
      { serverId: "mini", projectId: "m", id: "other", name: "Stays", cwd: "/mini" },
    ],
  });
  catalog.update("pro", {
    projects: [{ serverId: "pro", projectId: "p", name: "Pro", root: "/pro" }],
    workspaces: [],
  });
  const [mini, pro] = catalog.read().tree.nodes;
  catalog.organize(
    applyTreeCommand(catalog.read().tree, {
      type: "moveWorkspace",
      serverId: "mini",
      workspaceId: "w",
      targetId: pro!.id,
    }),
  );
  expect(
    projectWorkspaces(catalog.read(), [{ serverId: "mini", projectId: "m" }], mini!.id).map(
      (w) => w.id,
    ),
  ).toEqual(["other"]);
  expect(projectWorkspaces(catalog.read(), [{ serverId: "pro", projectId: "p" }], pro!.id)).toEqual(
    [{ serverId: "mini", projectId: "m", id: "w", name: "Moved", cwd: "/mini" }],
  );
  const cached = createCatalog({ tree: catalog.read().tree, catalogs: catalog.read().catalogs });
  cached.hosts([host]);
  expect(
    projectWorkspaces(cached.read(), [{ serverId: "pro", projectId: "p" }], pro!.id)[0]?.id,
  ).toBe("w");
});
it("retains configured offline hosts, but removes workspace metadata for a forgotten host", () => {
  const catalog = createCatalog();
  catalog.hosts([host]);
  catalog.restore();
  catalog.update("mini", {
    projects: [{ serverId: "mini", projectId: "p", name: "Project", root: "/repo" }],
    workspaces: [{ serverId: "mini", projectId: "p", id: "w", name: "Workspace", cwd: "/repo" }],
  });
  catalog.hosts([{ ...host, status: "offline" }]);
  expect(projectWorkspaces(catalog.read(), [{ serverId: "mini", projectId: "p" }])).toHaveLength(1);
  expect(projectAvailable(catalog.read(), [{ serverId: "mini", projectId: "p" }])).toBe(true);
  catalog.hosts([]);
  expect(projectWorkspaces(catalog.read(), [{ serverId: "mini", projectId: "p" }])).toEqual([]);
  expect(catalog.read().catalogs).toEqual({});
  expect(projectAvailable(catalog.read(), [{ serverId: "mini", projectId: "p" }])).toBe(false);
});
it("stops displaying a native project removed from its online Host without deleting shared organization", () => {
  const catalog = createCatalog();
  catalog.hosts([host]);
  catalog.restore({
    tree: {
      revision: 1,
      nodes: [
        {
          id: "group",
          kind: "project",
          name: "Operations",
          parentId: null,
          members: [{ serverId: "mini", projectId: "p" }],
        },
      ],
    },
    catalogs: {},
  });
  catalog.update("mini", { projects: [], workspaces: [] });
  expect(projectAvailable(catalog.read(), [{ serverId: "mini", projectId: "p" }])).toBe(false);
  expect(catalog.read().tree.nodes).toHaveLength(1);
});
it("keeps an open tree menu stable when a poll returns unchanged organization and connection", () => {
  const catalog = createCatalog();
  catalog.restore();
  catalog.connection(true);
  const before = catalog.read();
  catalog.organize({ ...before.tree, nodes: [...before.tree.nodes] });
  catalog.connection(true);
  expect(catalog.read()).toBe(before);
});

it("indexes placement once per snapshot and reuses project query results", () => {
  const catalog = createCatalog();
  catalog.hosts([host]);
  catalog.restore();
  const projects = Array.from({ length: 50 }, (_, i) => ({
    serverId: "mini",
    projectId: `p${i}`,
    name: `P${i}`,
    root: `/p${i}`,
  }));
  const workspaces = Array.from({ length: 250 }, (_, i) => ({
    serverId: "mini",
    projectId: `p${Math.floor(i / 5)}`,
    id: `w${i}`,
    name: `W${i}`,
    cwd: `/w${i}`,
  }));
  catalog.update("mini", { projects, workspaces });
  let comparisons = 0;
  const nodes = catalog.read().tree.nodes;
  const placements = workspaces.map((workspace, i) => ({
    serverId: "mini",
    get workspaceId() {
      comparisons++;
      return workspace.id;
    },
    nodeId: nodes[Math.floor(i / 5)]!.id,
  }));
  catalog.organize({ ...catalog.read().tree, workspacePlacements: placements });
  comparisons = 0;
  const snapshot = catalog.read();
  for (const node of snapshot.tree.nodes) {
    if (node.kind !== "project") continue;
    expect(projectAvailable(snapshot, node.members, node.id)).toBe(true);
    const rows = projectWorkspaces(snapshot, node.members, node.id);
    expect(rows).toHaveLength(5);
    expect(projectWorkspaces(snapshot, node.members, node.id)).toBe(rows);
  }
  expect(comparisons).toBe(250);
});

it("does not read hidden sessions and stops pagination after demand ends", async () => {
  let active = true;
  const list = vi.fn();
  const api = {
    projects: { list: async () => ({ projects: [] }) },
    workspaces: { list: vi.fn(async () => ({ entries: [], pageInfo: { nextCursor: null } })) },
    agents: { list },
  };
  expect((await readHostCatalog(api as never, "mini", { sessions: false })).sessions).toEqual([]);
  expect(list).not.toHaveBeenCalled();
  api.workspaces.list.mockImplementationOnce(async () => {
    active = false;
    return { entries: [], pageInfo: { nextCursor: "next" as never } };
  });
  await expect(readHostCatalog(api as never, "mini", { active: () => active })).rejects.toThrow(
    "Catalog read stopped",
  );
  expect(api.workspaces.list).toHaveBeenCalledTimes(2);
  expect(list).not.toHaveBeenCalled();
});
it("retains only the requested session window while preserving the total count", async () => {
  const api = {
    projects: { list: async () => ({ projects: [] }) },
    workspaces: {
      list: async () => ({
        entries: [{ id: "w", projectId: "p", name: "W", workspaceDirectory: "/w" }],
        pageInfo: { nextCursor: null },
      }),
    },
    agents: {
      list: async () => ({
        entries: Array.from({ length: 1000 }, (_, i) => ({
          agent: {
            id: String(i),
            workspaceId: "w",
            title: `Session ${i}`,
            updatedAt: "2026-10-22",
          },
        })),
        pageInfo: { nextCursor: null },
      }),
    },
  };
  const result = await readHostCatalog(api as never, "mini", {
    sessionLimits: new Map([["w", 5]]),
  });
  expect(result.sessions).toHaveLength(5);
  expect(result.sessionCounts).toEqual({ w: 1000 });
  expect(result.sessions?.map((entry) => entry.id)).toEqual(["0", "1", "2", "3", "4"]);
});
it("publishes a multi-host batch once and deduplicates repeated errors", () => {
  const catalog = createCatalog();
  catalog.hosts([host, { ...host, serverId: "pro" }]);
  catalog.restore();
  const notify = vi.fn();
  catalog.subscribe(notify);
  catalog.batch(() => {
    catalog.update("mini", { projects: [], workspaces: [] });
    catalog.update("pro", { projects: [], workspaces: [] });
  });
  expect(notify).toHaveBeenCalledOnce();
  catalog.error("mini", new Error("Offline"));
  const previous = catalog.read();
  catalog.error("mini", new Error("Offline"));
  expect(catalog.read()).toBe(previous);
  expect(notify).toHaveBeenCalledTimes(2);
});
