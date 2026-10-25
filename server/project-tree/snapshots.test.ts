import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createProjectTreeStore } from "./storage";
import { createWorkbenchStateStore } from "../workbench/state";
const failures = vi.hoisted(() => ({ treeWrite: false }));
vi.mock("../storage/revisioned-json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/revisioned-json")>();
  return {
    ...actual,
    createRevisionedJsonStore: (...args: Parameters<typeof actual.createRevisionedJsonStore>) => {
      const [options] = args,
        store = actual.createRevisionedJsonStore(options);
      if (!options.filename.endsWith("project-tree.json")) return store;
      return {
        ...store,
        update: (revision: number, mutate: (value: { revision: number }) => { revision: number }) =>
          store.update(revision, (current) => {
            const next = mutate(current);
            if (failures.treeWrite) throw new Error("simulated tree commit failure");
            return next;
          }),
      };
    },
  };
});
const homes: string[] = [];
afterEach(() => {
  failures.treeWrite = false;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "workbench-snapshot-"));
  homes.push(home);
  const workbench = createWorkbenchStateStore(home);
  workbench.update(0, (state) => ({
    ...state,
    preferences: {
      tabs: [{ id: "saved", name: "Saved", kind: "manual", projectIds: ["p"] }],
      favorites: ["p"],
      scenarioProjects: { research: ["p"] },
      focusTasks: [{ id: "task", title: "Before", done: false }],
    },
    memories: [
      {
        id: "memory",
        title: "Secret",
        body: "MEMORY MUST NEVER BE SNAPSHOTTED",
        scope: "personal",
        confirmed: true,
        enabled: true,
        updatedAt: "today",
      },
    ],
  }));
  const tree = createProjectTreeStore(home, workbench);
  tree.change(0, { type: "folder", id: "folder", name: "Saved folder", parentId: null });
  tree.saveSnapshot(1, "Saved bundle");
  const id = tree.history().snapshots[0]!.id;
  workbench.update(1, (state) => ({
    ...state,
    preferences: {
      tabs: [{ id: "new", name: "New", kind: "favorites" }],
      favorites: ["new"],
      scenarioProjects: { coding: ["new"] },
      focusTasks: [{ id: "task", title: "Latest", done: true }],
    },
    memories: [{ ...state.memories[0]!, body: "LATEST PRIVATE MEMORY" }],
  }));
  tree.change(2, { type: "rename", id: "folder", name: "Latest folder" });
  return { home, workbench, tree, id };
}
it("captures scoped preferences, previews changes and restores without touching focus or memories", () => {
  const { home, workbench, tree, id } = fixture();
  expect(tree.history()).toMatchObject({
    workbenchRevision: 2,
    snapshots: [
      {
        preview: {
          nodesChanged: 1,
          tabsChanged: true,
          favoritesChanged: true,
          scenariosChanged: true,
        },
      },
    ],
  });
  const after = tree.restoreSnapshot(3, id, 2),
    state = workbench.read();
  expect(after.nodes[0]?.name).toBe("Saved folder");
  expect(state.preferences).toEqual({
    tabs: [{ id: "saved", name: "Saved", kind: "manual", projectIds: ["p"] }],
    favorites: ["p"],
    scenarioProjects: { research: ["p"] },
    focusTasks: [{ id: "task", title: "Latest", done: true }],
  });
  expect(state.memories[0]?.body).toBe("LATEST PRIVATE MEMORY");
  for (const filename of [
    join(home, "toolkit", "project-tree.json"),
    join(home, "toolkit", "project-tree.before-restore.json"),
    join(home, "toolkit", "workbench", "display-preferences.before-restore.json"),
  ]) {
    const text = readFileSync(filename, "utf8");
    expect(text).not.toContain("PRIVATE MEMORY");
    expect(text).not.toContain("MEMORY MUST");
    expect(text).not.toContain('"focusTasks"');
  }
  expect(tree.history().canUndo).toBe(true);
  tree.undo(after.revision, state.revision);
  expect(workbench.read().preferences.favorites).toEqual(["new"]);
  expect(workbench.read().preferences.focusTasks[0]?.title).toBe("Latest");
  expect(tree.read().nodes[0]?.name).toBe("Latest folder");
});
it("rejects stale or absent preference revisions before changing either document", () => {
  const { tree, workbench, id } = fixture(),
    beforeTree = tree.read(),
    beforeWorkbench = workbench.read();
  expect(() => tree.restoreSnapshot(3, id)).toThrow("工作台偏好已变化");
  expect(() => tree.restoreSnapshot(3, id, 1)).toThrow("工作台偏好已变化");
  expect(() => tree.restoreSnapshot(2, id, 2)).toThrow("其他设备");
  expect(tree.read()).toEqual(beforeTree);
  expect(workbench.read()).toEqual(beforeWorkbench);
});
it("does not undo bundled preferences after another workbench edit", () => {
  const { tree, workbench, id } = fixture();
  const restored = tree.restoreSnapshot(3, id, 2);
  workbench.update(3, (state) => ({
    ...state,
    preferences: { ...state.preferences, favorites: ["newer"] },
  }));
  expect(tree.history().canUndo).toBe(false);
  expect(() => tree.undo(restored.revision, 4)).toThrow("不能撤销");
  expect(() => tree.undo(restored.revision, 3)).toThrow("工作台偏好已变化");
  expect(tree.read().revision).toBe(restored.revision);
  expect(workbench.read().preferences.favorites).toEqual(["newer"]);
});
it("keeps legacy snapshots tree-only when a workbench store is connected later", () => {
  const home = mkdtempSync(join(tmpdir(), "legacy-snapshot-"));
  homes.push(home);
  const legacy = createProjectTreeStore(home);
  legacy.change(0, { type: "folder", id: "f", name: "Before", parentId: null });
  legacy.saveSnapshot(1, "Legacy");
  const id = legacy.history().snapshots[0]!.id;
  const workbench = createWorkbenchStateStore(home);
  workbench.update(0, (state) => ({
    ...state,
    preferences: { ...state.preferences, favorites: ["untouched"] },
  }));
  const tree = createProjectTreeStore(home, workbench);
  tree.change(2, { type: "rename", id: "f", name: "After" });
  tree.restoreSnapshot(3, id);
  expect(tree.read().nodes[0]?.name).toBe("Before");
  expect(workbench.read().revision).toBe(1);
  expect(workbench.read().preferences.favorites).toEqual(["untouched"]);
});
it("rolls back scoped preferences if the tree commit fails and retains both recovery copies", () => {
  const { home, tree, workbench, id } = fixture(),
    before = workbench.read(),
    beforeTree = tree.read();
  failures.treeWrite = true;
  expect(() => tree.restoreSnapshot(3, id, 2)).toThrow("simulated tree commit failure");
  expect(tree.read()).toEqual(beforeTree);
  expect(workbench.read().preferences).toEqual(before.preferences);
  expect(workbench.read().memories).toEqual(before.memories);
  expect(workbench.read().revision).toBe(4);
  expect(
    JSON.parse(readFileSync(join(home, "toolkit", "project-tree.before-restore.json"), "utf8"))
      .nodes,
  ).toEqual(beforeTree.nodes);
  expect(
    JSON.parse(
      readFileSync(
        join(home, "toolkit", "workbench", "display-preferences.before-restore.json"),
        "utf8",
      ),
    ).preferences.favorites,
  ).toEqual(["new"]);
});
it("restores absent scenario mappings rather than retaining newer assignments", () => {
  const { home, workbench } = fixture();
  workbench.update(2, (state) => ({
    ...state,
    preferences: { ...state.preferences, scenarioProjects: undefined },
  }));
  const tree = createProjectTreeStore(home, workbench);
  tree.saveSnapshot(3, "No scenarios");
  const id = tree.history().snapshots.at(-1)!.id;
  workbench.update(3, (state) => ({
    ...state,
    preferences: { ...state.preferences, scenarioProjects: { coding: ["later"] } },
  }));
  tree.restoreSnapshot(4, id, 4);
  expect(workbench.read().preferences.scenarioProjects).toBeUndefined();
});
