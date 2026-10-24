import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const skillInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  content: z.string().trim().min(1).max(64_000),
});
export const skillSchema = skillInputSchema.extend({
  enabled: z.boolean(),
  builtin: z.boolean(),
  path: z.string(),
  loadStatus: z.literal("new-session-required"),
});
export type WorkbenchSkill = z.infer<typeof skillSchema>;
export const personalAIStateSchema = z.object({
  root: z.string(),
  initialized: z.boolean(),
  serverId: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  skills: z.array(skillSchema),
});
export type PersonalAIState = z.infer<typeof personalAIStateSchema>;
export const sessionAddressSchema = z.object({
  serverId: z.string(),
  workspaceId: z.string(),
  agentId: z.string(),
});
export const readPersonalAI = defineRpc({
  name: "workbench.ai.read",
  input: z.object({}),
  output: personalAIStateSchema,
});
export const initializePersonalAI = defineRpc({
  name: "workbench.ai.initialize",
  input: z.object({}),
  output: personalAIStateSchema,
});
export const createPersonalAISession = defineRpc({
  name: "workbench.ai.session",
  input: z.object({
    provider: z.string().trim().min(1),
    title: z.string().trim().min(1).max(120),
    prompt: z.string().max(24_000).optional(),
  }),
  output: sessionAddressSchema,
});
export const saveWorkbenchSkill = defineRpc({
  name: "workbench.skills.save",
  input: skillInputSchema,
  output: personalAIStateSchema,
});
export const toggleWorkbenchSkill = defineRpc({
  name: "workbench.skills.toggle",
  input: z.object({ slug: skillInputSchema.shape.slug, enabled: z.boolean() }),
  output: personalAIStateSchema,
});
