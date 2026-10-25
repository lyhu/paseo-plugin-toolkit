import {
  projectDisplay,
  projectDisplayOptions,
  type ProjectDisplay,
  type Tree,
  type TreeCommand,
  type TreeNode,
  type TreeNodeAction,
} from "./model";

export function adjacentMove(
  tree: Tree,
  node: TreeNode,
  direction: "up" | "down",
): TreeCommand | null {
  const siblings = tree.nodes.filter((entry) => entry.parentId === node.parentId);
  const index = siblings.findIndex((entry) => entry.id === node.id);
  if (direction === "up")
    return index > 0
      ? { type: "move", id: node.id, parentId: node.parentId, beforeId: siblings[index - 1]!.id }
      : null;
  return index < siblings.length - 1
    ? {
        type: "move",
        id: node.id,
        parentId: node.parentId,
        ...(siblings[index + 2] ? { beforeId: siblings[index + 2]!.id } : {}),
      }
    : null;
}

export function edgeMove(tree: Tree, node: TreeNode, edge: "top" | "bottom"): TreeCommand | null {
  const siblings = tree.nodes.filter((entry) => entry.parentId === node.parentId);
  const index = siblings.findIndex((entry) => entry.id === node.id);
  if (edge === "top")
    return index > 0
      ? { type: "move", id: node.id, parentId: node.parentId, beforeId: siblings[0]!.id }
      : null;
  return index < siblings.length - 1
    ? { type: "move", id: node.id, parentId: node.parentId }
    : null;
}

export function nodeActions(
  tree: Tree,
  node: TreeNode,
): Array<{
  action: TreeNodeAction;
  label: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  mode?: ProjectDisplay;
  checked?: boolean;
}> {
  return [
    { action: "rename", label: "重命名" },
    { action: "move", label: "移动到…", separatorBefore: true },
    { action: "up", label: "上移", disabled: !adjacentMove(tree, node, "up") },
    { action: "down", label: "下移", disabled: !adjacentMove(tree, node, "down") },
    { action: "top", label: "置顶", disabled: !edgeMove(tree, node, "top") },
    { action: "bottom", label: "置底", disabled: !edgeMove(tree, node, "bottom") },
    ...(node.kind === "project"
      ? [
          {
            action: "merge" as const,
            label: "合并到…",
            disabled: !tree.nodes.some((entry) => entry.kind === "project" && entry.id !== node.id),
            separatorBefore: true,
          },
          { action: "split" as const, label: "取消合并", disabled: node.members.length < 2 },
          ...projectDisplayOptions.map(({ mode, label }, index) => ({
            action: "display" as const,
            label,
            mode,
            checked: projectDisplay(node) === mode,
            separatorBefore: index === 0,
          })),
          { action: "new" as const, label: "新建 workspace", separatorBefore: true },
        ]
      : [
          { action: "folder" as const, label: "新建分类文件夹", separatorBefore: true },
          { action: "delete" as const, label: "删除文件夹", separatorBefore: true },
        ]),
  ];
}

export function nodePath(tree: Tree, node: TreeNode): string {
  const nodes = new Map(tree.nodes.map((entry) => [entry.id, entry]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current: TreeNode | undefined = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    current = current.parentId === null ? undefined : nodes.get(current.parentId);
  }
  return names.reverse().join(" / ");
}

/** Validated trees can move to every folder except the node and its descendants. */
export function folderDestinations(tree: Tree, node: TreeNode) {
  if (!tree.nodes.some((entry) => entry.id === node.id)) return [];
  const children = new Map<string, string[]>();
  for (const entry of tree.nodes) {
    if (entry.parentId === null) continue;
    const siblings = children.get(entry.parentId) ?? [];
    siblings.push(entry.id);
    children.set(entry.parentId, siblings);
  }
  const descendants = new Set<string>();
  const pending = [node.id];
  while (pending.length) {
    const id = pending.pop()!;
    if (descendants.has(id)) continue;
    descendants.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  return tree.nodes.filter((entry) => entry.kind === "folder" && !descendants.has(entry.id));
}

export type NodeActionRequest =
  | { action: "up" | "down" | "top" | "bottom" | "hide" | "delete" }
  | { action: "rename"; name: string }
  | { action: "folder"; id: string; name: string; parentId: string | null }
  | { action: "move"; parentId: string | null }
  | { action: "merge"; targetId: string }
  | { action: "split"; member: { serverId: string; projectId: string }; id: string; name: string }
  | { action: "hideEmpty"; ids: string[] };

/** Both presentation adapters turn the same node intent into the same tree command. */
export function nodeActionCommand(
  tree: Tree,
  nodeId: string | undefined,
  request: NodeActionRequest,
): TreeCommand | null {
  if (request.action === "folder") {
    const name = request.name.trim();
    return name ? { type: "folder", id: request.id, name, parentId: request.parentId } : null;
  }
  if (request.action === "hideEmpty")
    return request.ids.length ? { type: "hideEmpty", ids: request.ids } : null;
  const node = tree.nodes.find((entry) => entry.id === nodeId);
  if (!node) return null;
  switch (request.action) {
    case "up":
    case "down":
      return adjacentMove(tree, node, request.action);
    case "top":
    case "bottom":
      return edgeMove(tree, node, request.action);
    case "hide":
      return { type: "hide", id: node.id, hidden: !node.hidden };
    case "rename":
      return request.name.trim()
        ? { type: "rename", id: node.id, name: request.name.trim() }
        : null;
    case "move":
      return { type: "move", id: node.id, parentId: request.parentId };
    case "merge":
      return { type: "merge", sourceId: node.id, targetId: request.targetId };
    case "split":
      return {
        type: "split",
        id: node.id,
        member: request.member,
        newId: request.id,
        name: request.name,
      };
    case "delete":
      return { type: "removeFolder", id: node.id };
  }
}
