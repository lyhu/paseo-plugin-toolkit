import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  applyTitle,
  cancelTitle,
  readTitle,
  sessionTitleSettings,
  startTitle,
  listTitles,
  archiveTitle,
  resumeTitles,
} from "../../shared/session-title/contracts";
import type { ModelStore } from "../models/storage";
import { createTitleStore } from "./storage";
import { createTitleService } from "./service";

export function registerSessionTitle(server: PluginServerContext, models: ModelStore) {
  const settings = server.registerSettings(sessionTitleSettings);
  const service = createTitleService({
    store: createTitleStore(),
    models,
    settings: async () => {
      const value = await settings.read();
      if (value.status !== "ready") throw new Error("会话命名设置不可用，请刷新后重试。");
      return value.values;
    },
  });
  const removeCreated = server.on("agent.created", ({ agent }) => {
    if (!agent.parentAgentId) service.created(agent.id, agent.title, agent.workspaceId);
  });
  const removeStarted = server.on("agent.turn_started", ({ agent }) =>
    service.invalidate(agent.id),
  );
  const removeEnded = server.on("agent.turn_ended", ({ agent, outcome }, { paseo }) => {
    if (outcome.kind === "completed" && !agent.parentAgentId)
      void service
        .automatic(paseo, agent.id)
        .catch(() => console.error("Session title analysis could not start"));
  });
  const removeArchived = server.on("agent.archived", ({ agent, archivedAt }) => {
    service.archived(agent.id, archivedAt);
  });
  server.handle(listTitles, ({ workspaceId }) => service.list(workspaceId));
  server.handle(archiveTitle, ({ agentId }, { paseo }) => service.archive(paseo, agentId));
  server.handle(resumeTitles, (_input, { paseo }) => service.recover(paseo));
  server.handle(readTitle, ({ agentId }) => service.read(agentId));
  server.handle(startTitle, ({ agentId }, { paseo }) => service.start(paseo, agentId));
  server.handle(cancelTitle, ({ agentId }) => ({ canceled: service.cancel(agentId) }));
  server.handle(applyTitle, ({ agentId, resultId }, { paseo }) =>
    service.apply(paseo, agentId, resultId),
  );
  return async () => {
    removeCreated();
    removeStarted();
    removeEnded();
    removeArchived();
    await service.dispose();
  };
}
