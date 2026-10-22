import { expect, it } from "vitest";
import { adjacentMove, edgeMove, folderDestinations, nodeActions } from "./actions";
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
    "置顶",
    "置底",
    "合并到…",
    "取消合并",
    "隐藏项目节点",
    "隐藏空 workspace 项目节点",
    "新建 workspace",
  ]);
  expect(
    nodeActions(tree, tree.nodes[1]!)
      .filter((item) => item.separatorBefore)
      .map((item) => item.label),
  ).toEqual(["移动到…", "合并到…", "隐藏项目节点", "新建 workspace"]);
  expect(
    nodeActions(tree, tree.nodes[1]!).find((item) => item.action === "hideEmpty")?.disabled,
  ).toBe(true);
  expect(
    nodeActions(tree, tree.nodes[1]!, 2).find((item) => item.action === "hideEmpty")?.disabled,
  ).toBe(false);
  expect(nodeActions(tree, tree.nodes[0]!).map((item) => item.label)).toEqual([
    "重命名",
    "移动到…",
    "上移",
    "下移",
    "置顶",
    "置底",
    "新建分类文件夹",
    "删除文件夹",
  ]);
  expect(edgeMove(tree, tree.nodes[0]!, "top")).toBeNull();
  expect(edgeMove(tree, tree.nodes[1]!, "bottom")).toBeNull();
  expect(nodeActions(tree, tree.nodes[0]!).find((item) => item.action === "bottom")?.disabled).toBe(
    false,
  );
  expect(nodeActions(tree, tree.nodes[1]!).find((item) => item.action === "top")?.disabled).toBe(
    false,
  );
  const topped = applyTreeCommand(tree, edgeMove(tree, tree.nodes[1]!, "top")!);
  expect(topped.nodes.map((node) => node.id)).toEqual(["project", "folder"]);
  const bottomed = applyTreeCommand(tree, edgeMove(tree, tree.nodes[0]!, "bottom")!);
  expect(bottomed.nodes.map((node) => node.id)).toEqual(["project", "folder"]);
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
