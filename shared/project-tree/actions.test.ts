import { expect, it } from "vitest";
import {
  nodeActionCommand,
  adjacentMove,
  edgeMove,
  folderDestinations,
  nodeActions,
} from "./actions";
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
    "正常显示",
    "仅显示 Workspace",
    "隐藏整个 Project",
    "新建 workspace",
  ]);
  expect(
    nodeActions(tree, tree.nodes[1]!)
      .filter((item) => item.separatorBefore)
      .map((item) => item.label),
  ).toEqual(["移动到…", "合并到…", "正常显示", "新建 workspace"]);
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

it("excludes descendants but allows arbitrarily deep destinations", () => {
  const tree: Tree = {
    revision: 0,
    nodes: [
      { kind: "folder", id: "a", name: "A", parentId: null },
      { kind: "folder", id: "b", name: "B", parentId: "a" },
      { kind: "folder", id: "c", name: "C", parentId: "b" },
      { kind: "folder", id: "d", name: "D", parentId: null },
    ],
  };
  expect(folderDestinations(tree, tree.nodes[0]!).map((node) => node.id)).toEqual(["d"]);
  expect(folderDestinations(tree, tree.nodes[3]!).map((node) => node.id)).toEqual(["a", "b", "c"]);
});

it("matches move validation for folder and project destinations in a mixed tree", () => {
  const tree: Tree = {
    revision: 0,
    nodes: [
      ...Array.from({ length: 30 }, (_, i) => ({
        kind: "folder" as const,
        id: `f${i}`,
        name: `Folder ${i}`,
        parentId: i < 3 ? null : `f${Math.floor(i / 3) - 1}`,
        hidden: i % 3 === 0,
        flattened: i % 2 === 0,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        kind: "project" as const,
        id: `p${i}`,
        name: `Project ${i}`,
        parentId: `f${i + 10}`,
        members: [{ serverId: "host", projectId: `p${i}` }],
      })),
    ],
  };
  for (const node of tree.nodes) {
    const expected = tree.nodes.filter((candidate) => {
      if (candidate.kind !== "folder") return false;
      try {
        applyTreeCommand(tree, { type: "move", id: node.id, parentId: candidate.id });
        return true;
      } catch {
        return false;
      }
    });
    expect(folderDestinations(tree, node)).toEqual(expected);
  }
});
it("finds destinations for a ten thousand level branch without recursive traversal", () => {
  const tree: Tree = {
    revision: 0,
    nodes: Array.from({ length: 10000 }, (_, i) => ({
      kind: "folder",
      id: String(i),
      name: String(i),
      parentId: i ? String(i - 1) : null,
    })),
  };
  expect(folderDestinations(tree, tree.nodes[0]!)).toEqual([]);
  const destinations = folderDestinations(tree, tree.nodes[5000]!);
  expect(destinations).toHaveLength(5000);
  expect(destinations.at(-1)?.id).toBe("4999");
});

it("resolves node intents consistently before either adapter submits them", () => {
  const tree: Tree = {
    revision: 3,
    nodes: [
      { id: "f", kind: "folder", name: "F", parentId: null },
      {
        id: "a",
        kind: "project",
        name: "A",
        parentId: null,
        members: [
          { serverId: "pro", projectId: "p" },
          { serverId: "mini", projectId: "m" },
        ],
      },
      {
        id: "b",
        kind: "project",
        name: "B",
        parentId: null,
        members: [{ serverId: "pro", projectId: "b" }],
      },
    ],
  };
  const resolve = (request: Parameters<typeof nodeActionCommand>[2]) =>
    nodeActionCommand(tree, "a", request);
  expect(resolve({ action: "rename", name: "  Renamed  " })).toEqual({
    type: "rename",
    id: "a",
    name: "Renamed",
  });
  expect(resolve({ action: "rename", name: " " })).toBeNull();
  expect(resolve({ action: "hide" })).toEqual({ type: "hide", id: "a", hidden: true });
  expect(resolve({ action: "hideEmpty", ids: ["b"] })).toEqual({ type: "hideEmpty", ids: ["b"] });
  expect(resolve({ action: "hideEmpty", ids: [] })).toBeNull();
  expect(resolve({ action: "move", parentId: "f" })).toEqual({
    type: "move",
    id: "a",
    parentId: "f",
  });
  expect(resolve({ action: "merge", targetId: "b" })).toEqual({
    type: "merge",
    sourceId: "a",
    targetId: "b",
  });
  expect(
    resolve({
      action: "split",
      member: { serverId: "mini", projectId: "m" },
      id: "split",
      name: "M",
    }),
  ).toEqual({
    type: "split",
    id: "a",
    member: { serverId: "mini", projectId: "m" },
    newId: "split",
    name: "M",
  });
  expect(nodeActionCommand(tree, "f", { action: "delete" })).toEqual({
    type: "removeFolder",
    id: "f",
  });
  expect(
    nodeActionCommand(tree, undefined, {
      action: "folder",
      id: "new",
      name: " New ",
      parentId: null,
    }),
  ).toEqual({ type: "folder", id: "new", name: "New", parentId: null });
  expect(applyTreeCommand(tree, resolve({ action: "top" })!).nodes[0]!.id).toBe("a");
  expect(applyTreeCommand(tree, resolve({ action: "bottom" })!).nodes.at(-1)!.id).toBe("a");
});
