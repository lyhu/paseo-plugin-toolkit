import { memberKey, type ProjectMember, type TreeCommand } from "../../shared/project-tree/model";
import type { CatalogSnapshot } from "./catalog";
import { tr } from "../i18n";

function displayGroup(snapshot: CatalogSnapshot, member: ProjectMember) {
  return snapshot.tree.nodes.find(
    (node) =>
      node.kind === "project" &&
      node.members.some((entry) => memberKey(entry) === memberKey(member)),
  );
}

/** Preview and execution share Host-scoped, longest-directory matching and display ownership. */
export function projectOwnership(snapshot: CatalogSnapshot, serverId: string, directory: string) {
  const path = directory.trim().replace(/\/+$/, "");
  const project = snapshot.catalogs[serverId]?.projects
    .filter((entry) => {
      const root = entry.root.replace(/\/+$/, "");
      return path === root || path.startsWith(`${root}/`);
    })
    .sort((a, b) => b.root.replace(/\/+$/, "").length - a.root.replace(/\/+$/, "").length)[0];
  return { project, group: project ? displayGroup(snapshot, project) : undefined };
}

/** Re-evaluate the actual project after creation; a preview never authorizes another merge. */
export function createdProjectCommand(
  before: CatalogSnapshot,
  after: CatalogSnapshot,
  targetId: string,
  member: ProjectMember,
  confirmedMergeId?: string,
): TreeCommand | null {
  const known = new Set([
    ...Object.values(before.catalogs)
      .flatMap((entry) => entry.projects)
      .map(memberKey),
    ...before.tree.nodes.flatMap((node) =>
      node.kind === "project" ? node.members.map(memberKey) : [],
    ),
  ]);
  if (!known.has(memberKey(member))) return { type: "placeNewProject", targetId, member };
  const group = displayGroup(after, member);
  if (!group || group.id === targetId) return null;
  if (group.id !== confirmedMergeId)
    throw new Error(tr("工作区已创建，但实际项目归属发生变化；请通过项目节点的菜单确认合并。"));
  return { type: "merge", sourceId: group.id, targetId };
}
