import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  inheritModel,
  listModels,
  readModels,
  saveModel,
  testModel,
} from "../../shared/models/contracts";
import { fetchModels, probeModel, validateBaseUrl } from "./connection";
import type { ModelStore } from "./storage";
export function registerModels(server: PluginServerContext, models: ModelStore) {
  server.handle(readModels, ({ workspaceId }) => models.read(workspaceId));
  server.handle(saveModel, (input) => {
    validateBaseUrl(input.baseUrl);
    return models.save(input);
  });
  server.handle(inheritModel, ({ workspaceId, revision }) => models.inherit(workspaceId, revision));
  server.handle(listModels, (input) => fetchModels(models.resolveDraft(input)));
  server.handle(testModel, (input) => probeModel(models.resolveDraft(input)));
}
