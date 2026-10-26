import { randomUUID } from "node:crypto";
import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import type { TitleJob, TitleResult, TitleSettings } from "../../shared/session-title/contracts";
import { validTitle, working } from "../../shared/session-title/contracts";
import { createChatClient, type ChatClient } from "../models/chat-client";
import type { ModelStore } from "../models/storage";
import { analyzeConversation } from "./model";
import { checkCanceled, readConversation } from "./history";
import { renameSession } from "./rename";
import type { TitleStore } from "./storage";

function safeError(error: unknown) {
  return error instanceof Error && /^[\u3400-\u9fff]/u.test(error.message)
    ? error.message
    : "模型请求失败，请检查 Toolkit 模型配置后重试。";
}
export function createTitleService(options: {
  store: TitleStore;
  models: Pick<ModelStore, "resolve">;
  settings(): Promise<TitleSettings>;
  rename?: typeof renameSession;
  client?: (workspaceId: string | null) => ChatClient;
}) {
  const tasks = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const jobs = new Map<string, TitleJob>();
  const versions = new Map<string, number>();
  const recovering = new Set<string>();
  let disposed = false;
  function saveJob(id: string, job: TitleJob) {
    options.store.update(id, (state) => ({
      ...state,
      agentId: id,
      jobs: state.jobs.some((entry) => entry.id === job.id)
        ? state.jobs.map((entry) => (entry.id === job.id ? job : entry))
        : [...state.jobs, job],
    }));
  }
  function newJob(id: string, source: TitleJob["source"]): TitleJob {
    const job: TitleJob = {
      id: randomUUID(),
      source,
      at: new Date().toISOString(),
      phase: source === "archive" ? "queued" : "reading",
      completed: 0,
      total: 0,
      error: null,
      result: null,
    };
    jobs.set(id, job);
    saveJob(id, job);
    return job;
  }
  const invalidate = (id: string) => {
    versions.set(id, (versions.get(id) ?? 0) + 1);
    tasks.get(id)?.controller.abort();
    const job = jobs.get(id) ?? options.store.read(id).jobs.at(-1);
    if (job && working(job)) {
      job.phase = "canceled";
      saveJob(id, job);
    }
  };
  const read = (id: string) => {
    const state = options.store.read(id);
    return {
      job: jobs.get(id) ?? state.jobs.at(-1) ?? null,
      history: state.jobs,
      result: state.result,
      protected: state.protected,
      rounds: state.rounds,
      error: state.error,
    };
  };
  const ensureIdle = async (paseo: PaseoApi, id: string, allowArchived = false) => {
    const snapshot = await paseo.agents.ref(id).refresh();
    if (!snapshot) throw new Error("会话不可用，请刷新后重试。");
    if (
      snapshot.agent.activeTurn ||
      (snapshot.agent.status !== "idle" && (!allowArchived || !snapshot.agent.archivedAt))
    )
      throw new Error("请等待当前会话执行完成后再总结。");
    return snapshot.agent;
  };
  const client = (workspaceId: string | null) => {
    if (options.client) return options.client(workspaceId);
    const config = options.models.resolve(workspaceId ?? undefined);
    if (!config.baseUrl || !config.model) throw new Error("请先配置 Toolkit 共用 AI 模型。");
    return createChatClient(config);
  };
  function enqueue(id: string, work: (signal: AbortSignal, version: number) => Promise<void>) {
    const prior = tasks.get(id)?.done;
    const controller = new AbortController();
    const version = versions.get(id) ?? 0;
    const done = Promise.resolve(prior)
      .catch(() => {})
      .then(async () => {
        if (disposed || controller.signal.aborted) return;
        await work(controller.signal, version);
      })
      .finally(() => {
        if (tasks.get(id)?.controller === controller) tasks.delete(id);
      });
    tasks.set(id, { controller, done });
    return done;
  }
  async function fresh(
    paseo: PaseoApi,
    result: TitleResult,
    signal: AbortSignal,
    allowArchived = false,
  ) {
    const agent = await ensureIdle(paseo, result.agentId, allowArchived);
    if ((agent.workspaceId ?? null) !== result.workspaceId || agent.title !== result.previousTitle)
      throw new Error("会话标题已变化，请重新生成预览。");
    const history = await readConversation(paseo.agents.ref(result.agentId).timeline, signal);
    if (history.fingerprint !== result.fingerprint)
      throw new Error("会话内容已变化，请重新生成预览。");
    checkCanceled(signal);
    return agent;
  }
  async function generate(
    paseo: PaseoApi,
    id: string,
    signal: AbortSignal,
    settings: TitleSettings,
    job?: TitleJob,
    allowArchived = false,
  ) {
    const agent = await ensureIdle(paseo, id, allowArchived);
    options.store.update(id, (state) => ({
      ...state,
      agentId: id,
      workspaceId: agent.workspaceId ?? null,
      archivedAt: agent.archivedAt ?? null,
      title: agent.title,
    }));
    const history = await readConversation(paseo.agents.ref(id).timeline, signal);
    if (job) job.phase = "summarizing";
    const analysis = await analyzeConversation({
      history,
      previousTitle: agent.title,
      maxLength: settings.maxLength,
      client: client(agent.workspaceId ?? null),
      signal,
      progress: (completed, total) => {
        if (job) {
          job.completed = completed;
          job.total = total;
        }
      },
    });
    return {
      id: randomUUID(),
      agentId: id,
      workspaceId: agent.workspaceId ?? null,
      previousTitle: agent.title,
      fingerprint: history.fingerprint,
      messages: history.messages.length,
      through: history.through,
      at: new Date().toISOString(),
      applied: false,
      analysis,
    } satisfies TitleResult;
  }
  async function checkArchive(paseo: PaseoApi, id: string) {
    const request = options.store.read(id).archiveRequest;
    const agent = await ensureIdle(paseo, id, true);
    if (
      !request ||
      !agent.archivedAt ||
      agent.archivedAt !== request.archivedAt ||
      agent.title !== request.title ||
      (agent.lastUserMessageAt ?? null) !== request.lastUserMessageAt
    )
      throw new Error("归档会话已变化，后台任务已停止，请重新命名。");
  }
  function runTitle(paseo: PaseoApi, id: string, job: TitleJob) {
    return enqueue(id, async (signal) => {
      try {
        if (job.source === "archive") await checkArchive(paseo, id);
        job.phase = "reading";
        const result = await generate(paseo, id, signal, await options.settings(), job, true);
        checkCanceled(signal);
        options.store.update(id, (state) => ({ ...state, result, error: null }));
        job.result = result;
        job.phase = "applying";
        await fresh(paseo, result, signal, true);
        if (job.source === "archive") await checkArchive(paseo, id);
        const settings = await options.settings();
        if (!validTitle(result.analysis.title, settings.maxLength))
          throw new Error("推荐标题超过长度限制或格式无效，原标题已保留。");
        await (options.rename ?? renameSession)(id, result.analysis.title, signal);
        job.result = { ...result, applied: true };
        options.store.update(id, (state) => ({
          ...state,
          title: result.analysis.title,
          protected: true,
          result: job.result,
          error: null,
        }));
        job.phase = "done";
      } catch (error) {
        job.phase = signal.aborted
          ? disposed && job.source === "archive"
            ? "queued"
            : "canceled"
          : "error";
        job.error = signal.aborted ? null : safeError(error);
        if (!signal.aborted) options.store.update(id, (state) => ({ ...state, error: job.error }));
      } finally {
        if (!(disposed && job.source === "archive"))
          options.store.update(id, (state) => ({
            ...state,
            archiveRequest: state.archiveRequest?.jobId === job.id ? null : state.archiveRequest,
          }));
        saveJob(id, job);
      }
    }).catch(() => {
      job.phase = "error";
      job.error = "会话总结保存失败，请重试。";
    });
  }
  // A normal in-flight request cannot be replayed safely after a reload. Durable archive intents can.
  for (const state of options.store.list()) {
    const id = state.agentId ?? state.result?.agentId;
    if (!id) continue;
    for (const job of state.jobs)
      if (working(job) && state.archiveRequest?.jobId !== job.id) {
        job.phase = "error";
        job.error = "命名任务因插件重载中断，可重新命名。";
        saveJob(id, job);
      }
  }
  return {
    read,
    list(workspaceId: string) {
      return options.store
        .list()
        .filter(
          (state) =>
            (state.workspaceId ?? state.result?.workspaceId) === workspaceId &&
            (state.agentId || state.result?.agentId),
        )
        .map((state) => {
          const job = jobs.get(state.agentId ?? state.result!.agentId) ?? state.jobs.at(-1);
          return {
            agentId: state.agentId ?? state.result!.agentId,
            title: state.title,
            archived: Boolean(state.archivedAt),
            runs: state.jobs.length,
            at: job?.at ?? state.result?.at ?? null,
            phase: job?.phase ?? null,
          };
        })
        .sort(
          (a, b) => (b.at ?? "").localeCompare(a.at ?? "") || a.agentId.localeCompare(b.agentId),
        );
    },
    created(id: string, title: string | null, workspaceId: string | null = null) {
      options.store.update(id, (state) => ({
        ...state,
        agentId: id,
        workspaceId,
        observedCreation: true,
        title,
      }));
    },
    archived(id: string, at: string, paseo?: PaseoApi) {
      const state = options.store.update(id, (value) => ({
        ...value,
        archivedAt: at,
        archiveRequest: value.archiveRequest
          ? { ...value.archiveRequest, archivedAt: value.archiveRequest.archivedAt ?? at }
          : null,
      }));
      if (!state.archiveRequest) return invalidate(id);
      if (!paseo || disposed || recovering.has(id)) return;
      const job = state.jobs.find((entry) => entry.id === state.archiveRequest!.jobId);
      if (job?.phase === "queued") {
        job.phase = "reading";
        saveJob(id, job);
        jobs.set(id, job);
        void runTitle(paseo, id, job);
      }
    },
    invalidate,
    async automatic(paseo: PaseoApi, id: string) {
      const settings = await options.settings();
      const initial = options.store.read(id);
      if (initial.archiveRequest) return;
      if (!settings.enabled || initial.protected || initial.rounds >= settings.rounds || disposed)
        return;
      if (working(jobs.get(id)) && jobs.get(id)?.source === "command") return;
      // Unknown old sessions cannot reliably recover completion/retry boundaries from text alone.
      if (!initial.observedCreation) return;
      return enqueue(id, async (signal, version) => {
        let job: TitleJob | undefined;
        try {
          const state = options.store.read(id);
          if (state.rounds >= settings.rounds || state.protected) return;
          const agent = await ensureIdle(paseo, id);
          if (agent.archivedAt) return;
          const history = await readConversation(paseo.agents.ref(id).timeline, signal);
          if (state.epoch && state.epoch !== history.epoch) {
            options.store.update(id, (value) => ({ ...value, protected: true }));
            return;
          }
          const users = history.messages.filter((message) => message.role === "user");
          const request = users.at(-1);
          if (
            !request ||
            request.key === state.lastRequest ||
            !history.messages.some(
              (message) => message.role === "assistant" && message.seq > request.seq,
            )
          )
            return;
          // Multiple unseen prompts might be automated or missed turns: stop rather than reset the window.
          const previous =
            state.lastRequest === null
              ? -1
              : users.findIndex((message) => message.key === state.lastRequest);
          if ((state.lastRequest !== null && previous < 0) || users.length - previous - 1 !== 1) {
            options.store.update(id, (value) => ({ ...value, protected: true }));
            return;
          }
          const provisional = users[0]!.text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean)
            ?.replace(/\s+/g, " ")
            .slice(0, 60)
            .trim();
          const firstDefaultTitle =
            state.rounds === 0 && (agent.title === null || agent.title === provisional);
          if (
            (!firstDefaultTitle && state.rounds === 0 && agent.title !== null) ||
            (state.rounds > 0 && agent.title !== state.title)
          ) {
            options.store.update(id, (value) => ({ ...value, protected: true }));
            return;
          }
          options.store.update(id, (value) => ({
            ...value,
            rounds: value.rounds + 1,
            epoch: history.epoch,
            lastRequest: request.key,
            title: agent.title,
            error: null,
          }));
          job = newJob(id, "automatic");
          const result = await generate(paseo, id, signal, settings, job);
          checkCanceled(signal);
          if (versions.get(id) !== undefined && versions.get(id) !== version) {
            job.phase = "canceled";
            return;
          }
          // Re-read settings after the model: disabling the feature must cancel the pending write.
          const currentSettings = await options.settings();
          if (
            !currentSettings.enabled ||
            !validTitle(result.analysis.title, currentSettings.maxLength)
          ) {
            job.phase = "canceled";
            return;
          }
          await fresh(paseo, result, signal);
          job.result = result;
          options.store.update(id, (value) => ({ ...value, result, error: null }));
          if (result.analysis.changed || state.rounds === 0) {
            job.phase = "applying";
            await (options.rename ?? renameSession)(id, result.analysis.title, signal);
            job.result = { ...result, applied: true };
            options.store.update(id, (value) => ({
              ...value,
              title: result.analysis.title,
              result: { ...result, applied: true },
              error: null,
            }));
          }
          job.phase = "done";
        } catch (error) {
          if (job) {
            job.phase = signal.aborted ? "canceled" : "error";
            job.error = signal.aborted ? null : safeError(error);
          }
          if (!signal.aborted)
            options.store.update(id, (state) => ({ ...state, error: safeError(error) }));
        } finally {
          if (job) saveJob(id, job);
        }
      });
    },
    async start(paseo: PaseoApi, id: string) {
      if (disposed) throw new Error("会话总结服务已停止。");
      if (working(jobs.get(id)) && jobs.get(id)?.source !== "automatic") return jobs.get(id)!;
      invalidate(id);
      const job = newJob(id, "command");
      void runTitle(paseo, id, job);
      return job;
    },
    async archive(paseo: PaseoApi, id: string) {
      if (disposed) throw new Error("会话总结服务已停止。");
      const initial = options.store.read(id);
      if (initial.archiveRequest) {
        await this.recover(paseo);
        return { archived: Boolean(options.store.read(id).archivedAt) };
      }
      const agent = await ensureIdle(paseo, id, true);
      if (agent.archivedAt) return { archived: true };
      if (options.store.read(id).archiveRequest) return { archived: false };
      recovering.add(id);
      invalidate(id);
      const job = newJob(id, "archive");
      options.store.update(id, (state) => ({
        ...state,
        workspaceId: agent.workspaceId ?? null,
        title: agent.title,
        archiveRequest: {
          jobId: job.id,
          title: agent.title,
          lastUserMessageAt: agent.lastUserMessageAt ?? null,
          archivedAt: null,
        },
      }));
      try {
        const archived = await paseo.agents.ref(id).archive();
        options.store.update(id, (state) => ({
          ...state,
          archivedAt: archived.archivedAt,
          archiveRequest: state.archiveRequest
            ? { ...state.archiveRequest, archivedAt: archived.archivedAt }
            : null,
        }));
        void runTitle(paseo, id, job);
        return { archived: true };
      } catch {
        // A timed-out acknowledgement does not prove the archive failed. Verify without repeating it.
        let actual: PaseoAgent | undefined;
        try {
          actual = (await paseo.agents.ref(id).refresh())?.agent;
        } catch {
          /* Keep the durable intent for recovery. */
        }
        if (actual?.archivedAt) {
          options.store.update(id, (state) => ({
            ...state,
            archivedAt: actual.archivedAt ?? null,
            archiveRequest: state.archiveRequest
              ? { ...state.archiveRequest, archivedAt: actual.archivedAt ?? null }
              : null,
          }));
          void runTitle(paseo, id, job);
          return { archived: true };
        }
        job.phase = "error";
        job.error = "会话归档未完成，请检查连接后重试。";
        saveJob(id, job);
        options.store.update(id, (state) => ({
          ...state,
          archiveRequest: actual ? null : state.archiveRequest,
          error: job.error,
        }));
        throw new Error(job.error);
      } finally {
        recovering.delete(id);
      }
    },
    async queueClear(paseo: PaseoApi, id: string) {
      if (disposed) throw new Error("会话总结服务已停止。");
      const agent = await ensureIdle(paseo, id);
      if (agent.archivedAt) throw new Error("会话不可用，请刷新后重试。");
      const initial = options.store.read(id);
      if (initial.archiveRequest) {
        const pending = initial.jobs.find((entry) => entry.id === initial.archiveRequest!.jobId);
        if (pending && working(pending)) return pending;
      }
      invalidate(id);
      // The native /clear command owns archiving and navigation. This only persists naming work.
      const job = newJob(id, "archive");
      options.store.update(id, (state) => ({
        ...state,
        workspaceId: agent.workspaceId ?? null,
        title: agent.title,
        archiveRequest: {
          jobId: job.id,
          title: agent.title,
          lastUserMessageAt: agent.lastUserMessageAt ?? null,
          archivedAt: null,
        },
      }));
      return job;
    },
    async recover(paseo: PaseoApi) {
      if (disposed) return { resumed: 0 };
      let resumed = 0;
      for (const state of options.store.list()) {
        const id = state.agentId;
        if (!id || !state.archiveRequest || tasks.has(id) || recovering.has(id)) continue;
        const job = state.jobs.find((entry) => entry.id === state.archiveRequest!.jobId);
        if (!job) continue;
        recovering.add(id);
        let inspected = false;
        try {
          const agent = await ensureIdle(paseo, id, true);
          inspected = true;
          if (
            !agent.archivedAt ||
            (state.archiveRequest.archivedAt &&
              state.archiveRequest.archivedAt !== agent.archivedAt) ||
            agent.title !== state.archiveRequest.title ||
            (agent.lastUserMessageAt ?? null) !== state.archiveRequest.lastUserMessageAt
          )
            throw new Error("归档结果需要核对，请确认会话状态后重试。");
          options.store.update(id, (value) => ({
            ...value,
            archivedAt: agent.archivedAt ?? null,
            archiveRequest: value.archiveRequest
              ? { ...value.archiveRequest, archivedAt: agent.archivedAt ?? null }
              : null,
          }));
          jobs.set(id, job);
          job.phase = "queued";
          job.error = null;
          void runTitle(paseo, id, job);
          resumed++;
        } catch {
          job.phase = "error";
          job.error = "归档结果需要核对，请确认会话状态后重试。";
          saveJob(id, job);
          options.store.update(id, (value) => ({
            ...value,
            archiveRequest: inspected ? null : value.archiveRequest,
            error: job.error,
          }));
        } finally {
          recovering.delete(id);
        }
      }
      return { resumed };
    },
    cancel(id: string, jobId?: string) {
      const state = options.store.read(id);
      const current = jobs.get(id) ?? state.jobs.at(-1);
      // Failed client submission may only abandon its own not-yet-archived intent.
      if (jobId && (current?.id !== jobId || state.archiveRequest?.archivedAt)) return false;
      const active = tasks.has(id) || working(current);
      invalidate(id);
      options.store.update(id, (state) => ({ ...state, archiveRequest: null }));
      const job = jobs.get(id);
      if (job && working(job)) job.phase = "canceled";
      return active;
    },
    async apply(paseo: PaseoApi, id: string, resultId: string) {
      if (tasks.has(id)) throw new Error("总结正在处理，请稍后重试。");
      const result = options.store.read(id).result;
      if (!result || result.id !== resultId) throw new Error("会话总结已变化，请刷新后重试。");
      if (result.applied) throw new Error("此推荐标题已应用，无需重复操作。");
      let applied = false;
      await enqueue(id, async (signal) => {
        const settings = await options.settings();
        if (!validTitle(result.analysis.title, settings.maxLength))
          throw new Error("推荐标题超过长度限制或格式无效，原标题已保留。");
        await fresh(paseo, result, signal, true);
        await (options.rename ?? renameSession)(id, result.analysis.title, signal);
        options.store.update(id, (state) => ({
          ...state,
          title: result.analysis.title,
          protected: true,
          result: { ...result, applied: true },
          error: null,
        }));
        const job = jobs.get(id);
        if (job?.result?.id === result.id) {
          job.result = { ...result, applied: true };
          job.phase = "done";
          job.error = null;
          saveJob(id, job);
        }
        applied = true;
      });
      return { applied };
    },
    async dispose() {
      disposed = true;
      for (const task of tasks.values()) task.controller.abort();
      await Promise.allSettled([...tasks.values()].map((task) => task.done));
    },
    async settled(id: string) {
      await tasks.get(id)?.done;
    },
  };
}
