import { expect, it } from "vitest";
import { createCatalog } from "../project-tree/catalog";
import { defaultWorkbenchState } from "../../shared/workbench/state";
import { nativeProjectPreferences, nativeWorkbenchProjects } from "./native-projects";
it("uses the latest native workspace activity for each Host-local project", () => {
  const { snapshot } = fixture();
  snapshot.catalogs.a!.workspaces[0]!.lastActivityAt = "2026-10-20T00:00:00Z";
  snapshot.catalogs.a!.workspaces[1]!.lastActivityAt = "2026-10-24T10:00:00+08:00";
  snapshot.catalogs.b!.workspaces[0]!.lastActivityAt = "2026-10-23T00:00:00Z";
  const projects = nativeWorkbenchProjects(snapshot);
  expect(projects.map((p) => p.lastActivityAt)).toEqual([
    "2026-10-24T02:00:00.000Z",
    "2026-10-23T00:00:00.000Z",
    undefined,
  ]);
});

function fixture() {
  const catalog = createCatalog();
  catalog.hosts(
    ["a", "b", "c"].map((serverId) => ({ serverId, label: serverId, status: "online" as const })),
  );
  catalog.restore();
  for (const serverId of ["a", "b", "c"])
    catalog.update(serverId, {
      projects: [{ serverId, projectId: "p", name: `Native ${serverId}`, root: `/${serverId}` }],
      workspaces: (serverId === "a" ? ["one", "two"] : ["one"]).map((id) => ({
        serverId,
        projectId: "p",
        id,
        name: `${serverId} ${id}`,
        cwd: `/${serverId}/${id}`,
      })),
    });
  const snapshot = catalog.read();
  snapshot.tree = {
    revision: 1,
    nodes: [
      {
        kind: "project",
        id: "merged",
        name: "Operations",
        parentId: null,
        members: [
          { serverId: "a", projectId: "p" },
          { serverId: "b", projectId: "p" },
        ],
      },
    ],
    workspacePlacements: [{ serverId: "c", workspaceId: "one", nodeId: "merged" }],
  };
  const ids = ["a", "b", "c"].map((serverId) => JSON.stringify([serverId, "p"]));
  const preferences = {
    ...defaultWorkbenchState().preferences,
    favorites: ["merged", ids[0]!],
    tabs: [
      {
        id: "ops",
        name: "Operations",
        kind: "manual" as const,
        projectIds: ["merged"],
        projectOrder: ["merged"],
        workspacesOnly: true,
      },
    ],
    scenarioProjects: { ops: ["merged"] },
  };
  return { snapshot, ids, preferences };
}

it("expands legacy group references into three native projects without merging workspaces", () => {
  const { snapshot, ids, preferences } = fixture();
  const normalized = nativeProjectPreferences(snapshot, preferences);
  expect(normalized.favorites).toEqual(ids);
  expect(normalized.tabs[0]).toEqual({
    ...preferences.tabs[0],
    projectIds: ids,
    projectOrder: ids,
  });
  expect(normalized.scenarioProjects).toEqual({ ops: ids });
  expect(nativeProjectPreferences(snapshot, normalized)).toEqual(normalized);
  const projects = nativeWorkbenchProjects(snapshot);
  expect(projects.map((p) => p.id)).toEqual(ids);
  expect(projects.map((p) => p.name)).toEqual(["Native a", "Native b", "Native c"]);
  expect(projects.map((p) => p.workspaceCount)).toEqual([2, 1, 1]);
  expect(projects.every((p) => p.instances.length === 1)).toBe(true);
  expect(projects.map((p) => p.workspaceRefs)).toEqual([
    [
      { serverId: "a", id: "one" },
      { serverId: "a", id: "two" },
    ],
    [{ serverId: "b", id: "one" }],
    [{ serverId: "c", id: "one" }],
  ]);
  expect(preferences.tabs[0]!.projectIds).toEqual(["merged"]);
  expect(snapshot.tree.workspacePlacements).toHaveLength(1);
});

it("retains unresolved legacy associations until the native Host catalog returns", () => {
  const { snapshot, ids, preferences } = fixture();
  const returning = snapshot.catalogs.c!;
  delete snapshot.catalogs.c;
  const pending = nativeProjectPreferences(snapshot, preferences);
  expect(pending.tabs[0]!.projectIds).toEqual([ids[0], ids[1], "merged"]);
  expect(nativeProjectPreferences(snapshot, pending)).toEqual(pending);
  snapshot.catalogs.c = returning;
  expect(nativeProjectPreferences(snapshot, pending).tabs[0]!.projectIds).toEqual(ids);
});
