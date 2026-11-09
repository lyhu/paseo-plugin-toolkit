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
  queueClearTitle,
  countSessionTurns,
  renameTitle,
  deleteSession,
} from "../../shared/session-title/contracts";
import type { ModelStore } from "../models/storage";
import { createTitleStore } from "./storage";
import { createTitleFailureLog } from "./failure-log";
import { createTitleService } from "./service";
import { createSessionTurnCounter } from "./turns";
import { createSessionDeletion } from "./delete";
import { TITLE_MESSAGES, TitleFailureError } from "./errors";

export function registerSessionTitle(
  server: PluginServerContext,
  models: ModelStore,
  clearSearch: (agentId: string) => void = () => {},
) {
  const settings = server.registerSettings(sessionTitleSettings);
  const countTurns = createSessionTurnCounter();
  server.handle(countSessionTurns, ({ agentId, workspaceId }, { paseo }) =>
    countTurns(paseo, agentId, workspaceId),
  );
  const store = createTitleStore();
  const failures = createTitleFailureLog();
  const service = createTitleService({
    store,
    models,
    settings: async () => {
      const value = await settings.read();
      if (value.status !== "ready")
        throw new TitleFailureError("config.settings", TITLE_MESSAGES.settingsUnavailable);
      return value.values;
    },
    onFailure: (failure) => failures.record(failure),
  });
  const removeSession = createSessionDeletion({ store, titles: service, clearSearch });
  server.handle(renameTitle, ({ agentId, workspaceId, previousTitle, title }, { paseo }) =>
    service.rename(paseo, agentId, workspaceId, previousTitle, title),
  );
  server.handle(deleteSession, (input, { paseo }) => removeSession(paseo, input));
  const removeCreated = server.addHook("agent.create.after", async ({ agent }) => {
    if (!agent.parentAgentId) service.created(agent.id, agent.title, agent.workspaceId);
  });
  const removeStarted = server.addHook("agent.turn.before", async ({ agent }) => {
    service.invalidate(agent.id);
  });
  const removeEnded = server.addHook("agent.turn.after", async ({ agent, outcome }, { paseo }) => {
    if (outcome.kind === "completed" && !agent.parentAgentId)
      void service.automatic(paseo, agent.id).catch((error) => {
        console.error("[Toolkit] Session title analysis could not start", error);
      });
  });
  const removeArchived = server.addHook(
    "agent.archive.after",
    async ({ agent, archivedAt }, { paseo }) => {
      service.archived(agent.id, archivedAt, paseo);
    },
  );
  server.handle(listTitles, ({ workspaceId }) => service.list(workspaceId));
  server.handle(archiveTitle, ({ agentId }, { paseo }) => service.archive(paseo, agentId));
  server.handle(queueClearTitle, ({ agentId }, { paseo }) => service.queueClear(paseo, agentId));
  server.handle(resumeTitles, (_input, { paseo }) => service.recover(paseo));
  server.handle(readTitle, ({ agentId }) => service.read(agentId));
  server.handle(startTitle, ({ agentId }, { paseo }) => service.start(paseo, agentId));
  server.handle(cancelTitle, ({ agentId, jobId }) => ({
    canceled: service.cancel(agentId, jobId),
  }));
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
