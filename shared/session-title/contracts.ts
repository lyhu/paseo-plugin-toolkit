import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const sessionTitleSettings = defineSettings({
  id: "session-title",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(false),
    rounds: z.number().int().min(1).max(20).default(5),
    maxLength: z.number().int().min(1).max(100).default(30),
  }),
});
export type TitleSettings = z.output<typeof sessionTitleSettings.schema>;
export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(12000),
  title: z.string().trim().min(1).max(400),
  changed: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
});
export type Analysis = z.infer<typeof analysisSchema>;
export const resultSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  previousTitle: z.string().nullable(),
  fingerprint: z.string(),
  messages: z.number().int(),
  through: z.number().int(),
  at: z.string(),
  applied: z.boolean().default(false),
  analysis: analysisSchema,
});
export type TitleResult = z.infer<typeof resultSchema>;
export const jobSchema = z.object({
  id: z.string(),
  source: z.enum(["automatic", "command", "archive"]).default("command"),
  phase: z.enum(["queued", "reading", "summarizing", "applying", "done", "error", "canceled"]),
  at: z.string().optional(),
  completed: z.number(),
  total: z.number(),
  error: z.string().nullable(),
  result: resultSchema.nullable(),
});
export type TitleJob = z.infer<typeof jobSchema>;
export function working(job: TitleJob | null | undefined) {
  return (
    job?.phase === "queued" ||
    job?.phase === "reading" ||
    job?.phase === "summarizing" ||
    job?.phase === "applying"
  );
}
const scope = z.object({ agentId: z.string().min(1) });
export const startTitle = defineRpc({
  name: "session-title.start",
  input: scope,
  output: jobSchema,
});
export const readTitle = defineRpc({
  name: "session-title.read",
  input: scope,
  output: z.object({
    job: jobSchema.nullable(),
    result: resultSchema.nullable(),
    protected: z.boolean(),
    rounds: z.number().int(),
    history: z.array(jobSchema).default([]),
    error: z.string().nullable(),
  }),
});
export const cancelTitle = defineRpc({
  name: "session-title.cancel",
  input: scope.extend({ jobId: z.string().optional() }),
  output: z.object({ canceled: z.boolean() }),
});
export const applyTitle = defineRpc({
  name: "session-title.apply",
  input: scope.extend({ resultId: z.string() }),
  output: z.object({ applied: z.boolean() }),
});
export const archiveTitle = defineRpc({
  name: "session-title.archive",
  input: scope,
  output: z.object({ archived: z.boolean() }),
});
export const queueClearTitle = defineRpc({
  name: "session-title.queue-clear",
  input: scope,
  output: jobSchema,
});
export const countSessionTurns = defineRpc({
  name: "session-title.turns",
  input: scope.extend({ workspaceId: z.string().min(1) }),
  output: z.object({ count: z.number().int().nonnegative().nullable() }),
});
export const resumeTitles = defineRpc({
  name: "session-title.resume",
  input: z.object({}),
  output: z.object({ resumed: z.number() }),
});
export const listTitles = defineRpc({
  name: "session-title.list",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.array(
    z.object({
      agentId: z.string(),
      title: z.string().nullable(),
      archived: z.boolean(),
      runs: z.number(),
      at: z.string().nullable(),
      phase: jobSchema.shape.phase.nullable(),
    }),
  ),
});

export function titleLength(title: string) {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(title))
    .length;
}
export function validTitle(title: string, limit: number) {
  // Paseo's explicit title contract also uses a 200 UTF-16 unit limit.
  return (
    Boolean(title.trim()) &&
    !/[\r\n]/.test(title) &&
    title.length <= 200 &&
    titleLength(title) <= limit
  );
}
