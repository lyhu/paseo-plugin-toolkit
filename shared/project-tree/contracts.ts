import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { commandSchema, treeSchema } from "./model";
export const readProjectTree = defineRpc({
  name: "project-tree.read",
  input: z.object({}),
  output: treeSchema,
});
export const changeProjectTree = defineRpc({
  name: "project-tree.change",
  input: z.object({ revision: z.number().int().nonnegative(), command: commandSchema }),
  output: treeSchema,
});

/** Visible title of the custom project tree. Blank stored values fall back to this. */
export const DEFAULT_PROJECT_TREE_VIEW_NAME = "我的工作台";

const viewNameSchema = z.string().trim().min(1).max(40).default(DEFAULT_PROJECT_TREE_VIEW_NAME);

export const projectTreeSettings = defineSettings({
  id: "project-tree",
  scope: "host",
  version: 2,
  schema: z.object({
    enabled: z.boolean().default(false),
    showSessionsByDefault: z.boolean().default(false),
    viewName: viewNameSchema,
  }),
  // v1 stored only the enable switch and the session default.
  migrate: (values) => {
    if (!values || typeof values !== "object") return values;
    const record = values as { viewName?: unknown };
    if (typeof record.viewName === "string" && record.viewName.trim()) return values;
    return { ...record, viewName: DEFAULT_PROJECT_TREE_VIEW_NAME };
  },
});

export function projectTreeViewName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 40) : DEFAULT_PROJECT_TREE_VIEW_NAME;
}

export const readProjectTreeHistory = defineRpc({
  name: "project-tree.history",
  input: z.object({}),
  output: z.object({
    revision: z.number().int().nonnegative(),
    canUndo: z.boolean(),
    workbenchRevision: z.number().int().nonnegative().optional(),
    snapshots: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        createdAt: z.string(),
        preview: z
          .object({
            nodesChanged: z.number().int().nonnegative(),
            workspacePlacementsChanged: z.boolean(),
            tabsChanged: z.boolean().optional(),
            favoritesChanged: z.boolean().optional(),
            scenariosChanged: z.boolean().optional(),
          })
          .optional(),
      }),
    ),
  }),
});
export const saveProjectTreeSnapshot = defineRpc({
  name: "project-tree.snapshot.save",
  input: z.object({
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(120),
  }),
  output: treeSchema,
});
export const restoreProjectTreeSnapshot = defineRpc({
  name: "project-tree.snapshot.restore",
  input: z.object({
    revision: z.number().int().nonnegative(),
    snapshotId: z.string(),
    workbenchRevision: z.number().int().nonnegative().optional(),
  }),
  output: treeSchema,
});
export const undoProjectTree = defineRpc({
  name: "project-tree.undo",
  input: z.object({
    revision: z.number().int().nonnegative(),
    workbenchRevision: z.number().int().nonnegative().optional(),
  }),
  output: treeSchema,
});
