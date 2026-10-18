import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { publicModelSchema } from "../models/contracts";
import { localizedMessageSchema } from "../chat-view/i18n";

export const sourceSchema = z.object({ agentId: z.string(), question: z.string() });
export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(8000),
  origin: z.enum(["custom", "history"]),
  frequency: z.number().int().nonnegative(),
  sources: z.array(sourceSchema).max(3),
});
export type Question = z.infer<typeof questionSchema>;
export const DEFAULT_HISTORY_LIMIT = 50;
export const historyLimitSchema = z.number().int().positive();
export const summaryPromptSchema = z.string().trim().min(1).max(8000);
export const workspaceSchema = z.object({
  featureEnabled: z.boolean(),
  summaryPrompt: summaryPromptSchema,
  historyLimit: historyLimitSchema,
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  questions: z.array(questionSchema),
  model: publicModelSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;
export const jobSchema = z.object({
  id: z.string(),
  phase: z.enum(["reading", "summarizing", "merging", "done", "error", "canceled"]),
  completed: z.number(),
  total: z.number(),
  read: z.number(),
  failed: z.array(
    z.object({ agentId: z.string(), title: z.string(), reason: localizedMessageSchema }),
  ),
  activity: localizedMessageSchema,
  events: z.array(
    z.object({
      at: z.string(),
      level: z.enum(["info", "success", "error"]),
      message: localizedMessageSchema,
    }),
  ),
  messageCount: z.number(),
  candidates: z.array(questionSchema),
  error: localizedMessageSchema.nullable(),
});
export type Job = z.infer<typeof jobSchema>;
export function isWorking(job: Job | null | undefined): boolean {
  return job?.phase === "reading" || job?.phase === "summarizing" || job?.phase === "merging";
}
export function questionKey(text: string): string {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
const scope = z.object({ workspaceId: z.string().min(1) });
/**
 * Every connected host evaluates this plugin, but the draft pill row is a single shared DOM
 * element. A host claims the workspace before the pill mounts, so only the host that owns the
 * workspace renders the button.
 */
export const claimWorkspace = defineRpc({
  name: "quick-questions.claim",
  input: scope,
  output: z.object({ claimed: z.boolean() }),
});
export const readWorkspace = defineRpc({
  name: "quick-questions.read",
  input: scope,
  output: workspaceSchema,
});
export const saveQuestions = defineRpc({
  name: "quick-questions.save",
  input: scope.extend({
    revision: z.number().int(),
    enabled: z.boolean(),
    questions: z.array(questionSchema).max(500),
  }),
  output: workspaceSchema,
});
export const saveSummarySettings = defineRpc({
  name: "quick-questions.summary.settings.save",
  input: scope.extend({
    revision: z.number().int(),
    historyLimit: historyLimitSchema,
    summaryPrompt: summaryPromptSchema.optional(),
  }),
  output: workspaceSchema,
});
export const startSummary = defineRpc({
  name: "quick-questions.summary.start",
  input: scope,
  output: jobSchema,
});
export const readSummary = defineRpc({
  name: "quick-questions.summary.read",
  input: scope,
  output: jobSchema.nullable(),
});
export const removeCandidate = defineRpc({
  name: "quick-questions.summary.candidate.remove",
  input: scope.extend({ jobId: z.string().min(1), candidateId: z.string().min(1) }),
  output: jobSchema,
});
export const cancelSummary = defineRpc({
  name: "quick-questions.summary.cancel",
  input: scope,
  output: z.object({ canceled: z.boolean() }),
});
export const sendQuestion = defineRpc({
  name: "quick-questions.send",
  input: scope.extend({ agentId: z.string(), text: z.string().trim().min(1).max(8000) }),
  output: z.object({ sent: z.boolean() }),
});
