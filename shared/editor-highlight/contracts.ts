import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const editorHighlightSettings = defineSettings({
  id: "editor-highlight",
  scope: "host",
  version: 1,
  schema: z.object({ automatic: z.boolean().default(true) }),
});
export const highlightStateSchema = z.object({
  status: z.enum(["unsupported", "missing", "ready", "applied", "restored", "error"]),
  appPath: z.string(),
  version: z.string().nullable(),
  checkedAt: z.string(),
  backupPath: z.string().nullable(),
  error: z.string().nullable(),
});
export type HighlightState = z.infer<typeof highlightStateSchema>;
export const readHighlight = defineRpc({
  name: "editor-highlight.read",
  input: z.object({}),
  output: highlightStateSchema,
});
export const applyHighlight = defineRpc({
  name: "editor-highlight.apply",
  input: z.object({}),
  output: highlightStateSchema,
});
export const restoreHighlight = defineRpc({
  name: "editor-highlight.restore",
  input: z.object({}),
  output: highlightStateSchema,
});
