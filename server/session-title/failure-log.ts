import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { TitleJob, TitleSettings } from "../../shared/session-title/contracts";
import { titleLength } from "../../shared/session-title/contracts";
import { ProviderFailure } from "../../shared/models/failure";
import { TOOLKIT_VERSION } from "../../shared/version";
import { paseoHome } from "../models/storage";
import {
  InvalidTitleError,
  TitleFailureError,
  type TitleFailureReason,
  type TitleFailureStage,
} from "./errors";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGE = 4000;
const MAX_STACK = 6000;
const MAX_TITLE = 400;
export const TITLE_FAILURE_MAX_RECORD_BYTES = 64 * 1024;

export interface TitleTrace {
  model?: string | null;
  endpoint?: string | null;
  history?: { messages: number; through: number } | null;
}

/** 后续分析一条命名失败所需的全部信息，不再重读会话。 */
export interface TitleFailureEvent {
  agentId: string;
  workspaceId?: string | null;
  job?: TitleJob | null;
  stage: TitleFailureStage;
  /** 已知原因的覆盖值；未提供时从 error 推断。 */
  reason?: TitleFailureReason;
  error: unknown;
  /** 客户端看到的脱敏文案。 */
  message: string;
  /** failed 为用户可见失败；skipped 表示静默跳过（如自动命名标题不合法）。 */
  outcome?: "failed" | "skipped";
  /** 同一故障的后续记录（例如失败后保存也失败）。 */
  secondary?: boolean;
  durationMs?: number;
  settings?: TitleSettings;
  rounds?: number;
  /** 仅记录被拒的模型标题，不记录当前会话标题，避免带入用户首条消息。 */
  title?: { source: "generated" | "rejected"; value: string } | null;
  trace?: TitleTrace;
}

export interface TitleFailureLog {
  readonly file: string;
  record(event: TitleFailureEvent): void;
}

/** 兜底识别未包装的第三方错误；已知路径均已使用 TitleFailureError。 */
const fallbackReasons: [needle: string, reason: TitleFailureReason][] = [
  ["会话总结已变化", "session.changed"],
  ["会话总结正在处理", "session.processing"],
  ["会话总结服务已停止", "session.stopped"],
  ["会话正在删除", "session.deleting"],
];

export function titleFailureReason(error: unknown): TitleFailureReason {
  if (error instanceof TitleFailureError) return error.reason;
  if (error instanceof ProviderFailure) return `provider.${error.kind}`;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  for (const [needle, reason] of fallbackReasons) if (message.includes(needle)) return reason;
  return "unknown";
}

/** 从顶层错误沿 cause 链收集原因，保留包装后的真实根因。 */
export function titleFailureReasons(error: unknown): TitleFailureReason[] {
  const reasons: TitleFailureReason[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const reason = titleFailureReason(current);
    if (reason !== "unknown" && !reasons.includes(reason)) reasons.push(reason);
    current = current instanceof Error ? current.cause : undefined;
  }
  return reasons;
}

/** Provider 正文可能回显凭据；所有写入日志的文本统一经过这里。 */
export function redactSecrets(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/gi, "[redacted]")
    .replace(
      /((?:x-api-key|api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|token|secret)\s*[:=]\s*)[^\s,;"']+/gi,
      "$1[redacted]",
    );
}

function text(value: string, max = MAX_MESSAGE) {
  return value.length > max ? `${value.slice(0, max)}…[${value.length}]` : value;
}

function privateText(value: string, max = MAX_MESSAGE) {
  return redactSecrets(text(value, max));
}

function describeError(
  error: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  includeStack = true,
): unknown {
  if (error === null || error === undefined) return null;
  if (depth > 3) return { value: "[truncated]" };
  if (error instanceof Error) {
    if (seen.has(error)) return { name: error.name, value: "[circular]" };
    seen.add(error);
    const described: Record<string, unknown> = {
      name: error.name,
      message: privateText(error.message),
    };
    if (includeStack && error.stack) described.stack = privateText(error.stack, MAX_STACK);
    if (error instanceof ProviderFailure)
      described.provider = {
        kind: error.kind,
        detail: privateText(error.detail, 1000),
        ...(error.status === undefined ? {} : { status: error.status }),
      };
    if (error instanceof InvalidTitleError)
      described.title = {
        length: titleLength(error.title),
        limit: error.limit,
        value: privateText(error.title, MAX_TITLE),
      };
    if (error.cause !== undefined)
      described.cause = describeError(error.cause, depth + 1, seen, includeStack);
    return described;
  }
  if (typeof error === "string") return { message: privateText(error) };
  try {
    return { value: privateText(JSON.stringify(error) ?? String(error)) };
  } catch {
    return { value: privateText(String(error)) };
  }
}

/** 模型端点只记录 origin，路径与查询参数可能带供应商凭据。 */
export function endpointLabel(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

/** 单条记录过大时依次丢弃堆栈、标题值与错误链，保证仍是合法 JSON。 */
function fitRecord(record: Record<string, unknown>): string {
  let line = JSON.stringify(record);
  if (Buffer.byteLength(line, "utf8") <= TITLE_FAILURE_MAX_RECORD_BYTES) return line;
  const title = record.title as Record<string, unknown> | null | undefined;
  const trimmed = {
    ...record,
    error: undefined,
    title: title ? { ...title, value: undefined, truncated: true } : title,
    message: privateText(String(record.message), 1000),
  };
  line = JSON.stringify(trimmed);
  if (Buffer.byteLength(line, "utf8") <= TITLE_FAILURE_MAX_RECORD_BYTES) return line;
  return JSON.stringify({
    version: record.version,
    kind: record.kind,
    at: record.at,
    plugin: record.plugin,
    platform: record.platform,
    node: record.node,
    agentId: record.agentId,
    workspaceId: record.workspaceId,
    stage: record.stage,
    reason: record.reason,
    causeReasons: record.causeReasons,
    outcome: record.outcome,
    secondary: record.secondary,
    durationMs: record.durationMs,
    message: "记录过大，已截断",
  });
}

/**
 * 会话命名的失败诊断日志。按 JSONL 追加到 Host，文件仅本人可读；正常情况轮转为 .1，
 * 轮转失败时改用时间戳文件，避免原文件无限增长。
 */
export function createTitleFailureLog(
  home = paseoHome(),
  options: { maxBytes?: number } = {},
): TitleFailureLog {
  const filename = join(home, "toolkit", "session-title", "failures.jsonl");
  const backup = `${filename}.1`;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let fallback: string | null = null;

  function target() {
    const current = fallback ?? filename;
    if (!existsSync(current)) return current;
    if (statSync(current).size < maxBytes) return current;
    if (current === filename) {
      try {
        rmSync(backup, { force: true });
        renameSync(filename, backup);
        return filename;
      } catch {
        // 轮转失败时改用时间戳文件，避免原文件无限增长。
      }
    }
    fallback = join(
      dirname(filename),
      `failures-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
    );
    return fallback;
  }

  return {
    file: filename,
    record(event) {
      try {
        const reason = event.reason ?? titleFailureReason(event.error);
        const causeReasons = titleFailureReasons(event.error).filter((entry) => entry !== reason);
        const durationMs =
          event.durationMs ??
          (event.job?.at ? Math.max(0, Date.now() - Date.parse(event.job.at)) : undefined);
        const record = {
          version: 2,
          kind: "session-title.failure",
          at: new Date().toISOString(),
          plugin: TOOLKIT_VERSION,
          platform: process.platform,
          node: process.version,
          agentId: event.agentId,
          workspaceId: event.workspaceId ?? null,
          stage: event.stage,
          reason,
          causeReasons,
          outcome: event.outcome ?? "failed",
          secondary: event.secondary ?? false,
          ...(durationMs === undefined ? {} : { durationMs }),
          message: privateText(event.message),
          job: event.job
            ? {
                id: event.job.id,
                source: event.job.source,
                phase: event.job.phase,
                completed: event.job.completed,
                total: event.job.total,
                at: event.job.at ?? null,
              }
            : null,
          title: event.title
            ? {
                source: event.title.source,
                length: titleLength(event.title.value),
                value: privateText(event.title.value, MAX_TITLE),
              }
            : null,
          error: describeError(
            event.error,
            0,
            new WeakSet<object>(),
            reason === "unknown" || reason === "storage.write",
          ),
          context: {
            ...(event.settings ? { settings: event.settings } : {}),
            ...(event.rounds === undefined ? {} : { rounds: event.rounds }),
            ...(event.trace?.history ? { history: event.trace.history } : {}),
            ...(event.trace?.model ? { model: privateText(event.trace.model, 200) } : {}),
            ...(event.trace?.endpoint ? { endpoint: event.trace.endpoint } : {}),
          },
        };
        const line = fitRecord(record);
        const directory = dirname(filename);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        try {
          chmodSync(directory, 0o700);
        } catch {
          // Windows 等平台可能不支持目录权限，忽略即可。
        }
        const file = target();
        appendFileSync(file, line + "\n", { mode: 0o600 });
        chmodSync(file, 0o600);
      } catch (error) {
        console.error("[Toolkit] Session title failure log could not be written", error);
      }
    },
  };
}
