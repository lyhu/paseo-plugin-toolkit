import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createRevisionedJsonStore, writePrivateJsonFile } from "../storage/revisioned-json";
import { paseoHome } from "../models/storage";
import {
  applyTreeCommand,
  emptyTree,
  treeSchema,
  validateTree,
  type TreeCommand,
} from "../../shared/project-tree/model";
import { restoreTree } from "../../shared/project-tree/restore";

const savedSnapshot = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  createdAt: z.string(),
  tree: treeSchema,
});
const documentSchema = treeSchema.extend({
  undoEntries: z.array(z.object({ afterRevision: z.number().int(), tree: treeSchema })).default([]),
  snapshots: z.array(savedSnapshot).default([]),
});

/** One writer process owns this revisioned document; snapshots contain organization only. */
export function createProjectTreeStore(home = paseoHome()) {
  const filename = join(home, "toolkit", "project-tree.json");
  const store = createRevisionedJsonStore({
    filename,
    schema: documentSchema,
    create: () => ({ ...emptyTree(), schemaVersion: 2 as const, undoEntries: [], snapshots: [] }),
    concurrencyError: "目录结构已在其他设备更新，请刷新后重试。",
  });
  const read = () => {
    const document = store.read();
    validateTree(document);
    if (document.schemaVersion !== 2 && existsSync(filename)) {
      const backup = join(home, "toolkit", "project-tree.v1.backup.json");
      if (!existsSync(backup))
        writePrivateJsonFile(backup, JSON.parse(readFileSync(filename, "utf8")));
      document.schemaVersion = 2;
      writePrivateJsonFile(filename, document);
    }
    return document;
  };
  const update = (
    revision: number,
    transform: (document: z.infer<typeof documentSchema>) => z.infer<typeof documentSchema>,
  ) => {
    read();
    return treeSchema.parse(store.update(revision, transform));
  };
  return {
    read: () => treeSchema.parse(read()),
    history: () => {
      const document = read();
      return {
        revision: document.revision,
        canUndo: document.undoEntries.at(-1)?.afterRevision === document.revision,
        snapshots: document.snapshots.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
      };
    },
    change: (revision: number, command: TreeCommand) =>
      update(revision, (document) => {
        const next = applyTreeCommand(document, command);
        const undoEntries =
          command.type === "discover"
            ? []
            : [
                ...document.undoEntries,
                { afterRevision: revision + 1, tree: treeSchema.parse(document) },
              ].slice(-30);
        return { ...document, ...next, schemaVersion: 2, undoEntries };
      }),
    undo: (revision: number) =>
      update(revision, (document) => {
        const previous = document.undoEntries.at(-1);
        if (!previous || previous.afterRevision !== revision)
          throw new Error("没有可安全撤销的展示操作，请刷新后重试。");
        const undoEntries = document.undoEntries.slice(0, -1);
        const last = undoEntries.at(-1);
        if (last) last.afterRevision = revision + 1;
        return {
          ...document,
          ...treeSchema.parse(previous.tree),
          workspacePlacements: previous.tree.workspacePlacements,
          revision: document.revision,
          undoEntries,
        };
      }),
    saveSnapshot: (revision: number, name: string) =>
      update(revision, (document) => ({
        ...document,
        undoEntries: [],
        snapshots: [
          ...document.snapshots,
          savedSnapshot.parse({
            id: randomUUID(),
            name,
            createdAt: new Date().toISOString(),
            tree: treeSchema.parse(document),
          }),
        ].slice(-20),
      })),
    restoreSnapshot: (revision: number, snapshotId: string) =>
      update(revision, (document) => {
        const snapshot = document.snapshots.find((entry) => entry.id === snapshotId);
        if (!snapshot) throw new Error("展示快照不存在");
        return {
          ...document,
          ...restoreTree(document, snapshot.tree),
          undoEntries: [{ afterRevision: revision + 1, tree: treeSchema.parse(document) }],
          snapshots: [
            ...document.snapshots,
            {
              id: randomUUID(),
              name: "恢复前的展示配置",
              createdAt: new Date().toISOString(),
              tree: treeSchema.parse(document),
            },
          ].slice(-20),
        };
      }),
  };
}
