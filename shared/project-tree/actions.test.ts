import { expect, it } from "vitest";
import { adjacentMove, folderDestinations, nodeActions } from "./actions";
import { applyTreeCommand, type Tree } from "./model";

it("orders mixed siblings and disables moves beyond the first and last rows", () => {
  const tree: Tree = {
    revision: 0,
    nodes: [
      { kind: "folder", id: "folder", name: "Folder", parentId: null },
      {
        kind: "project",
        id: "project",
        name: "Project",
        parentId: null,
        members: [{ serverId: "pro", projectId: "p" }],
      },
    ],
  };
  expect(adjacentMove(tree, tree.nodes[0]!, "up")).toBeNull();
  expect(adjacentMove(tree, tree.nodes[1]!, "down")).toBeNull();
  const moved = applyTreeCommand(tree, adjacentMove(tree, tree.nodes[1]!, "up")!);
  expect(moved.nodes.map((node) => node.id)).toEqual(["project", "folder"]);
  expect(nodeActions(tree, tree.nodes[1]!).map((item) => item.label)).toEqual([
    "重命名",
    "移动到…",
    "上移",
    "下移",
    "合并到…",
    "取消合并",
    "新建 workspace",
  ]);
  expect(nodeActions(tree, tree.nodes[1]!).find((item) => item.action === "split")?.disabled).toBe(
    true,
  );
});

it("does not offer a folder's descendants or destinations that exceed the three-level limit", () => {
  const tree: Tree = {
    revision: 0,
    nodes: [
      { kind: "folder", id: "a", name: "A", parentId: null },
      { kind: "folder", id: "b", name: "B", parentId: "a" },
      { kind: "folder", id: "c", name: "C", parentId: "b" },
      { kind: "folder", id: "d", name: "D", parentId: null },
    ],
  };
  expect(folderDestinations(tree, tree.nodes[0]!).map((node) => node.id)).toEqual([]);
  expect(folderDestinations(tree, tree.nodes[3]!).map((node) => node.id)).toEqual(["a", "b"]);
});
