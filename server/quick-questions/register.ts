import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  cancelSummary,
  readSummary,
  removeCandidate,
  readWorkspace,
  saveQuestions,
  saveSummarySettings,
  sendQuestion,
  startSummary,
} from "../../shared/quick-questions/contracts";
import { createStorage, publicWorkspace } from "./storage";
import { createJobs } from "./jobs";
import type { ModelStore } from "../models/storage";

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
      featureEnabled: (await readFeatures()).quickQuestionsEnabled,
      model: models.read(workspaceId).effectiveModel,
    };
  }
  server.handle(readWorkspace, ({ workspaceId }) => publicData(workspaceId));
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
    if (!workspace) throw new Error("工作空间不存在或已不可用。");
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
      throw new Error("快捷提问已停用，请先在功能设置或当前工作区启用。");
    const agent = paseo.agents.ref(agentId);
    const result = await agent.refresh();
    if (!result || result.agent.workspaceId !== workspaceId)
      throw new Error("当前对话已不可用，请重新打开。");
    if (result.agent.status !== "idle" || result.agent.archivedAt)
      throw new Error("请等待对话空闲后发送。");
    await agent.send(text);
    return { sent: true };
  });
  return () => jobs.dispose();
}
