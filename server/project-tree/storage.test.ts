import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "toolkit-tree-"));
  roots.push(home);
  return {
    home,
    store: createProjectTreeStore(home),
    filename: join(home, "toolkit", "project-tree.json"),
  };
}
it("migrates a valid v1 document once with an untouched backup and rejects corrupt input", () => {
  const { home, store, filename } = fixture();
  mkdirSync(join(home, "toolkit"));
  const legacy = { revision: 7, nodes: [{ kind: "folder", id: "a", name: "A", parentId: null }] };
  writeFileSync(filename, JSON.stringify(legacy));
  expect(store.read()).toMatchObject({ schemaVersion: 2, revision: 7 });
  const backup = join(home, "toolkit", "project-tree.v1.backup.json");
  expect(JSON.parse(readFileSync(backup, "utf8"))).toEqual(legacy);
  store.change(7, { type: "rename", id: "a", name: "B" });
  expect(JSON.parse(readFileSync(backup, "utf8"))).toEqual(legacy);
  writeFileSync(filename, "invalid");
  expect(() => store.read()).toThrow();
  expect(readFileSync(filename, "utf8")).toBe("invalid");
  const other = fixture();
  mkdirSync(join(other.home, "toolkit"));
  writeFileSync(
    other.filename,
    JSON.stringify({ ...legacy, nodes: [{ ...legacy.nodes[0], parentId: "missing" }] }),
  );
  expect(() => other.store.read()).toThrow();
  expect(existsSync(join(other.home, "toolkit", "project-tree.v1.backup.json"))).toBe(false);
});
it("persists undo, rejects stale undo, and precisely reverts workspace placement", () => {
  const { home, store } = fixture();
  let tree = store.change(0, {
    type: "discover",
    projects: [{ serverId: "s", projectId: "p", name: "P" }],
  });
  const id = tree.nodes[0]!.id;
  tree = store.change(tree.revision, { type: "rename", id, name: "Renamed" });
  tree = store.change(tree.revision, {
    type: "moveWorkspace",
    serverId: "s",
    workspaceId: "w",
    targetId: id,
  });
  const restarted = createProjectTreeStore(home);
  expect(restarted.history().canUndo).toBe(true);
  expect(() => restarted.undo(tree.revision - 1)).toThrow("其他设备");
  tree = restarted.undo(tree.revision);
  expect(tree.workspacePlacements ?? []).toEqual([]);
  expect(tree.nodes[0]?.name).toBe("Renamed");
  tree = restarted.undo(tree.revision);
  expect(tree.nodes[0]?.name).toBe("P");
  expect(restarted.history().canUndo).toBe(false);
  expect(() => restarted.undo(tree.revision)).toThrow("没有可安全撤销");
});
it("restores named snapshots with new resource identities, recovery snapshot and undo", () => {
  const { home, store } = fixture();
  let tree = store.change(0, {
    type: "discover",
    projects: [{ serverId: "s", projectId: "p", name: "P" }],
  });
  const id = tree.nodes[0]!.id;
  tree = store.saveSnapshot(tree.revision, "Initial");
  const snapshotId = store.history().snapshots[0]!.id;
  tree = store.change(tree.revision, { type: "hide", id, hidden: true });
  tree = store.change(tree.revision, {
    type: "discover",
    projects: [{ serverId: "other", projectId: "new", name: "New" }],
  });
  expect(store.history().canUndo).toBe(false);
  const before = tree;
  const restarted = createProjectTreeStore(home);
  expect(() => restarted.restoreSnapshot(tree.revision - 1, snapshotId)).toThrow("其他设备");
  tree = restarted.restoreSnapshot(tree.revision, snapshotId);
  expect(tree.nodes.find((node) => node.id === id)?.hidden).toBeUndefined();
  expect(
    tree.nodes.filter((node) => node.kind === "project").flatMap((node) => node.members),
  ).toEqual([
    { serverId: "s", projectId: "p" },
    { serverId: "other", projectId: "new" },
  ]);
  expect(restarted.history().snapshots.map((s) => s.name)).toEqual(["Initial", "恢复前的展示配置"]);
  const undone = restarted.undo(tree.revision);
  expect(undone.nodes).toEqual(before.nodes);
});
