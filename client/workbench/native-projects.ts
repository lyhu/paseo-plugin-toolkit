import type { CatalogSnapshot, CatalogWorkspace } from "../project-tree/catalog";
import type { WorkbenchProject } from "./types";
import type { WorkbenchState } from "../../shared/workbench/state";
import { nativeProjectGroups } from "../project-tree/native-groups";

export function nativeWorkbenchProjects(
  catalog: CatalogSnapshot,
  ai: { serverId?: string; projectId?: string } = {},
): WorkbenchProject[] {
  const groups = nativeProjectGroups(Object.values(catalog.catalogs).flatMap((c) => c.projects));
  return Object.values(catalog.catalogs).flatMap((c) => {
    const workspaces = new Map<string, CatalogWorkspace[]>();
    for (const workspace of c.workspaces) {
      const entries = workspaces.get(workspace.projectId) ?? [];
      entries.push(workspace);
      workspaces.set(workspace.projectId, entries);
    }
    return c.projects.map((p) => {
      const entries = workspaces.get(p.projectId) ?? [];
      const latest = entries.reduce(
        (time, workspace) => Math.max(time, Date.parse(workspace.lastActivityAt ?? "") || 0),
        0,
      );
      return {
        id: JSON.stringify([p.serverId, p.projectId]),
        name: p.name,
        lastActivityAt: latest ? new Date(latest).toISOString() : undefined,
        nativeGroup: groups.find((group) =>
          group.members.some(
            (member) => member.serverId === p.serverId && member.projectId === p.projectId,
          ),
        ),
        workspaceCount: entries.length,
        workspaceRefs: entries.map((w) => ({ serverId: w.serverId, id: w.id })),
        system: p.serverId === ai.serverId && p.projectId === ai.projectId,
        instances: [
          {
            serverId: p.serverId,
            projectId: p.projectId,
            path: p.root,
            branch: entries[0]?.currentBranch ?? undefined,
          },
        ],
      };
    });
  });
}

/** Expand legacy merged display references into native projects, including workspaces moved into them.
 * Unresolved legacy IDs stay alongside known IDs until their Host catalog is available. */
export function nativeProjectPreferences(
  catalog: CatalogSnapshot,
  preferences: WorkbenchState["preferences"],
): WorkbenchState["preferences"] {
  const workspaceProjects = new Map(
    Object.values(catalog.catalogs).flatMap((c) =>
      c.workspaces.map(
        (w) =>
          [JSON.stringify([w.serverId, w.id]), JSON.stringify([w.serverId, w.projectId])] as const,
      ),
    ),
  );
  const placements = new Map<string, Array<{ serverId: string; workspaceId: string }>>();
  for (const placement of catalog.tree.workspacePlacements ?? []) {
    const entries = placements.get(placement.nodeId) ?? [];
    entries.push(placement);
    placements.set(placement.nodeId, entries);
  }
  const aliases = new Map<string, string[]>();
  for (const node of catalog.tree.nodes) {
    if (node.kind !== "project") continue;
    const ids = node.members.map((m) => JSON.stringify([m.serverId, m.projectId]));
    let unresolved = false;
    for (const placement of placements.get(node.id) ?? []) {
      const id = workspaceProjects.get(JSON.stringify([placement.serverId, placement.workspaceId]));
      if (id) ids.push(id);
      else unresolved = true;
    }
    aliases.set(node.id, [...new Set([...ids, ...(unresolved ? [node.id] : [])])]);
  }
  const expand = (ids: string[]) => [...new Set(ids.flatMap((id) => aliases.get(id) ?? [id]))];
  return {
    ...preferences,
    favorites: expand(preferences.favorites),
    tabs: preferences.tabs.map((tab) => ({
      ...tab,
      ...(tab.projectIds ? { projectIds: expand(tab.projectIds) } : {}),
      ...(tab.projectOrder ? { projectOrder: expand(tab.projectOrder) } : {}),
    })),
    ...(preferences.scenarioProjects
      ? {
          scenarioProjects: Object.fromEntries(
            Object.entries(preferences.scenarioProjects).map(([key, ids]) => [key, expand(ids)]),
          ),
        }
      : {}),
  };
}
