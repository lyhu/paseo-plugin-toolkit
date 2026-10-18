import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const connectionSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  apiKey: z.string(),
});
export type ModelConnection = z.infer<typeof connectionSchema>;
export const publicModelSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  hasKey: z.boolean(),
});
export const modelStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  defaultModel: publicModelSchema,
  overrideModel: publicModelSchema.nullable(),
  effectiveModel: publicModelSchema,
  source: z.enum(["host", "workspace"]),
});
export type ModelState = z.infer<typeof modelStateSchema>;
export const modelScopeSchema = z.enum(["host", "workspace"]);
export type ModelScope = z.infer<typeof modelScopeSchema>;
const scope = z.object({ workspaceId: z.string().min(1).optional() });
export const readModels = defineRpc({
  name: "models.read",
  input: scope,
  output: modelStateSchema,
});
export const saveModel = defineRpc({
  name: "models.save",
  input: scope.extend({
    revision: z.number().int(),
    scope: modelScopeSchema,
    baseUrl: z.url(),
    model: z.string().trim().min(1),
    apiKey: z.string(),
    clearKey: z.boolean(),
  }),
  output: modelStateSchema,
});
export const inheritModel = defineRpc({
  name: "models.workspace.inherit",
  input: z.object({ workspaceId: z.string().min(1), revision: z.number().int() }),
  output: modelStateSchema,
});
const draft = scope.extend({
  scope: modelScopeSchema,
  baseUrl: z.url(),
  apiKey: z.string(),
  clearKey: z.boolean(),
});
export const listModels = defineRpc({
  name: "models.list",
  input: draft,
  output: z.object({ models: z.array(z.string()) }),
});
export const testModel = defineRpc({
  name: "models.test",
  input: draft.extend({ model: z.string().trim().min(1) }),
  output: z.object({ latencyMs: z.number().nonnegative() }),
});
