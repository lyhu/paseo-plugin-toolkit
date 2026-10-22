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
export const projectTreeSettings = defineSettings({
  id: "project-tree",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(false),
    showSessionsByDefault: z.boolean().default(false),
  }),
});
