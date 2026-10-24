import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createRevisionedJsonStore,
  writePrivateJsonFile,
  type RevisionedJsonStore,
} from "../storage/revisioned-json";
import { paseoHome } from "../models/storage";
import {
  applyTreeCommand,
  emptyTree,
  treeSchema,
  validateTree,
  type TreeCommand,
} from "../../shared/project-tree/model";
import { restoreTree } from "../../shared/project-tree/restore";
import { preferencesSchema, type WorkbenchState } from "../../shared/workbench/state";
export type WorkbenchStore = RevisionedJsonStore<WorkbenchState>;
const displayPreferencesSchema = preferencesSchema.pick({
  tabs: true,
  favorites: true,
  scenarioProjects: true,
});
type DisplayPreferences = z.infer<typeof displayPreferencesSchema>;
const displayPreferences = (state: WorkbenchState) =>
  displayPreferencesSchema.parse(state.preferences);

const savedSnapshot = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  createdAt: z.string(),
  tree: treeSchema,
  preferences: displayPreferencesSchema.optional(),
});
const documentSchema = treeSchema.extend({
  undoEntries: z
    .array(
      z.object({
        afterRevision: z.number().int(),
        tree: treeSchema,
        preferences: displayPreferencesSchema.optional(),
        workbenchRevision: z.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
  snapshots: z.array(savedSnapshot).default([]),
});

/** One writer process owns this revisioned document; snapshots contain organization only. */
export function createProjectTreeStore(home = paseoHome(), workbench?: WorkbenchStore) {
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
    preferences?: { value: DisplayPreferences; revision?: number },
  ) => {
    read();
    let rollback: { value: DisplayPreferences; revision: number } | undefined;
    try {
      return treeSchema.parse(
        store.update(revision, (document) => {
          const next = documentSchema.parse(transform(document));
          validateTree(next);
          if (preferences) {
            if (!workbench)
              throw new Error("此快照包含工作台偏好，请在支持完整快照的配置 Host 恢复。");
            const before = workbench.read();
            if (preferences.revision === undefined || before.revision !== preferences.revision)
              throw new Error("工作台偏好已变化，请刷新快照预览后重试。");
            const beforePreferences = displayPreferences(before);
            // Recovery copies contain display configuration only, never memory bodies or resources.
            writePrivateJsonFile(
              join(home, "toolkit", "project-tree.before-restore.json"),
              document,
            );
            writePrivateJsonFile(
              join(home, "toolkit", "workbench", "display-preferences.before-restore.json"),
              {
                revision: before.revision,
                preferences: beforePreferences,
              },
            );
            const changed = workbench.update(before.revision, (state) => ({
              ...state,
              preferences: {
                ...state.preferences,
                ...preferences.value,
                scenarioProjects: preferences.value.scenarioProjects,
              },
            }));
            rollback = { value: beforePreferences, revision: changed.revision };
          }
          return next;
        }),
      );
    } catch (error) {
      if (rollback && workbench) {
        try {
          workbench.update(rollback.revision, (state) => ({
            ...state,
            preferences: {
              ...state.preferences,
              ...rollback!.value,
              scenarioProjects: rollback!.value.scenarioProjects,
            },
          }));
        } catch {
          throw new Error(
            "快照恢复失败，自动回滚未完成；展示配置备份已保留，请检查配置 Host 存储。",
          );
        }
      }
      throw error;
    }
  };

  return {
    read: () => treeSchema.parse(read()),
    history: () => {
      const document = read();
      const workbenchState = workbench?.read();
      const previous = document.undoEntries.at(-1);
      const currentNodes = new Map(
        document.nodes.map((node, index) => [node.id, JSON.stringify([index, node])]),
      );
      return {
        revision: document.revision,
        ...(workbenchState ? { workbenchRevision: workbenchState.revision } : {}),
        canUndo:
          previous?.afterRevision === document.revision &&
          (!previous.preferences || previous.workbenchRevision === workbenchState?.revision),
        snapshots: document.snapshots.map(({ id, name, createdAt, tree, preferences }) => {
          const savedNodes = new Map(
            tree.nodes.map((node, index) => [node.id, JSON.stringify([index, node])]),
          );
          const ids = new Set([...currentNodes.keys(), ...savedNodes.keys()]);
          return {
            id,
            name,
            createdAt,
            preview: {
              nodesChanged: [...ids].filter((id) => currentNodes.get(id) !== savedNodes.get(id))
                .length,
              workspacePlacementsChanged:
                JSON.stringify(document.workspacePlacements ?? []) !==
                JSON.stringify(tree.workspacePlacements ?? []),
              ...(preferences && workbenchState
                ? {
                    tabsChanged:
                      JSON.stringify(preferences.tabs) !==
                      JSON.stringify(workbenchState.preferences.tabs),
                    favoritesChanged:
                      JSON.stringify(preferences.favorites) !==
                      JSON.stringify(workbenchState.preferences.favorites),
                    scenariosChanged:
                      JSON.stringify(preferences.scenarioProjects) !==
                      JSON.stringify(workbenchState.preferences.scenarioProjects),
                  }
                : {}),
            },
          };
        }),
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
    undo: (revision: number, workbenchRevision?: number) => {
      const previous = read().undoEntries.at(-1);
      if (previous?.preferences && previous.workbenchRevision !== workbenchRevision)
        throw new Error("工作台偏好已变化，不能撤销这次快照恢复，请刷新后重试。");
      return update(
        revision,
        (document) => {
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
        },
        previous?.preferences
          ? { value: previous.preferences, revision: workbenchRevision }
          : undefined,
      );
    },
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
            ...(workbench ? { preferences: displayPreferences(workbench.read()) } : {}),
          }),
        ].slice(-20),
      })),
    restoreSnapshot: (revision: number, snapshotId: string, workbenchRevision?: number) => {
      const snapshot = read().snapshots.find((entry) => entry.id === snapshotId);
      if (!snapshot) throw new Error("展示快照不存在");
      const beforePreferences = workbench ? displayPreferences(workbench.read()) : undefined;
      return update(
        revision,
        (document) => ({
          ...document,
          ...restoreTree(document, snapshot.tree),
          undoEntries: [
            {
              afterRevision: revision + 1,
              tree: treeSchema.parse(document),
              ...(snapshot.preferences && beforePreferences
                ? {
                    preferences: beforePreferences,
                    workbenchRevision:
                      workbenchRevision === undefined ? undefined : workbenchRevision + 1,
                  }
                : {}),
            },
          ],
          snapshots: [
            ...document.snapshots,
            {
              id: randomUUID(),
              name: "恢复前的展示配置",
              createdAt: new Date().toISOString(),
              tree: treeSchema.parse(document),
              ...(beforePreferences ? { preferences: beforePreferences } : {}),
            },
          ].slice(-20),
        }),
        snapshot.preferences
          ? { value: snapshot.preferences, revision: workbenchRevision }
          : undefined,
      );
    },
  };
}
