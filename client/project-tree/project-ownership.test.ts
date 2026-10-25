import { expect, it } from "vitest";
import { createCatalog } from "./catalog";
import { projectOwnership, createdProjectCommand } from "./project-ownership";

function fixture() {
  const catalog = createCatalog();
  catalog.hosts([
    { serverId: "pro", label: "Pro", status: "online" },
    { serverId: "mini", label: "Mini", status: "online" },
  ]);
  catalog.restore({
    tree: {
      revision: 0,
      nodes: [
        {
          id: "target",
          kind: "project",
          name: "Target",
          parentId: null,
          members: [{ serverId: "pro", projectId: "target" }],
        },
        {
          id: "source",
          kind: "project",
          name: "Source",
          parentId: null,
          members: [{ serverId: "pro", projectId: "nested" }],
        },
        {
          id: "mini",
          kind: "project",
          name: "Mini",
          parentId: null,
          members: [{ serverId: "mini", projectId: "nested" }],
        },
      ],
    },
    catalogs: {
      pro: {
        projects: [
          { serverId: "pro", projectId: "parent", name: "Parent", root: "/app/" },
          { serverId: "pro", projectId: "nested", name: "Nested", root: "/app/nested/" },
        ],
        workspaces: [],
      },
      mini: {
        projects: [{ serverId: "mini", projectId: "nested", name: "Mini", root: "/app/nested/" }],
        workspaces: [],
      },
    },
  });
  return catalog;
}
it("uses the longest directory match on the selected Host, excluding sibling prefixes", () => {
  const snapshot = fixture().read();
  expect(projectOwnership(snapshot, "pro", " /app/nested/child/ ")).toMatchObject({
    project: { projectId: "nested" },
    group: { id: "source" },
  });
  expect(projectOwnership(snapshot, "pro", "/app/nested/").group?.id).toBe("source");
  expect(projectOwnership(snapshot, "pro", "/app/nested-other").project?.projectId).toBe("parent");
  expect(projectOwnership(snapshot, "pro", "/app2").project).toBeUndefined();
  expect(projectOwnership(snapshot, "mini", "/app/nested").group?.id).toBe("mini");
});
it("places new projects but merges existing ones only with explicit current confirmation", () => {
  const before = fixture().read();
  const member = { serverId: "pro", projectId: "nested" };
  expect(createdProjectCommand(before, before, "source", member)).toBeNull();
  expect(() => createdProjectCommand(before, before, "target", member)).toThrow();
  expect(createdProjectCommand(before, before, "target", member, "source")).toEqual({
    type: "merge",
    sourceId: "source",
    targetId: "target",
  });
  expect(
    createdProjectCommand(before, before, "target", { serverId: "pro", projectId: "new" }),
  ).toEqual({
    type: "placeNewProject",
    targetId: "target",
    member: { serverId: "pro", projectId: "new" },
  });
});
it("rechecks the actual created project's latest display group rather than trusting the preview", () => {
  const catalog = fixture();
  const before = catalog.read();
  catalog.organize({
    ...before.tree,
    nodes: before.tree.nodes.map((node) =>
      node.id === "source" ? { ...node, id: "moved" } : node,
    ),
  });
  const actual = { serverId: "pro", projectId: "nested" };
  expect(() => createdProjectCommand(before, catalog.read(), "target", actual, "source")).toThrow();
  // The same project ID on another Host does not carry the original confirmation.
  expect(() =>
    createdProjectCommand(
      before,
      catalog.read(),
      "target",
      { serverId: "mini", projectId: "nested" },
      "source",
    ),
  ).toThrow();
  expect(createdProjectCommand(before, catalog.read(), "target", actual, "moved")).toMatchObject({
    sourceId: "moved",
  });
});
