import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  cancelSummary,
  claimWorkspace,
  readSummary,
  removeCandidate,
  readWorkspace,
  readWorkspaceChanges,
  readSummaryChanges,
  workspaceVersion,
  summaryVersion,
  saveQuestions,
  saveSummarySettings,
  sendQuestion,
  startSummary,
} from "../../shared/quick-questions/contracts";
import { createStorage, publicWorkspace } from "./storage";
import { createJobs } from "./jobs";
import type { ModelStore } from "../models/storage";
import { LocalizedError } from "../../shared/chat-view/i18n";

export function registerQuickQuestions(
  server: PluginServerContext,
  models: ModelStore,
  readFeatures: () => Promise<{ quickQuestionsEnabled: boolean }>,
) {
  const storage = createStorage();
  const jobs = createJobs();
  async function publicData(workspaceId: string) {
    return {
      ...publicWorkspace(storage.read(workspaceId)),
      syncToken: storage.version(workspaceId),
      featureEnabled: (await readFeatures()).quickQuestionsEnabled,
      model: models.read(workspaceId).effectiveModel,
    };
  }
  server.handle(claimWorkspace, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    return { claimed: workspace !== null };
  });
  server.handle(readWorkspace, ({ workspaceId }) => publicData(workspaceId));
  server.handle(readWorkspaceChanges, async ({ workspaceId, known }) => {
    const data = await publicData(workspaceId);
    return workspaceVersion(data) === known ? null : data;
  });
  server.handle(readSummaryChanges, ({ workspaceId, known }) => {
    const job = jobs.read(workspaceId);
    const unchanged = summaryVersion(job) === known;
    return { unchanged, job: unchanged ? null : job };
  });
  server.handle(saveQuestions, ({ workspaceId, revision, questions, enabled }) => {
    storage.save(workspaceId, revision, (current) => ({ ...current, questions, enabled }));
    return publicData(workspaceId);
  });
  server.handle(saveSummarySettings, ({ workspaceId, revision, historyLimit, summaryPrompt }) => {
    storage.save(workspaceId, revision, (current) => ({
      ...current,
      historyLimit,
      summaryPrompt: summaryPrompt ?? current.summaryPrompt,
    }));
    return publicData(workspaceId);
  });
  server.handle(startSummary, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) throw new LocalizedError("quickQuestions.error.workspaceUnavailable");
    const settings = storage.read(workspaceId);
    return jobs.start(
      paseo,
      workspaceId,
      models.resolve(workspaceId),
      settings.historyLimit,
      settings.summaryPrompt,
    );
  });
  server.handle(removeCandidate, ({ workspaceId, jobId, candidateId }) =>
    jobs.removeCandidate(workspaceId, jobId, candidateId),
  );
  server.handle(readSummary, ({ workspaceId }) => jobs.read(workspaceId));
  server.handle(cancelSummary, ({ workspaceId }) => ({ canceled: jobs.cancel(workspaceId) }));
  server.handle(sendQuestion, async ({ workspaceId, agentId, text }, { paseo }) => {
    if (!(await readFeatures()).quickQuestionsEnabled || !storage.read(workspaceId).enabled)
      throw new LocalizedError("quickQuestions.error.featureDisabled");
    const agent = paseo.agents.ref(agentId);
    const result = await agent.refresh();
    if (!result || result.agent.workspaceId !== workspaceId)
      throw new LocalizedError("quickQuestions.error.conversationUnavailable");
    if (result.agent.status !== "idle" || result.agent.archivedAt)
      throw new LocalizedError("quickQuestions.error.waitIdle");
    await agent.send(text);
    return { sent: true };
  });
  return () => jobs.dispose();
}
