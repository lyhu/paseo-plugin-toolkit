import type { CatalogSnapshot } from "./catalog";
import type { WorkbenchPreferences, WorkbenchProject } from "../workbench/types";
import type { TreeNode } from "../../shared/project-tree/model";
import { projectsInGroup } from "../workbench/groups";

/** Every search group is a root folder. Repeated projects have independent view IDs. */
export function groupSidebarSnapshot(
  snapshot: CatalogSnapshot,
  preferences: WorkbenchPreferences,
  projects: WorkbenchProject[],
): CatalogSnapshot & {
  projectSources: ReadonlyMap<string, string>;
  groupIds: ReadonlyMap<string, string>;
} {
  const projectSources = new Map<string, string>(),
    groupIds = new Map<string, string>(),
    nodes: TreeNode[] = [];
  for (const group of preferences.tabs) {
    if (group.id === "all") continue;
    const members = projectsInGroup(projects, preferences, group);
    const parentId = JSON.stringify(["workbench-group", group.id]);
    groupIds.set(parentId, group.id);
    nodes.push({
      kind: "folder",
      id: parentId,
      name: `${group.name} (${members.length})`,
      parentId: null,
    });
    for (const project of members) {
      const id = JSON.stringify(["workbench-group-project", group.id, project.id]);
      projectSources.set(id, project.id);
      nodes.push({
        kind: "project",
        name: project.name,
        members: project.instances.map((instance) => ({
          serverId: instance.serverId,
          projectId: instance.projectId,
        })),
        id,
        parentId,
        hidden: false,
        flattened: group.workspacesOnly ?? false,
      });
    }
  }
  return {
    ...snapshot,
    tree: { ...snapshot.tree, nodes, workspacePlacements: [] },
    projectSources,
    groupIds,
  };
}
