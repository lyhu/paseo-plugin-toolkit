import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { Job, Question } from "../../shared/quick-questions/contracts";
import { DEFAULT_HISTORY_LIMIT, isWorking } from "../../shared/quick-questions/contracts";
import type { Document } from "./storage";
import { summarize, type Evidence } from "./model";
import { readHistory, recentQuestions, type HistoryQuestion } from "./history";

import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";

interface Task {
  state: Job;
  controller: AbortController;
}
export function createJobs() {
  const tasks = new Map<string, Task>();
  async function run(
    task: Task,
    paseo: PaseoApi,
    workspaceId: string,
    model: Document["model"],
    historyLimit: number,
    summaryPrompt: string,
  ) {
    const signal = task.controller.signal;
    const state = task.state;
    function report(message: string, level: "info" | "success" | "error" = "info") {
      state.activity = message;
      state.events.push({ at: new Date().toISOString(), level, message });
      state.events = state.events.slice(-100);
    }
    try {
      report(`正在查找当前工作空间的对话（包含归档），选取最近 ${historyLimit} 条用户提问`);
      const agents = [];
      let cursor: string | undefined;
      do {
        checkCanceled(signal);
        const result = await paseo.agents.list({
          filter: { includeArchived: true },
          page: { limit: 200, cursor },
        });
        agents.push(
          ...result.entries
            .map((entry) => entry.agent)
            .filter((agent) => agent.workspaceId === workspaceId),
        );
        cursor = result.pageInfo.nextCursor ?? undefined;
      } while (cursor);
      state.total = agents.length;
      report(`找到 ${agents.length} 个对话，开始读取历史`);
      const history: HistoryQuestion[] = [];
      const batches: Evidence[][] = [];
      let batch: Evidence[] = [];
      let size = 0;
      function append(item: Evidence) {
        const length = JSON.stringify(item).length;
        if (batch.length && size + length > 14000) {
          batches.push(batch);
          batch = [];
          size = 0;
        }
        batch.push(item);
        size += length;
      }
      for (const agent of agents) {
        checkCanceled(signal);
        report(`正在读取 ${state.completed + 1}/${agents.length}：${agent.title || agent.id}`);
        try {
          const evidence = await readHistory(paseo.agents.ref(agent.id).timeline, agent.id, signal);
          history.push(...evidence);
          state.read += 1;
          report(`已读取 ${agent.title || agent.id}：${evidence.length} 条用户提问`, "success");
        } catch (error) {
          checkCanceled(signal);
          const reason =
            error instanceof Error ? error.message.slice(0, 240) : "提供商不可用或历史无法恢复";
          state.failed.push({ agentId: agent.id, title: agent.title || agent.id, reason });
          report(`读取失败：${agent.title || agent.id} · ${reason}`, "error");
        }
        state.completed += 1;
      }
      const selected = recentQuestions(history, historyLimit);
      state.messageCount = selected.length;
      report(`共读取 ${history.length} 条用户提问，选用最近 ${selected.length} 条参与总结`);
      for (const item of selected) append(item);
      if (batch.length) batches.push(batch);
      if (!batches.length) throw new Error("没有可总结的用户提问。请检查历史读取结果后重试。");
      state.phase = "summarizing";
      state.completed = 0;
      state.total = batches.length;
      let levels: Question[][] = [];
      for (const evidence of batches) {
        checkCanceled(signal);
        report(
          `正在使用 ${model.model} 总结第 ${state.completed + 1}/${batches.length} 批（${evidence.length} 条提问）`,
        );
        levels.push(
          await summarize(model, evidence, signal, {
            prompt: summaryPrompt,
            onRetry: (reason) =>
              report(
                `第 ${state.completed + 1}/${batches.length} 批格式校验失败：${reason} 正在自动重试 1/1`,
                "error",
              ),
          }),
        );
        state.completed += 1;
        report(`第 ${state.completed}/${batches.length} 批总结完成`, "success");
      }
      let round = 0;
      while (levels.length > 1) {
        round += 1;
        state.phase = "merging";
        state.completed = 0;
        state.total = Math.ceil(levels.length / 2);
        const next: Question[][] = [];
        for (let i = 0; i < levels.length; i += 2) {
          checkCanceled(signal);
          const pair = levels.slice(i, i + 2).flat();
          const evidence = pair.map((q, index) => ({
            id: `group-${index}`,
            text: q.text,
            context: "",
            frequency: q.frequency,
            sources: q.sources,
          }));
          report(
            `正在合并第 ${round} 轮 · ${state.completed + 1}/${state.total} 组（${pair.length} 条候选）`,
          );
          next.push(
            await summarize(model, evidence, signal, {
              prompt: summaryPrompt,
              onRetry: (reason) =>
                report(
                  `合并第 ${round} 轮第 ${state.completed + 1}/${state.total} 组格式校验失败：${reason} 正在自动重试 1/1`,
                  "error",
                ),
            }),
          );
          state.completed += 1;
        }
        levels = next;
      }
      checkCanceled(signal);
      state.candidates = levels[0];
      state.phase = "done";
      report(
        `总结完成：生成 ${state.candidates.length} 条候选，读取失败 ${state.failed.length} 个对话`,
        "success",
      );
    } catch (error) {
      if (signal.aborted) {
        state.phase = "canceled";
        report("总结已取消，已保存的快捷提问不受影响");
        return;
      }
      state.phase = "error";
      state.error = error instanceof Error ? error.message : "总结失败，请重试。";
      report(state.error, "error");
    }
  }
  return {
    read(workspaceId: string) {
      return tasks.get(workspaceId)?.state ?? null;
    },
    start(
      paseo: PaseoApi,
      workspaceId: string,
      model: Document["model"],
      historyLimit = DEFAULT_HISTORY_LIMIT,
      summaryPrompt = DEFAULT_SUMMARY_PROMPT,
    ) {
      if (isWorking(tasks.get(workspaceId)?.state))
        throw new Error("此工作空间正在总结，请等待或取消当前任务。");
      if (!model.baseUrl || !model.model)
        throw new Error("请先保存总结模型的 API 地址和模型名称。");
      const task: Task = {
        controller: new AbortController(),
        state: {
          id: randomUUID(),
          phase: "reading",
          completed: 0,
          total: 0,
          read: 0,
          failed: [],
          activity: "正在启动总结",
          events: [],
          messageCount: 0,
          candidates: [],
          error: "",
        },
      };
      tasks.set(workspaceId, task);
      void run(task, paseo, workspaceId, model, historyLimit, summaryPrompt);
      return task.state;
    },
    removeCandidate(workspaceId: string, jobId: string, candidateId: string) {
      const task = tasks.get(workspaceId);
      if (!task || task.state.id !== jobId || task.state.phase !== "done")
        throw new Error("候选任务已更新或尚未完成，请刷新后重试。");
      task.state.candidates = task.state.candidates.filter(
        (question) => question.id !== candidateId,
      );
      return task.state;
    },
    cancel(workspaceId: string) {
      const task = tasks.get(workspaceId);
      if (!task || !isWorking(task.state)) return false;
      task.controller.abort();
      task.state.phase = "canceled";
      task.state.activity = "总结已取消，已保存的快捷提问不受影响";
      return true;
    },
    dispose() {
      for (const task of tasks.values()) task.controller.abort();
      tasks.clear();
    },
  };
}

function checkCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new Error("已取消总结");
}
