import { expect, it } from "vitest";
import { createCatalog, projectWorkspaces } from "./catalog";
import { groupSidebarSnapshot } from "./group-projection";
import type { WorkbenchPreferences, WorkbenchProject } from "../workbench/types";
import { nativeWorkbenchProjects } from "../workbench/native-projects";
import { visibleTreeRows } from "../../shared/project-tree/projection";
it("projects custom groups with independent repeated projects and native workspace membership", () => {
  const catalog = createCatalog();
  catalog.hosts([{ serverId: "h", label: "Host", status: "online" }]);
  catalog.restore();
  catalog.update("h", {
    projects: [
      { serverId: "h", projectId: "a", name: "A", root: "/a" },
      { serverId: "h", projectId: "b", name: "B", root: "/b" },
    ],
    workspaces: [{ serverId: "h", projectId: "a", id: "w", name: "W", cwd: "/a" }],
  });
  const original = catalog.read(),
    [a, b] = original.tree.nodes;
  const projects: WorkbenchProject[] = nativeWorkbenchProjects(original);
  const [aId, bId] = projects.map((project) => project.id);
  const preferences: WorkbenchPreferences = {
    layout: "A",
    tabs: [{ id: "fav", name: "Common", kind: "favorites", projectOrder: [bId!, aId!] }],
    favorites: [aId!, bId!],
    focusTasks: [],
  };
  preferences.tabs.push({ id: "other", name: "Other", kind: "manual", projectIds: [bId!] });
  preferences.tabs.unshift({
    id: "all",
    name: "All projects",
    kind: "manual",
    projectIds: [aId!],
  });
  original.tree.workspacePlacements = [{ serverId: "h", workspaceId: "w", nodeId: b!.id }];
  const projected = groupSidebarSnapshot(original, preferences, projects);
  const folders = projected.tree.nodes.filter((n) => n.kind === "folder");
  expect(folders.map((n) => n.name)).toEqual(["Common (2)", "Other (1)"]);
  expect(folders.every((n) => n.parentId === null)).toBe(true);
  const firstGroup = projected.tree.nodes.filter((n) => n.parentId === folders[0]!.id);
  expect(firstGroup.map((n) => projected.projectSources.get(n.id))).toEqual([bId, aId]);
  const repeated = projected.tree.nodes.filter((n) => projected.projectSources.get(n.id) === bId);
  expect(repeated).toHaveLength(2);
  expect(new Set(projected.tree.nodes.map((n) => n.id)).size).toBe(projected.tree.nodes.length);
  for (const node of repeated)
    expect(
      node.kind === "project" &&
        projectWorkspaces(projected, node.members, projected.projectSources.get(node.id)).map(
          (w) => w.id,
        ),
    ).toEqual([]);
  const movedOut = firstGroup.find((n) => projected.projectSources.get(n.id) === aId)!;
  expect(
    movedOut.kind === "project" &&
      projectWorkspaces(projected, movedOut.members, projected.projectSources.get(movedOut.id)).map(
        (w) => w.id,
      ),
  ).toEqual(["w"]);
  preferences.tabs.find((tab) => tab.id === "fav")!.workspacesOnly = true;
  const flattened = groupSidebarSnapshot(original, preferences, projects);
  const rows = visibleTreeRows(flattened.tree);
  expect(rows.filter((row) => row.node.kind === "folder").every((row) => row.showContainer)).toBe(
    true,
  );
  expect(
    rows.filter((row) => row.node.parentId === folders[0]!.id).every((row) => !row.showContainer),
  ).toBe(true);
  expect(rows.find((row) => row.node.parentId === folders[1]!.id)?.showContainer).toBe(true);
  expect(original.tree.nodes.map((n) => n.id)).toEqual([a!.id, b!.id]);
});
