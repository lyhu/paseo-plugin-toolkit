import { expect, it } from "vitest";
import { applyTreeCommand, type Tree } from "./model";
import { visibleTreeRows } from "./projection";

const tree: Tree = {
  revision: 0,
  nodes: [
    { kind: "folder", id: "a", name: "A", parentId: null, flattened: true },
    { kind: "folder", id: "b", name: "B", parentId: "a" },
    {
      kind: "project",
      id: "p",
      name: "P",
      parentId: "b",
      flattened: true,
      members: [{ serverId: "s", projectId: "p" }],
    },
  ],
};
it("projects flattened branches without changing ownership or order", () => {
  expect(
    visibleTreeRows(tree).map(({ node, depth, parentId, showContainer }) => [
      node.id,
      depth,
      parentId,
      showContainer,
    ]),
  ).toEqual([
    ["b", 0, null, true],
    ["p", 1, "b", false],
  ]);
  expect(visibleTreeRows(tree, { collapsed: new Set(["a"]) })).toHaveLength(2);
  expect(visibleTreeRows(tree, { collapsed: new Set(["b"]) })).toHaveLength(1);
  expect(tree.nodes[1]?.parentId).toBe("a");
});
it("hides a complete branch and reveals it in management with inherited hidden state", () => {
  const hidden = applyTreeCommand(tree, { type: "hide", id: "a", hidden: true });
  expect(visibleTreeRows(hidden)).toEqual([]);
  expect(
    visibleTreeRows(hidden, { showHidden: true }).map(({ node, depth, hidden, showContainer }) => [
      node.id,
      depth,
      hidden,
      showContainer,
    ]),
  ).toEqual([
    ["a", 0, true, true],
    ["b", 1, true, true],
    ["p", 2, true, true],
  ]);
  const restored = applyTreeCommand(hidden, { type: "hide", id: "a", hidden: false });
  expect(visibleTreeRows(restored)).toEqual(visibleTreeRows(tree));
  expect(
    applyTreeCommand(tree, { type: "flatten", id: "a", flattened: false }).nodes[0]?.flattened,
  ).toBeUndefined();
});
it("projects deep trees without a call stack limit", () => {
  const nodes = Array.from({ length: 10000 }, (_, i) => ({
    kind: "folder" as const,
    id: String(i),
    name: String(i),
    parentId: i ? String(i - 1) : null,
  }));
  const rows = visibleTreeRows({ revision: 0, nodes });
  expect(rows.at(-1)?.depth).toBe(9999);
});
