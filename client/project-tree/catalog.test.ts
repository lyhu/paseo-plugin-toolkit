import { expect, it } from "vitest";
import { createCatalog, projectAvailable, projectWorkspaces } from "./catalog";
import { applyTreeCommand } from "../../shared/project-tree/model";
const host = { serverId: "mini", label: "Mini", status: "online" } as const;
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
