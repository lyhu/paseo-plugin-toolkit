import { memberKey, treeSchema, validateTree, type Tree } from "./model";

/** Restore organization without dropping physical resources discovered after the snapshot. */
export function restoreTree(current: Tree, saved: Tree): Tree {
  const restored = treeSchema.parse(saved);
  const members = new Set(
    restored.nodes.flatMap((node) => (node.kind === "project" ? node.members.map(memberKey) : [])),
  );
  for (const node of current.nodes) {
    if (node.kind !== "project") continue;
    const added = node.members.filter((member) => !members.has(memberKey(member)));
    if (!added.length) continue;
    const existing = restored.nodes.find(
      (entry) => entry.id === node.id && entry.kind === "project",
    );
    if (existing?.kind === "project") existing.members.push(...added);
    else {
      let id = node.id;
      while (restored.nodes.some((entry) => entry.id === id)) id = `restored:${id}`;
      restored.nodes.push({
        ...node,
        id,
        parentId: null,
        members: added,
        hidden: false,
        flattened: false,
      });
    }
    for (const member of added) members.add(memberKey(member));
  }
  const placements = new Set(
    (restored.workspacePlacements ?? []).map((item) =>
      JSON.stringify([item.serverId, item.workspaceId]),
    ),
  );
  for (const placement of current.workspacePlacements ?? []) {
    const key = JSON.stringify([placement.serverId, placement.workspaceId]);
    if (placements.has(key)) continue;
    let nodeId = placement.nodeId;
    if (!restored.nodes.some((node) => node.id === nodeId && node.kind === "project")) {
      const former = current.nodes.find((node) => node.id === nodeId);
      if (former?.kind !== "project") continue;
      nodeId =
        restored.nodes.find(
          (node) =>
            node.kind === "project" &&
            node.members.some((member) =>
              former.members.some((old) => memberKey(old) === memberKey(member)),
            ),
        )?.id ?? "";
    }
    if (nodeId) (restored.workspacePlacements ??= []).push({ ...placement, nodeId });
  }
  return validateTree({ ...restored, schemaVersion: 2, revision: current.revision });
}
