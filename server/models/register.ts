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
  function connection(input: {
    scope: "host" | "workspace";
    workspaceId?: string;
    baseUrl: string;
    apiKey: string;
    clearKey: boolean;
    model?: string;
  }) {
    const stored = models.target(input.scope, input.workspaceId);
    return {
      baseUrl: input.baseUrl,
      model: input.model ?? "",
      apiKey: input.clearKey ? "" : input.apiKey.trim() || stored.apiKey,
    };
  }
  server.handle(listModels, (input) => fetchModels(connection(input)));
  server.handle(testModel, (input) => probeModel(connection(input)));
}
