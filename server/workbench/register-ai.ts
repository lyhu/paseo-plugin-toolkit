import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import * as aiRpc from "../../shared/workbench/ai";
import * as operationRpc from "../../shared/workbench/operations";
import { paseoHome } from "../models/storage";
import { createPersonalAI } from "./personal-ai";
import { createOperationStore } from "./operations";
import { createWorkbenchTools } from "./tools";

export function registerWorkbenchAI(
  server: PluginServerContext,
  options: { home?: string; readContext?: (scope?: string) => Promise<unknown> } = {},
) {
  const home = options.home ?? paseoHome();
  const operations = createOperationStore(join(home, "toolkit", "workbench", "operations.json"));
  const tools = createWorkbenchTools(operations);
  const ai = createPersonalAI(home, tools, options.readContext);
  server.handle(aiRpc.readPersonalAI, () => ai.read());
  server.handle(aiRpc.initializePersonalAI, (_, { paseo }) => ai.initialize(paseo));
  server.handle(aiRpc.setPersonalAIReference, ({ project }) => ai.setReference(project));
  const removeCreate = server.before("agent.create", ({ request }, { paseo }) =>
    ai.configureNative(paseo, request),
  );
  const removeOpen = server.before("agent.session_open", ({ request }) => {
    if (request.env.TOOLKIT_WORKBENCH_CONTEXT)
      tools.bind(request.env.TOOLKIT_WORKBENCH_CONTEXT, request.agentId);
  });
  server.handle(aiRpc.createPersonalAISession, (input, { paseo }) =>
    ai.createSession(paseo, input),
  );
  server.handle(aiRpc.saveWorkbenchSkill, (input) => ai.saveSkill(input));
  server.handle(aiRpc.toggleWorkbenchSkill, ({ slug, enabled }) => ai.toggleSkill(slug, enabled));
  server.handle(operationRpc.listCreationPlans, () => operations.list());
  server.handle(operationRpc.prepareCreationPlan, (input) => operations.prepare(input));
  server.handle(operationRpc.editCreationPlan, ({ id, revision, payload }) =>
    operations.edit(id, revision, payload),
  );
  server.handle(operationRpc.cancelCreationPlan, ({ id, revision }) =>
    operations.cancel(id, revision),
  );
  server.handle(operationRpc.executeCreationPlan, ({ id, revision }, { paseo }) =>
    operations.execute(id, revision, paseo),
  );
  return () => {
    removeCreate();
    removeOpen();
    return tools.close();
  };
}
