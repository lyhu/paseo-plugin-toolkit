import { randomUUID } from "node:crypto";
import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import type { TitleJob, TitleResult, TitleSettings } from "../../shared/session-title/contracts";
import { validTitle, working } from "../../shared/session-title/contracts";
import { createChatClient, type ChatClient } from "../models/chat-client";
import type { ModelStore } from "../models/storage";
import { endpointLabel, type TitleFailureEvent, type TitleTrace } from "./failure-log";
import { analyzeConversation } from "./model";
import {
  InvalidTitleError,
  TITLE_MESSAGES,
  TitleFailureError,
  type TitleFailureReason,
  type TitleFailureStage,
} from "./errors";
import { checkCanceled, readConversation, type History } from "./history";
import { renameSession } from "./rename";
import type { TitleStore } from "./storage";
import { ProviderFailure } from "../../shared/models/failure";

function safeError(error: unknown) {
  if (error instanceof ProviderFailure && error.kind === "truncatedOutput")
    return TITLE_MESSAGES.truncated;
  if (error instanceof TitleFailureError) return error.message;
  return error instanceof Error && /^[\u3400-\u9fff]/u.test(error.message)
    ? error.message
    : TITLE_MESSAGES.modelFailed;
}

function titleStage(phase: TitleJob["phase"], fallback: TitleFailureStage): TitleFailureStage {
  switch (phase) {
    case "queued":
      return "archive";
    case "reading":
      return "reading";
    case "summarizing":
      return "summarizing";
    case "applying":
      return "applying";
    default:
      return fallback;
  }
}
export function createTitleService(options: {
  store: TitleStore;
  models: Pick<ModelStore, "resolve">;
  settings(): Promise<TitleSettings>;
  rename?: typeof renameSession;
  client?: (workspaceId: string | null) => ChatClient;
  onFailure?: (failure: TitleFailureEvent) => void;
}) {
  const tasks = new Map<string, { controller: AbortController; done: Promise<void> }>();
  const jobs = new Map<string, TitleJob>();
  const versions = new Map<string, number>();
  const recovering = new Set<string>();
  const blocked = new Set(
    options.store
      .list()
      .filter((state) => state.deleting)
      .map((state) => state.agentId!),
  );
  let disposed = false;
  function report(failure: TitleFailureEvent) {
    try {
      options.onFailure?.(failure);
    } catch {
      // 诊断写入失败不能改变命名行为。
    }
  }
  function failure(input: {
    id: string;
    job?: TitleJob | null;
    stage: TitleFailureStage;
    error: unknown;
    message: string;
    outcome?: "failed" | "skipped";
    secondary?: boolean;
    settings?: TitleSettings;
    trace?: TitleTrace;
    reason?: TitleFailureReason;
    title?: TitleFailureEvent["title"];
  }): TitleFailureEvent {
    let state: ReturnType<TitleStore["read"]> | null = null;
    try {
      state = options.store.read(input.id);
    } catch {
      // 即使会话文档读不到，也保留这次失败。
    }
    return {
      agentId: input.id,
      workspaceId: state?.workspaceId ?? state?.result?.workspaceId ?? null,
      job: input.job ?? null,
      stage: input.stage,
      reason: input.reason,
      error: input.error,
      message: input.message,
      outcome: input.outcome,
      secondary: input.secondary,
      durationMs: input.job?.at ? Math.max(0, Date.now() - Date.parse(input.job.at)) : undefined,
      settings: input.settings,
      rounds: state?.rounds,
      title: input.title ?? null,
      trace: input.trace,
    };
  }
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
    if (blocked.has(id)) return;
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
    if (blocked.has(id)) throw new TitleFailureError("session.deleting", TITLE_MESSAGES.deleting);
    const snapshot = await paseo.agents
      .ref(id)
      .refresh()
      .catch((error) => {
        throw new TitleFailureError("session.unavailable", TITLE_MESSAGES.unavailable, {
          cause: error,
        });
      });
    if (!snapshot) throw new TitleFailureError("session.unavailable", TITLE_MESSAGES.unavailable);
    if (
      snapshot.agent.activeTurn ||
      (snapshot.agent.status !== "idle" && (!allowArchived || !snapshot.agent.archivedAt))
    )
      throw new TitleFailureError("session.busy", TITLE_MESSAGES.busy);
    return snapshot.agent;
  };
  const client = (workspaceId: string | null, trace?: TitleTrace) => {
    if (options.client) return options.client(workspaceId);
    const config = options.models.resolve(workspaceId ?? undefined);
    if (!config.baseUrl || !config.model)
      throw new TitleFailureError("config.model", TITLE_MESSAGES.missingModel);
    if (trace) {
      trace.model = config.model;
      trace.endpoint = endpointLabel(config.baseUrl);
    }
    return createChatClient(config);
  };
  function enqueue(id: string, work: (signal: AbortSignal, version: number) => Promise<void>) {
    if (blocked.has(id)) throw new TitleFailureError("session.deleting", TITLE_MESSAGES.deleting);
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
      throw new TitleFailureError("session.titleChanged", TITLE_MESSAGES.titleChanged);
    const history = await readConversation(paseo.agents.ref(result.agentId).timeline, signal);
    if (history.fingerprint !== result.fingerprint)
      throw new TitleFailureError("session.contentChanged", TITLE_MESSAGES.contentChanged);
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
    existingHistory?: History,
    trace?: TitleTrace,
  ) {
    const agent = await ensureIdle(paseo, id, allowArchived);
    options.store.update(id, (state) => ({
      ...state,
      agentId: id,
      workspaceId: agent.workspaceId ?? null,
      archivedAt: agent.archivedAt ?? null,
      title: agent.title,
    }));
    const history =
      existingHistory ?? (await readConversation(paseo.agents.ref(id).timeline, signal));
    if (trace) trace.history = { messages: history.messages.length, through: history.through };
    if (job) job.phase = "summarizing";
    const analysis = await analyzeConversation({
      history,
      previousTitle: agent.title,
      maxLength: settings.maxLength,
      client: client(agent.workspaceId ?? null, trace),
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
      throw new TitleFailureError("archive.changed", TITLE_MESSAGES.archivedChanged);
  }
  function runTitle(paseo: PaseoApi, id: string, job: TitleJob) {
    let reported = false;
    return enqueue(id, async (signal) => {
      const trace: TitleTrace = {};
      let currentSettings: TitleSettings | undefined;
      try {
        if (job.source === "archive") await checkArchive(paseo, id);
        job.phase = "reading";
        currentSettings = await options.settings();
        const result = await generate(
          paseo,
          id,
          signal,
          currentSettings,
          job,
          true,
          undefined,
          trace,
        );
        checkCanceled(signal);
        options.store.update(id, (state) => ({ ...state, result, error: null }));
        job.result = result;
        job.phase = "applying";
        await fresh(paseo, result, signal, true);
        if (job.source === "archive") await checkArchive(paseo, id);
        const settings = await options.settings();
        currentSettings = settings;
        if (!validTitle(result.analysis.title, settings.maxLength))
          throw new InvalidTitleError(result.analysis.title, settings.maxLength);
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
        const stage = titleStage(job.phase, "start");
        const aborted = signal.aborted;
        const message = aborted ? null : safeError(error);
        job.phase = aborted
          ? disposed && job.source === "archive"
            ? "queued"
            : "canceled"
          : "error";
        job.error = message;
        if (!aborted) {
          reported = true;
          report(
            failure({
              id,
              job,
              stage,
              error,
              message: message!,
              settings: currentSettings,
              trace,
              title:
                error instanceof InvalidTitleError
                  ? { source: "rejected", value: error.title }
                  : null,
            }),
          );
          options.store.update(id, (state) => ({ ...state, error: job.error }));
        }
      } finally {
        if (!(disposed && job.source === "archive"))
          options.store.update(id, (state) => ({
            ...state,
            archiveRequest: state.archiveRequest?.jobId === job.id ? null : state.archiveRequest,
          }));
        saveJob(id, job);
      }
    }).catch((error) => {
      job.phase = "error";
      job.error = TITLE_MESSAGES.storageFailed;
      report(
        failure({
          id,
          job,
          stage: "storage",
          error,
          message: job.error,
          secondary: reported,
        }),
      );
    });
  }
  // 普通请求在插件重载后无法安全重放；只有可持久化的归档意图可以恢复。
  for (const state of options.store.list()) {
    const id = state.agentId ?? state.result?.agentId;
    if (!id || blocked.has(id)) continue;
    for (const job of state.jobs)
      if (working(job) && state.archiveRequest?.jobId !== job.id) {
        job.phase = "error";
        job.error = TITLE_MESSAGES.interrupted;
        saveJob(id, job);
        report(
          failure({
            id,
            job,
            stage: "startup",
            error: null,
            message: job.error,
            reason: "job.interrupted",
          }),
        );
      }
  }
  return {
    async rename(
      paseo: PaseoApi,
      id: string,
      workspaceId: string,
      previousTitle: string | null,
      title: string,
    ) {
      if (!validTitle(title, 200))
        throw new TitleFailureError("input.invalidTitle", TITLE_MESSAGES.invalidInputTitle);
      const agent = await ensureIdle(paseo, id, true);
      if (agent.workspaceId !== workspaceId || agent.title !== previousTitle)
        throw new TitleFailureError("session.titleChanged", TITLE_MESSAGES.titleOrWorkspaceChanged);
      invalidate(id);
      options.store.update(id, (state) => ({ ...state, protected: true, archiveRequest: null }));
      await enqueue(id, async (signal) => {
        const current = await ensureIdle(paseo, id, true);
        if (current.workspaceId !== workspaceId || current.title !== previousTitle)
          throw new TitleFailureError(
            "session.titleChanged",
            TITLE_MESSAGES.titleOrWorkspaceChanged,
          );
        await (options.rename ?? renameSession)(id, title, signal);
        options.store.update(id, (state) => ({
          ...state,
          agentId: id,
          workspaceId,
          title,
          protected: true,
          error: null,
        }));
      });
      return { renamed: true };
    },
    async block(id: string) {
      invalidate(id);
      blocked.add(id);
      options.store.update(id, (state) => ({
        ...state,
        agentId: id,
        deleting: true,
        protected: true,
        archiveRequest: null,
      }));
      await tasks.get(id)?.done;
    },
    forget(id: string) {
      jobs.delete(id);
      options.store.remove(id);
      // Keep the process-local fence against late lifecycle events after deletion.
    },
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
      if (blocked.has(id)) return;
      options.store.update(id, (state) => ({
        ...state,
        agentId: id,
        workspaceId,
        observedCreation: true,
        title,
      }));
    },
    archived(id: string, at: string, paseo?: PaseoApi) {
      if (blocked.has(id)) return;
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
      try {
        if (blocked.has(id)) return;
        const settings = await options.settings();
        const initial = options.store.read(id);
        if (initial.archiveRequest) return;
        if (!settings.enabled || initial.protected || initial.rounds >= settings.rounds || disposed)
          return;
        if (working(jobs.get(id)) && jobs.get(id)?.source === "command") return;
        // 旧会话无法仅凭文本可靠恢复完成与重试边界。
        if (!initial.observedCreation) return;
        return enqueue(id, async (signal, version) => {
          let job: TitleJob | undefined;
          let currentSettings: TitleSettings | undefined = settings;
          const trace: TitleTrace = {};
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
            // 同时出现多个未见提问，可能是自动任务或漏记轮次：停止，不重置窗口。
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
            const result = await generate(paseo, id, signal, settings, job, false, history, trace);
            checkCanceled(signal);
            if (versions.get(id) !== undefined && versions.get(id) !== version) {
              job.phase = "canceled";
              return;
            }
            // 模型返回后重读设置：关闭功能必须取消待写入的标题。
            const updated = await options.settings();
            currentSettings = updated;
            if (!updated.enabled) {
              job.phase = "canceled";
              return;
            }
            if (!validTitle(result.analysis.title, updated.maxLength)) {
              job.phase = "canceled";
              report(
                failure({
                  id,
                  job,
                  stage: "summarizing",
                  error: new InvalidTitleError(result.analysis.title, updated.maxLength),
                  message: TITLE_MESSAGES.invalidTitle,
                  outcome: "skipped",
                  settings: updated,
                  trace,
                  title: { source: "rejected", value: result.analysis.title },
                }),
              );
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
            const stage = job ? titleStage(job.phase, "automatic") : "automatic";
            const aborted = signal.aborted;
            const message = aborted ? null : safeError(error);
            if (job) {
              job.phase = aborted ? "canceled" : "error";
              job.error = message;
            }
            if (!aborted) {
              const rejected = error instanceof InvalidTitleError;
              report(
                failure({
                  id,
                  job: job ?? null,
                  stage,
                  error,
                  message: message!,
                  outcome: rejected ? "skipped" : "failed",
                  settings: currentSettings,
                  trace,
                  title: rejected ? { source: "rejected", value: error.title } : null,
                }),
              );
              options.store.update(id, (state) => ({ ...state, error: message }));
            }
          } finally {
            if (job) saveJob(id, job);
          }
        });
      } catch (error) {
        const message = safeError(error);
        report(failure({ id, stage: "automatic", error, message }));
        throw error;
      }
    },
    async start(paseo: PaseoApi, id: string) {
      try {
        if (blocked.has(id))
          throw new TitleFailureError("session.deleting", TITLE_MESSAGES.deleting);
        if (disposed) throw new TitleFailureError("session.stopped", TITLE_MESSAGES.stopped);
        if (working(jobs.get(id)) && jobs.get(id)?.source !== "automatic") return jobs.get(id)!;
        invalidate(id);
        const job = newJob(id, "command");
        void runTitle(paseo, id, job);
        return job;
      } catch (error) {
        const message = safeError(error);
        report(failure({ id, stage: "start", error, message }));
        throw error;
      }
    },
    async archive(paseo: PaseoApi, id: string) {
      if (disposed) throw new TitleFailureError("session.stopped", TITLE_MESSAGES.stopped);
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
      } catch (error) {
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
        job.error = TITLE_MESSAGES.archiveFailed;
        report(failure({ id, job, stage: "archive", error, message: job.error }));
        saveJob(id, job);
        options.store.update(id, (state) => ({
          ...state,
          archiveRequest: actual ? null : state.archiveRequest,
          error: job.error,
        }));
        throw new TitleFailureError("archive.failed", job.error, { cause: error });
      } finally {
        recovering.delete(id);
      }
    },
    async queueClear(paseo: PaseoApi, id: string) {
      if (disposed) throw new TitleFailureError("session.stopped", TITLE_MESSAGES.stopped);
      const agent = await ensureIdle(paseo, id);
      if (agent.archivedAt)
        throw new TitleFailureError("session.unavailable", TITLE_MESSAGES.unavailable);
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
            throw new TitleFailureError("archive.unverified", TITLE_MESSAGES.archiveUnverified);
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
        } catch (error) {
          job.phase = "error";
          job.error = TITLE_MESSAGES.archiveUnverified;
          report(failure({ id, job, stage: "recover", error, message: job.error }));
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
      if (tasks.has(id))
        throw new TitleFailureError("session.processing", TITLE_MESSAGES.processing);
      const result = options.store.read(id).result;
      if (!result || result.id !== resultId)
        throw new TitleFailureError("session.changed", TITLE_MESSAGES.changed);
      if (result.applied) throw new TitleFailureError("title.applied", TITLE_MESSAGES.applied);
      let applied = false;
      await enqueue(id, async (signal) => {
        const settings = await options.settings();
        if (!validTitle(result.analysis.title, settings.maxLength))
          throw new InvalidTitleError(result.analysis.title, settings.maxLength);
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
