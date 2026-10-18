import type { CatalogProject } from "./catalog";
import { memberKey, type ProjectMember } from "../../shared/project-tree/model";

export interface NativeProjectGroup {
  viewKey: string;
  name: string;
  members: ProjectMember[];
}
/** Mirrors Paseo 0.12's workspace-structure view keys. Keys are opaque, including JSON-shaped keys. */
export function nativeProjectGroups(projects: CatalogProject[]): NativeProjectGroup[] {
  const counts = new Map<string, number>();
  for (const project of projects)
    if (project.key) {
      const id = JSON.stringify([project.serverId, project.key]);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  const allocated = new Set(projects.flatMap((project) => (project.key ? [project.key] : [])));
  const ambiguous = new Set<string>();
  // A native Host filter can release an opaque key and change placement allocation.
  // Such keys cannot safely identify a native row from the complete catalog.
  for (const project of projects) {
    let candidate = memberKey(project);
    for (let suffix = 0; allocated.has(candidate); suffix += 1) {
      ambiguous.add(candidate);
      candidate = JSON.stringify(["placement", project.serverId, project.projectId, suffix]);
    }
    if (candidate !== memberKey(project)) ambiguous.add(candidate);
  }
  const groups = new Map<string, NativeProjectGroup>();
  for (const project of projects) {
    let viewKey =
      project.key && counts.get(JSON.stringify([project.serverId, project.key])) === 1
        ? project.key
        : null;
    if (viewKey === null) {
      viewKey = memberKey(project);
      for (let suffix = 0; allocated.has(viewKey); suffix += 1)
        viewKey = JSON.stringify(["placement", project.serverId, project.projectId, suffix]);
      allocated.add(viewKey);
    }
    const group = groups.get(viewKey) ?? { viewKey, name: project.name, members: [] };
    group.members.push({ serverId: project.serverId, projectId: project.projectId });
    groups.set(viewKey, group);
  }
  return [...groups.values()].filter((group) => !ambiguous.has(group.viewKey));
}

export function nativeGroupsWithin(groups: NativeProjectGroup[], members: ProjectMember[]) {
  const keys = new Set(members.map(memberKey));
  return groups.filter((group) => group.members.every((member) => keys.has(memberKey(member))));
}
