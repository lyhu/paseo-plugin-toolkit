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
it("keeps legacy folder flags inert and promotes only project workspaces within their current parent", () => {
  tree.nodes[0]!.hidden = true;
  expect(
    visibleTreeRows(tree).map(({ node, depth, parentId, showContainer }) => [
      node.id,
      depth,
      parentId,
      showContainer,
    ]),
  ).toEqual([
    ["a", 0, null, true],
    ["b", 1, "a", true],
    ["p", 2, "b", false],
  ]);
  expect(visibleTreeRows(tree, { collapsed: new Set(["a"]) })).toHaveLength(1);
  expect(visibleTreeRows(tree, { collapsed: new Set(["b"]) })).toHaveLength(2);
  expect(visibleTreeRows(tree, { collapsed: new Set(["p"]) }).at(-1)?.showContainer).toBe(false);
  expect(tree.nodes[2]?.parentId).toBe("b");
});
it("reveals hidden projects and project containers in temporary management view", () => {
  const hidden = applyTreeCommand(tree, { type: "display", id: "p", mode: "hidden" });
  expect(visibleTreeRows(hidden).map((row) => row.node.id)).toEqual(["a", "b"]);
  for (const mode of ["hidden", "workspaces"] as const) {
    const changed = applyTreeCommand(tree, { type: "display", id: "p", mode });
    expect(
      visibleTreeRows(changed, { showHidden: true }).map(
        ({ node, depth, hidden, showContainer }) => [node.id, depth, hidden, showContainer],
      ),
    ).toEqual([
      ["a", 0, false, true],
      ["b", 1, false, true],
      ["p", 2, true, true],
    ]);
  }
  const root = { ...tree, nodes: [{ ...tree.nodes[2]!, parentId: null }] };
  expect(visibleTreeRows(root)[0]).toMatchObject({
    depth: 0,
    parentId: null,
    showContainer: false,
  });
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
