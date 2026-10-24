import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const identity = z.string().trim().min(1).max(500);
export const creationPayloadSchema = z.object({
  kind: z.enum(["project", "workspace", "session"]),
  serverId: identity,
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(4096).optional(),
  projectId: identity.optional(), workspaceId: identity.optional(),
  provider: identity.optional(), prompt: z.string().max(24_000).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "session" && !value.workspaceId)
    ctx.addIssue({code:"custom", path:["workspaceId"], message:"创建会话需要明确工作区"});
  if (value.kind !== "session" && !value.path)
    ctx.addIssue({code:"custom", path:["path"], message:"创建工作区需要明确绝对目录"});
  if (value.kind === "session" && !value.provider)
    ctx.addIssue({code:"custom", path:["provider"], message:"请选择会话 Provider"});
  if (value.prompt && !value.provider)
    ctx.addIssue({code:"custom", path:["provider"], message:"发送初始提示词需要 Provider"});
});
export type CreationPayload = z.infer<typeof creationPayloadSchema>;
export const creationPlanSchema = z.object({
  id: z.string(), revision: z.number().int().nonnegative(), payload: creationPayloadSchema,
  sourceAgentId: z.string().optional(),
  status:z.enum(["pending","executing","completed","cancelled","failed","partial","unknown"]),
  createdAt:z.string(), updatedAt:z.string(),
  result:z.object({serverId:z.string(),projectId:z.string().optional(),workspaceId:z.string().optional(),agentId:z.string().optional(),path:z.string().optional()}).optional(),
  error:z.string().optional(),
});
export type CreationPlan = z.infer<typeof creationPlanSchema>;
const planVersion = z.object({id:z.string().min(1),revision:z.number().int().nonnegative()});
export const prepareCreationPlan = defineRpc({name:"workbench.operations.prepare",input:creationPayloadSchema,output:creationPlanSchema});
export const listCreationPlans = defineRpc({name:"workbench.operations.list",input:z.object({}),output:z.array(creationPlanSchema)});
export const editCreationPlan = defineRpc({name:"workbench.operations.edit",input:planVersion.extend({payload:creationPayloadSchema}),output:creationPlanSchema});
export const executeCreationPlan = defineRpc({name:"workbench.operations.execute",input:planVersion,output:creationPlanSchema});
export const cancelCreationPlan = defineRpc({name:"workbench.operations.cancel",input:planVersion,output:creationPlanSchema});
