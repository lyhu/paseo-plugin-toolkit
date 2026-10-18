import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerQuickQuestions } from "./server/quick-questions/register";
import { registerModels } from "./server/models/register";
import { createModelStore } from "./server/models/storage";
import { activitySettings } from "./shared/chat-view/settings";
import { registerEnhance } from "./server/chat-view/enhance";
import { LocalizedError } from "./shared/chat-view/i18n";
export default function contribute(server: PluginServerContext) {
  const models = createModelStore();
  registerModels(server, models);
  const settings = server.registerSettings(activitySettings);
  const readFeatures = async () => {
    const state = await settings.read();
    if (state.status !== "ready") throw new LocalizedError("settings.error.unavailable");
    return state.values;
  };
  registerEnhance(server, readFeatures, models);
  return registerQuickQuestions(server, models, readFeatures);
}
