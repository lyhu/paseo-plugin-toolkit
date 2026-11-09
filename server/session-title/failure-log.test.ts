import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderFailure } from "../../shared/models/failure";
import { InvalidTitleError, TITLE_MESSAGES, TitleFailureError } from "./errors";
import {
  TITLE_FAILURE_MAX_RECORD_BYTES,
  createTitleFailureLog,
  endpointLabel,
  redactSecrets,
  titleFailureReason,
  titleFailureReasons,
} from "./failure-log";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});
function home() {
  const directory = mkdtempSync(join(tmpdir(), "toolkit-title-failures-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function read(file: string) {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-a",
    source: "command",
    at: "2026-11-09T10:00:00.000Z",
    phase: "summarizing",
    completed: 0,
    total: 1,
    error: null,
    result: null,
    ...overrides,
  };
}

it("writes structured owner-only failure records with cause reasons", () => {
  const directory = home();
  const log = createTitleFailureLog(directory);
  log.record({
    agentId: "agent-a",
    workspaceId: "workspace-a",
    job: job() as never,
    stage: "summarizing",
    error: new TitleFailureError("history.read", TITLE_MESSAGES.historyRead, {
      cause: new ProviderFailure("timeout", "30000"),
    }),
    message: TITLE_MESSAGES.historyRead,
    settings: { enabled: true, rounds: 5, maxLength: 30 },
    rounds: 2,
    title: { source: "rejected", value: "旧标题" },
    trace: {
      model: "gpt-test",
      endpoint: "https://models.example.com",
      history: { messages: 12, through: 34 },
    },
  });

  expect(statSync(log.file).mode & 0o777).toBe(0o600);
  expect(statSync(join(directory, "toolkit", "session-title")).mode & 0o777).toBe(0o700);
  const [record] = read(log.file);
  expect(record).toMatchObject({
    version: 2,
    kind: "session-title.failure",
    agentId: "agent-a",
    workspaceId: "workspace-a",
    stage: "summarizing",
    reason: "history.read",
    causeReasons: ["provider.timeout"],
    outcome: "failed",
    secondary: false,
    message: TITLE_MESSAGES.historyRead,
    job: { id: "job-a", source: "command", phase: "summarizing" },
    title: { source: "rejected", length: 3, value: "旧标题" },
    error: {
      name: "TitleFailureError",
      message: TITLE_MESSAGES.historyRead,
      cause: { name: "ProviderFailure", provider: { kind: "timeout", detail: "30000" } },
    },
    context: {
      settings: { enabled: true, rounds: 5, maxLength: 30 },
      rounds: 2,
      history: { messages: 12, through: 34 },
      model: "gpt-test",
      endpoint: "https://models.example.com",
    },
  });
  expect(record.durationMs).toBeGreaterThanOrEqual(0);
  expect(record.plugin).toBeTruthy();
  expect(record.error.stack).toBeUndefined();
});

it("omits stacks for expected failures but keeps them for unknown errors", () => {
  const directory = home();
  const log = createTitleFailureLog(directory);
  log.record({
    agentId: "expected",
    stage: "reading",
    error: new TitleFailureError("history.read", TITLE_MESSAGES.historyRead),
    message: TITLE_MESSAGES.historyRead,
  });
  log.record({
    agentId: "unknown",
    stage: "reading",
    error: new Error("boom"),
    message: "boom",
  });

  const [expected, unknown] = read(log.file);
  expect(expected.error.stack).toBeUndefined();
  expect(unknown.error.stack).toBeTruthy();
});

it("keeps rejected titles and the validation limit", () => {
  const directory = home();
  const log = createTitleFailureLog(directory);
  const title = "标题".repeat(16);
  log.record({
    agentId: "agent-a",
    stage: "summarizing",
    error: new InvalidTitleError(title, 30),
    message: TITLE_MESSAGES.invalidTitle,
    outcome: "skipped",
    title: { source: "rejected", value: title },
  });

  const [record] = read(log.file);
  expect(record).toMatchObject({
    reason: "model.invalidTitle",
    outcome: "skipped",
    title: { source: "rejected", length: 32, value: title },
    error: { name: "InvalidTitleError", title: { length: 32, limit: 30, value: title } },
  });
});

it("records an interrupted job without an error object", () => {
  const directory = home();
  const log = createTitleFailureLog(directory);
  log.record({
    agentId: "agent-a",
    stage: "startup",
    reason: "job.interrupted",
    error: null,
    message: TITLE_MESSAGES.interrupted,
  });

  expect(read(log.file)[0]).toMatchObject({
    reason: "job.interrupted",
    causeReasons: [],
    stage: "startup",
    error: null,
  });
});

it("classifies typed, provider, fallback and unknown errors", () => {
  expect(titleFailureReason(new TitleFailureError("session.busy", "busy"))).toBe("session.busy");
  expect(titleFailureReason(new ProviderFailure("http", "upstream", 502))).toBe("provider.http");
  expect(titleFailureReason(new Error("会话总结已变化，请刷新后重试。"))).toBe("session.changed");
  expect(titleFailureReason(new Error("random"))).toBe("unknown");
  expect(
    titleFailureReasons(
      new TitleFailureError("history.read", "read", {
        cause: new TitleFailureError("history.incomplete", "incomplete", {
          cause: new ProviderFailure("timeout", "30000"),
        }),
      }),
    ),
  ).toEqual(["history.read", "history.incomplete", "provider.timeout"]);
});

it("redacts common credential shapes before writing", () => {
  expect(
    redactSecrets("Authorization: Bearer abcdefghijkl api_key=secret123 token=xyz sk-abcdefghijk"),
  ).not.toMatch(/abcdefghijkl|secret123|xyz|sk-abcdefghijk/);

  const directory = home();
  const log = createTitleFailureLog(directory);
  log.record({
    agentId: "agent-a",
    stage: "reading",
    error: new Error("failed with api_key=secret123"),
    message: "Bearer abcdefghijkl",
  });
  expect(readFileSync(log.file, "utf8")).not.toMatch(/secret123|abcdefghijkl/);
});

it("rotates one backup in place and replaces the previous backup", () => {
  const directory = home();
  const log = createTitleFailureLog(directory, { maxBytes: 300 });
  const event = (message: string) => ({
    agentId: "agent-a",
    stage: "reading" as const,
    error: "connection reset",
    message: `${message}${"x".repeat(500)}`,
  });
  log.record(event("first"));
  log.record(event("second"));
  log.record(event("third"));

  expect(existsSync(`${log.file}.1`)).toBe(true);
  expect(read(log.file)).toHaveLength(1);
  expect(read(log.file)[0].message).toContain("third");
  expect(read(`${log.file}.1`)).toHaveLength(1);
  expect(read(`${log.file}.1`)[0].message).toContain("second");
});

it("falls back to a timestamped file when rotation fails", () => {
  const directory = home();
  const log = createTitleFailureLog(directory, { maxBytes: 100 });
  const event = {
    agentId: "agent-a",
    stage: "reading" as const,
    error: "connection reset",
    message: "x".repeat(500),
  };
  log.record(event);
  mkdirSync(`${log.file}.1`, { recursive: true });
  writeFileSync(join(`${log.file}.1`, "keep"), "keep");
  log.record(event);

  const files = readdirSync(join(directory, "toolkit", "session-title"));
  expect(files.some((name) => /^failures-\d{4}-\d{2}-\d{2}T/.test(name))).toBe(true);
  expect(read(log.file)).toHaveLength(1);
});

it("trims oversized records without breaking JSONL", () => {
  const directory = home();
  const log = createTitleFailureLog(directory);
  log.record({
    agentId: "agent-a",
    stage: "reading",
    error: new Error("boom"),
    message: "x",
    settings: {
      enabled: true,
      rounds: 5,
      maxLength: 30,
      oversized: "y".repeat(100_000),
    } as never,
  });

  const line = readFileSync(log.file, "utf8").trim();
  expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(TITLE_FAILURE_MAX_RECORD_BYTES);
  expect(JSON.parse(line)).toMatchObject({ agentId: "agent-a", stage: "reading" });
});

it("never throws when the log directory cannot be created", () => {
  const directory = home();
  mkdirSync(join(directory, "toolkit"), { recursive: true });
  writeFileSync(join(directory, "toolkit", "session-title"), "blocked");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const log = createTitleFailureLog(directory);
  expect(() =>
    log.record({
      agentId: "agent-a",
      stage: "reading",
      error: new Error("boom"),
      message: "boom",
    }),
  ).not.toThrow();
  expect(error).toHaveBeenCalled();
});

it("records only the model endpoint origin", () => {
  expect(endpointLabel("https://models.example.com/v1?token=private")).toBe(
    "https://models.example.com",
  );
  expect(endpointLabel("not a url")).toBeNull();
});
