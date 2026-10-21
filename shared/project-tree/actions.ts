import {
  applyTreeCommand,
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

export function nodeActions(
  tree: Tree,
  node: TreeNode,
): Array<{ action: TreeNodeAction; label: string; disabled?: boolean }> {
  return [
    { action: "rename", label: "重命名" },
    { action: "move", label: "移动到…" },
    { action: "up", label: "上移", disabled: !adjacentMove(tree, node, "up") },
    { action: "down", label: "下移", disabled: !adjacentMove(tree, node, "down") },
    ...(node.kind === "project"
      ? [
          {
            action: "merge" as const,
            label: "合并到…",
            disabled: !tree.nodes.some((entry) => entry.kind === "project" && entry.id !== node.id),
          },
          { action: "split" as const, label: "取消合并", disabled: node.members.length < 2 },
          { action: "new" as const, label: "新建 workspace" },
        ]
      : [
          { action: "folder" as const, label: "新建分类文件夹" },
          { action: "delete" as const, label: "删除文件夹" },
        ]),
  ];
}

export function nodePath(tree: Tree, node: TreeNode): string {
  const parent = tree.nodes.find((entry) => entry.id === node.parentId);
  return parent ? `${nodePath(tree, parent)} / ${node.name}` : node.name;
}

export function folderDestinations(tree: Tree, node: TreeNode) {
  return tree.nodes.filter((entry) => {
    if (entry.kind !== "folder") return false;
    try {
      applyTreeCommand(tree, { type: "move", id: node.id, parentId: entry.id });
      return true;
    } catch {
      return false;
    }
  });
}
