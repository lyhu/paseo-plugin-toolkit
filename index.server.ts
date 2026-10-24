import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerQuickQuestions } from "./server/quick-questions/register";
import { registerModels } from "./server/models/register";
import { createModelStore } from "./server/models/storage";
import { activitySettings } from "./shared/chat-view/settings";
import { registerEnhance } from "./server/chat-view/enhance";
import { LocalizedError } from "./shared/chat-view/i18n";
import { registerProjectTree } from "./server/project-tree/register";
import { registerWorkbenchAI } from "./server/workbench/register-ai";
import { registerWorkbenchState } from "./server/workbench/state";
import { registerWorkbenchSearch } from "./server/workbench/search";
import { memoryContext } from "./shared/workbench/state";
export default function contribute(server: PluginServerContext) {
  registerProjectTree(server);
  const workbench = registerWorkbenchState(server);
  const disposeSearch = registerWorkbenchSearch(server);
  const disposeAI = registerWorkbenchAI(server, {
    readContext: async () => memoryContext(workbench.read().memories, "personal"),
  });
  const models = createModelStore();
  registerModels(server, models);
  const settings = server.registerSettings(activitySettings);
  const readFeatures = async () => {
    const state = await settings.read();
    if (state.status !== "ready") throw new LocalizedError("settings.error.unavailable");
    return state.values;
  };
  registerEnhance(server, readFeatures, models);
  const disposeQuestions = registerQuickQuestions(server, models, readFeatures);
  return async () => {
    disposeQuestions();
    disposeSearch();
    await disposeAI();
  };
}
