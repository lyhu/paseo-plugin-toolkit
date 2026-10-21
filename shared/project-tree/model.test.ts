import { expect, it } from "vitest";
import { applyTreeCommand, emptyTree, treeSchema } from "./model";

it("moves one workspace's display position across Hosts, preserves identities and carries placements through a merge", () => {
  let tree = applyTreeCommand(emptyTree(), {
    type: "discover",
    projects: [
      { serverId: "pro", projectId: "p", name: "Pro" },
      { serverId: "mini", projectId: "m", name: "Mini" },
    ],
  });
  const [pro, mini] = tree.nodes;
  tree = applyTreeCommand(tree, {
    type: "moveWorkspace",
    serverId: "pro",
    workspaceId: "w",
    targetId: mini!.id,
  });
  expect(tree.workspacePlacements).toEqual([
    { serverId: "pro", workspaceId: "w", nodeId: mini!.id },
  ]);
  expect(tree.nodes[0]).toEqual(pro);
  expect(() =>
    applyTreeCommand(tree, {
      type: "moveWorkspace",
      serverId: "pro",
      workspaceId: "w",
      targetId: "missing",
    }),
  ).toThrow();
  tree = applyTreeCommand(tree, { type: "merge", sourceId: mini!.id, targetId: pro!.id });
  expect(tree.workspacePlacements![0]!.nodeId).toBe(pro!.id);
  expect(treeSchema.parse({ revision: 0, nodes: [] }).workspacePlacements).toBeUndefined();
});

it("merges host-local projects without changing their identities, and splits them back", () => {
  let tree = applyTreeCommand(emptyTree(), {
    type: "discover",
    projects: [
      { serverId: "pro", projectId: "a", name: "运维车间", key: "host:pro:root" },
      { serverId: "mini", projectId: "b", name: "运维车间", key: "host:mini:root" },
    ],
  });
  const [pro, mini] = tree.nodes;
  tree = applyTreeCommand(tree, { type: "merge", sourceId: mini!.id, targetId: pro!.id });
  expect(tree.nodes).toHaveLength(1);
  expect(tree.nodes[0]).toMatchObject({
    name: "运维车间",
    members: [
      { serverId: "pro", projectId: "a" },
      { serverId: "mini", projectId: "b" },
    ],
  });
  tree = applyTreeCommand(tree, {
    type: "split",
    id: pro!.id,
    member: { serverId: "mini", projectId: "b" },
    newId: "split-mini",
    name: "运维车间Mini",
  });
  expect(tree.nodes).toHaveLength(2);
  expect(tree.nodes[1]).toMatchObject({
    id: "split-mini",
    members: [{ serverId: "mini", projectId: "b" }],
  });
});

it("places new folders first among their siblings and keeps existing order", () => {
  let tree = applyTreeCommand(
    { revision: 0, nodes: [] },
    {
      type: "folder",
      id: "root",
      name: "Root",
      parentId: null,
    },
  );
  tree = applyTreeCommand(tree, { type: "folder", id: "child", name: "Child", parentId: "root" });
  const previous = tree;
  tree = applyTreeCommand(tree, {
    type: "folder",
    id: "new-root",
    name: "New root",
    parentId: null,
  });
  tree = applyTreeCommand(tree, {
    type: "folder",
    id: "new-child",
    name: "New child",
    parentId: "root",
  });
  expect(tree.nodes.filter((node) => node.parentId === null).map((node) => node.id)).toEqual([
    "new-root",
    "root",
  ]);
  expect(tree.nodes.filter((node) => node.parentId === "root").map((node) => node.id)).toEqual([
    "new-child",
    "child",
  ]);
  expect(previous.nodes).toHaveLength(2);
});

it("limits folder depth after a subtree move and prevents cycles without mutating the previous tree", () => {
  let tree = emptyTree();
  for (const [id, parentId] of [
    ["a", null],
    ["b", "a"],
    ["c", "b"],
    ["d", null],
    ["e", "d"],
  ] as const)
    tree = applyTreeCommand(tree, { type: "folder", id, name: id, parentId });
  expect(() => applyTreeCommand(tree, { type: "move", id: "d", parentId: "b" })).toThrow(
    "最多三层",
  );
  expect(() => applyTreeCommand(tree, { type: "move", id: "a", parentId: "c" })).toThrow(
    "自身或子文件夹",
  );
  expect(tree.nodes.find((node) => node.id === "d")?.parentId).toBeNull();
  const promoted = applyTreeCommand(tree, { type: "removeFolder", id: "b" });
  expect(promoted.nodes.find((node) => node.id === "c")?.parentId).toBe("a");
});

it("keeps same-name projects separate, while grouping unambiguous shared project keys", () => {
  const tree = applyTreeCommand(emptyTree(), {
    type: "discover",
    projects: [
      { serverId: "pro", projectId: "a", name: "same", key: "shared" },
      { serverId: "mini", projectId: "b", name: "same", key: "shared" },
      { serverId: "pro", projectId: "c", name: "same", key: "other" },
    ],
  });
  expect(tree.nodes).toHaveLength(2);
  expect(tree.nodes[0]).toMatchObject({
    members: [
      { serverId: "pro", projectId: "a" },
      { serverId: "mini", projectId: "b" },
    ],
  });
});

it("places a newly registered host project without pulling its remote-equivalent group into the target", () => {
  let tree = applyTreeCommand(emptyTree(), {
    type: "discover",
    projects: [
      { serverId: "pro", projectId: "a", name: "A", key: "a" },
      { serverId: "other", projectId: "b", name: "B", key: "remote:b" },
      { serverId: "mini", projectId: "new", name: "B", key: "remote:b" },
    ],
  });
  const targetId = tree.nodes[0]!.id;
  tree = applyTreeCommand(tree, {
    type: "placeNewProject",
    targetId,
    member: { serverId: "mini", projectId: "new" },
  });
  expect(tree.nodes).toHaveLength(2);
  expect(tree.nodes[0]).toMatchObject({
    name: "A",
    members: [
      { serverId: "pro", projectId: "a" },
      { serverId: "mini", projectId: "new" },
    ],
  });
  expect(tree.nodes[1]).toMatchObject({
    name: "B",
    members: [{ serverId: "other", projectId: "b" }],
  });
});
