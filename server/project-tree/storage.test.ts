import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createProjectTreeStore } from "./storage";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it("persists organization and rejects a stale client without losing newer changes", () => {
  const home = mkdtempSync(join(tmpdir(), "toolkit-tree-"));
  roots.push(home);
  const store = createProjectTreeStore(home);
  const first = store.change(0, { type: "folder", id: "work", name: "工作", parentId: null });
  expect(createProjectTreeStore(home).read()).toEqual(first);
  expect(() => store.change(0, { type: "rename", id: "work", name: "旧客户端" })).toThrow(
    "其他设备",
  );
  expect(store.read().nodes[0]?.name).toBe("工作");
  const discovered = store.change(first.revision, {
    type: "discover",
    projects: [{ serverId: "pro", projectId: "p", name: "Project" }],
  });
  const project = discovered.nodes.find((node) => node.kind === "project")!;
  store.change(discovered.revision, {
    type: "moveWorkspace",
    serverId: "mini",
    workspaceId: "w",
    targetId: project.id,
  });
  expect(createProjectTreeStore(home).read().workspacePlacements).toEqual([
    { serverId: "mini", workspaceId: "w", nodeId: project.id },
  ]);
});
