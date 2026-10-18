import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { Job, Question } from "../../shared/quick-questions/contracts";
import { LocalizedError, localized, type LocalizedMessage } from "../../shared/chat-view/i18n";
import type { ModelConnection } from "../../shared/models/contracts";
import { DEFAULT_HISTORY_LIMIT, isWorking } from "../../shared/quick-questions/contracts";
import { summarize, type Evidence } from "./model";
import { readHistory, recentQuestions, type HistoryQuestion } from "./history";

import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";

interface Task {
  state: Job;
  controller: AbortController;
  accessedAt: number;
}
export function createJobs() {
  const tasks = new Map<string, Task>();
  let pruneTimer: ReturnType<typeof setTimeout> | undefined;
  const prune = () => {
    clearTimeout(pruneTimer);
    const idle = [...tasks]
      .filter(([, task]) => !isWorking(task.state))
      .sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    while (idle.length && (idle.length > 32 || Date.now() - idle[0]![1].accessedAt >= 1800000)) {
      tasks.delete(idle.shift()![0]);
    }
    if (idle.length)
      pruneTimer = setTimeout(prune, Math.max(1, 1800000 - (Date.now() - idle[0]![1].accessedAt)));
  };
  async function run(
    task: Task,
    paseo: PaseoApi,
    workspaceId: string,
    model: ModelConnection,
    historyLimit: number,
    summaryPrompt: string,
  ) {
    const signal = task.controller.signal;
    const state = task.state;
    function report(message: LocalizedMessage, level: "info" | "success" | "error" = "info") {
      state.revision++;
      task.accessedAt = Date.now();
      state.activity = message;
      state.events.push({ at: new Date().toISOString(), level, message });
      state.events = state.events.slice(-100);
    }
    try {
      report(localized("quickQuestions.activity.finding", { limit: historyLimit }));
      const agents = [];
      let cursor: string | undefined;
      do {
        checkCanceled(signal);
        const result = await paseo.agents.list({
          filter: { includeArchived: true },
          page: { limit: 200, cursor },
          signal,
        });
        agents.push(
          ...result.entries
            .map((entry) => entry.agent)
            .filter((agent) => agent.workspaceId === workspaceId)
            .map((agent) => ({ id: agent.id, title: agent.title })),
        );
        cursor = result.pageInfo.nextCursor ?? undefined;
      } while (cursor);
      state.total = agents.length;
      report(localized("quickQuestions.activity.found", { count: agents.length }));
      let history: HistoryQuestion[] = [];
      let historyCount = 0;
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
        report(
          localized("quickQuestions.activity.reading", {
            current: state.completed + 1,
            total: agents.length,
            title: agent.title || agent.id,
          }),
        );
        try {
          let count = 0;
          const evidence = await readHistory(
            paseo.agents.ref(agent.id).timeline,
            agent.id,
            signal,
            {
              limit: historyLimit,
              onRead: (total) => {
                count = total;
              },
            },
          );
          historyCount += count;
          history = recentQuestions([...history, ...evidence], historyLimit);
          state.read += 1;
          report(
            localized("quickQuestions.activity.read", {
              title: agent.title || agent.id,
              count,
            }),
            "success",
          );
        } catch (error) {
          checkCanceled(signal);
          const reason =
            error instanceof LocalizedError
              ? localized(error.key, error.params, error.suffix)
              : localized("quickQuestions.error.historyReadFailed", {
                  detail: error instanceof Error ? error.message.slice(0, 240) : String(error),
                });
          state.failed.push({ agentId: agent.id, title: agent.title || agent.id, reason });
          report(
            localized("quickQuestions.activity.readFailed", { title: agent.title || agent.id }),
            "error",
          );
        }
        state.completed += 1;
      }
      const selected = recentQuestions(history, historyLimit);
      state.messageCount = selected.length;
      report(
        localized("quickQuestions.activity.selected", {
          total: historyCount,
          selected: selected.length,
        }),
      );
      for (const item of selected) append(item);
      if (batch.length) batches.push(batch);
      if (!batches.length) throw new LocalizedError("quickQuestions.error.noQuestions");
      state.phase = "summarizing";
      state.completed = 0;
      state.total = batches.length;
      let levels: Question[][] = [];
      for (const evidence of batches) {
        checkCanceled(signal);
        report(
          localized("quickQuestions.activity.summarizing", {
            model: model.model,
            current: state.completed + 1,
            total: batches.length,
            count: evidence.length,
          }),
        );
        levels.push(
          await summarize(model, evidence, signal, {
            prompt: summaryPrompt,
            onRetry: () =>
              report(
                localized("quickQuestions.activity.batchRetry", {
                  current: state.completed + 1,
                  total: batches.length,
                }),
                "error",
              ),
          }),
        );
        state.completed += 1;
        report(
          localized("quickQuestions.activity.batchDone", {
            current: state.completed,
            total: batches.length,
          }),
          "success",
        );
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
            localized("quickQuestions.activity.merging", {
              round,
              current: state.completed + 1,
              total: state.total,
              count: pair.length,
            }),
          );
          next.push(
            await summarize(model, evidence, signal, {
              prompt: summaryPrompt,
              onRetry: () =>
                report(
                  localized("quickQuestions.activity.mergeRetry", {
                    round,
                    current: state.completed + 1,
                    total: state.total,
                  }),
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
        localized("quickQuestions.activity.done", {
          count: state.candidates.length,
          failed: state.failed.length,
        }),
        "success",
      );
    } catch (error) {
      if (signal.aborted) {
        state.phase = "canceled";
        report(localized("quickQuestions.activity.canceled"));
        return;
      }
      state.phase = "error";
      state.error =
        error instanceof LocalizedError
          ? localized(error.key, error.params, error.suffix)
          : localized("quickQuestions.error.summaryFailed", {
              detail: error instanceof Error ? error.message : String(error),
            });
      report(state.error, "error");
    }
  }
  return {
    read(workspaceId: string) {
      prune();
      const task = tasks.get(workspaceId);
      if (task) task.accessedAt = Date.now();
      return task?.state ?? null;
    },
    start(
      paseo: PaseoApi,
      workspaceId: string,
      model: ModelConnection,
      historyLimit = DEFAULT_HISTORY_LIMIT,
      summaryPrompt = DEFAULT_SUMMARY_PROMPT,
    ) {
      if (isWorking(tasks.get(workspaceId)?.state))
        throw new LocalizedError("quickQuestions.error.summaryRunning");
      if (!model.baseUrl || !model.model)
        throw new LocalizedError("quickQuestions.error.modelNotConfigured");
      prune();
      const task: Task = {
        accessedAt: Date.now(),
        controller: new AbortController(),
        state: {
          revision: 0,
          id: randomUUID(),
          phase: "reading",
          completed: 0,
          total: 0,
          read: 0,
          failed: [],
          activity: localized("quickQuestions.activity.starting"),
          events: [],
          messageCount: 0,
          candidates: [],
          error: null,
        },
      };
      tasks.set(workspaceId, task);
      void run(task, paseo, workspaceId, model, historyLimit, summaryPrompt).finally(prune);
      return task.state;
    },
    removeCandidate(workspaceId: string, jobId: string, candidateId: string) {
      const task = tasks.get(workspaceId);
      if (!task || task.state.id !== jobId || task.state.phase !== "done")
        throw new LocalizedError("quickQuestions.error.candidateStale");
      task.state.revision++;
      task.accessedAt = Date.now();
      task.state.candidates = task.state.candidates.filter(
        (question) => question.id !== candidateId,
      );
      return task.state;
    },
    cancel(workspaceId: string) {
      const task = tasks.get(workspaceId);
      if (!task || !isWorking(task.state)) return false;
      task.controller.abort();
      task.state.revision++;
      task.accessedAt = Date.now();
      task.state.phase = "canceled";
      task.state.activity = localized("quickQuestions.activity.canceled");
      return true;
    },
    dispose() {
      for (const task of tasks.values()) task.controller.abort();
      tasks.clear();
      clearTimeout(pruneTimer);
    },
  };
}

function checkCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new LocalizedError("quickQuestions.error.canceled");
}
