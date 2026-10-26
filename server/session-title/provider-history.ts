import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  existsSync,
  openSync,
  closeSync,
  readSync,
  realpathSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import type { PaseoAgent } from "@getpaseo/client";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
class MissingCodexHistory extends Error {}
function sameDirectory(value: unknown, expected: string) {
  if (typeof value !== "string") return false;
  if (value === expected) return true;
  try {
    return realpathSync(value) === realpathSync(expected);
  } catch {
    return false;
  }
}
function readRolloutHeader(path: string) {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    const end = buffer.indexOf(10, 0);
    if (end < 0 && size === buffer.length) throw new Error("原始历史头部过长，已停止删除。");
    return record(JSON.parse(buffer.subarray(0, end < 0 ? size : end).toString("utf8")));
  } finally {
    closeSync(fd);
  }
}

export function providerLocation(provider: string, providers: unknown) {
  const configs = record(providers);
  const seen = new Set<string>();
  const chain: Record<string, unknown>[] = [];
  let base = provider;
  while (true) {
    if (seen.has(base)) throw new Error("Provider 配置存在循环，尚未删除会话。");
    seen.add(base);
    const config = record(configs[base]);
    chain.unshift(config);
    if (typeof config.extends !== "string") break;
    base = config.extends;
  }
  if (base !== "codex" && base !== "claude")
    throw new Error("此 Provider 尚不支持原始历史物理删除，尚未删除会话。");
  if (chain.some((config) => config.command))
    throw new Error("自定义 Provider 启动命令暂不支持物理删除，尚未删除会话。");
  const env = { ...process.env };
  for (const config of chain)
    for (const [key, value] of Object.entries(record(config.env)))
      if (typeof value === "string") env[key] = value;
  const home =
    base === "codex"
      ? (env.CODEX_HOME ?? join(homedir(), ".codex"))
      : (env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"));
  if (!isAbsolute(home)) throw new Error("Provider 历史目录必须是绝对路径，尚未删除会话。");
  return { base, home: resolve(home), env };
}

function safePath(root: string, path: string) {
  const lexical = relative(root, path);
  const rel =
    lexical && !lexical.startsWith("..") && !isAbsolute(lexical)
      ? lexical
      : relative(realpathSync(root), path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("历史文件路径越界，已停止删除。");
  let current = realpathSync(root);
  if (lstatSync(root).isSymbolicLink()) throw new Error("历史目录是符号链接，已停止删除。");
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("历史文件是符号链接，已停止删除。");
  }
  return path;
}

// Keep unrelated prompts byte-for-byte. Detect concurrent writers before the atomic replacement.
export function removeHistoryLines(home: string, name: string, id: string, fields: string[]) {
  const file = join(home, name);
  if (!existsSync(file)) return;
  safePath(home, file);
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = statSync(file);
    const original = readFileSync(file, "utf8");
    const remaining = original
      .split(/(?<=\n)/)
      .filter((line) => {
        if (!line.trim()) return true;
        const value = record(JSON.parse(line));
        return !fields.some((key) => value[key] === id);
      })
      .join("");
    if (remaining === original) return;
    const temporary = join(home, `.${name}.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, remaining, { mode: 0o600, flag: "wx" });
      const after = statSync(file);
      if (
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs
      )
        continue;
      renameSync(temporary, file);
      return;
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  throw new Error("Provider 历史正在更新，请稍后重试永久删除。");
}

// A separate metadata-only app-server connection; it never starts/resumes a model turn.
export function codexHistory(env: NodeJS.ProcessEnv) {
  const child = spawn("codex", ["app-server"], { env, stdio: ["pipe", "pipe", "ignore"] });
  let next = 0;
  let closed = false;
  const pending = new Map<
    number,
    { method: string; resolve(value: unknown): void; reject(error: Error): void }
  >();
  const lines = createInterface({ input: child.stdout });
  const fail = () => {
    for (const request of pending.values())
      request.reject(new Error("Codex 历史接口不可用，请检查版本后重试。"));
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", fail);
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) {
        const ErrorType = /not found|not loaded|does not exist|no rollout|unable to find/i.test(
          String(message.error.message),
        )
          ? MissingCodexHistory
          : Error;
        request.reject(
          new ErrorType(
            `Codex 的 ${request.method} 操作失败（${Number(message.error.code) || "未知"}），请检查原始历史及 CLI 版本。`,
          ),
        );
      } else request.resolve(message.result);
    } catch {
      fail();
    }
  });
  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Codex 历史接口超时，请重试。"));
      }, 15000);
      pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => {
        if (error) fail();
      });
    });
  return {
    request,
    async initialize() {
      await request("initialize", {
        clientInfo: { name: "toolkit-session-delete", version: "1" },
        capabilities: { experimentalApi: true },
      });
      child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    },
    close() {
      if (closed) return;
      closed = true;
      lines.close();
      child.stdin.end();
      child.kill();
      fail();
    },
  };
}

export async function prepareProviderHistory(agent: PaseoAgent, providers: unknown) {
  const location = providerLocation(agent.provider, providers);
  const persistence = agent.persistence;
  if (!persistence) throw new Error("缺少 Provider 原始会话标识，尚未删除会话。");
  if (providerLocation(persistence.provider, providers).base !== location.base)
    throw new Error("原始会话 Provider 不匹配，尚未删除会话。");
  const id = persistence.nativeHandle ?? persistence.sessionId;
  if (
    !uuid.test(id) ||
    (persistence.nativeHandle && persistence.nativeHandle !== persistence.sessionId)
  )
    throw new Error("Provider 原始会话标识无效，尚未删除会话。");
  if (location.base === "codex") {
    const api = codexHistory(location.env);
    try {
      await api.initialize();
      let thread: Record<string, unknown>;
      try {
        const result = record(
          await api.request("thread/read", { threadId: id, includeTurns: false }),
        );
        thread = record(result.thread);
      } catch (error) {
        // Codex rejects metadata reads of some empty archived rollouts. Verify their own header.
        const matches: string[] = [];
        const visit = (directory: string) => {
          if (!existsSync(directory)) return;
          safePath(location.home, directory);
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error("历史目录包含符号链接，已停止删除。");
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith(`-${id}.jsonl`)) {
              safePath(location.home, path);
              matches.push(path);
            }
          }
        };
        visit(join(location.home, "sessions"));
        visit(join(location.home, "archived_sessions"));
        if (
          !matches.length &&
          error instanceof MissingCodexHistory &&
          agent.lastUserMessageAt === null
        ) {
          thread = { id, cwd: agent.cwd, path: null };
        } else {
          if (matches.length !== 1) throw error;
          const header = readRolloutHeader(matches[0]!);
          const metadata = record(header.payload);
          if (
            header.type !== "session_meta" ||
            metadata.id !== id ||
            !sameDirectory(metadata.cwd, agent.cwd)
          )
            throw error;
          thread = { id, cwd: metadata.cwd, path: matches[0] };
        }
      }
      if (
        thread.id !== id ||
        !sameDirectory(thread.cwd, agent.cwd) ||
        (thread.path !== null && typeof thread.path !== "string")
      )
        throw new Error("Codex 原始会话归属不匹配，尚未删除会话。");
      if (typeof thread.path === "string") safePath(location.home, thread.path);
      return {
        id,
        close: api.close,
        async remove() {
          removeHistoryLines(location.home, "history.jsonl", id, ["session_id"]);
          removeHistoryLines(location.home, "session_index.jsonl", id, ["id"]);
          try {
            await api.request("thread/delete", { threadId: id });
          } catch (error) {
            if (!(thread.path === null && error instanceof MissingCodexHistory)) throw error;
          }
          if (typeof thread.path === "string" && existsSync(thread.path))
            throw new Error("Codex 原始历史仍存在，请重试永久删除。");
        },
      };
    } catch (error) {
      api.close();
      throw error;
    }
  }
  const projects = join(location.home, "projects");
  if (!existsSync(projects)) throw new Error("找不到 Claude 原始历史目录，尚未删除会话。");
  safePath(location.home, projects);
  const targets: string[] = [];
  for (const entry of readdirSync(projects, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(projects, entry.name, `${id}.jsonl`);
    if (!existsSync(file)) continue;
    safePath(location.home, file);
    const messages = readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => record(JSON.parse(line)));
    if (
      !messages.some(
        (message) => message.sessionId === id && sameDirectory(message.cwd, agent.cwd),
      ) ||
      messages.some((message) => typeof message.sessionId === "string" && message.sessionId !== id)
    )
      throw new Error("Claude 原始会话归属不匹配，尚未删除会话。");
    targets.push(file);
    const sidecar = join(projects, entry.name, id);
    if (existsSync(sidecar)) {
      safePath(location.home, sidecar);
      // Refuse nested links rather than following them while removing subagent transcripts.
      const check = (path: string) => {
        for (const item of readdirSync(path, { withFileTypes: true })) {
          const child = safePath(location.home, join(path, item.name));
          if (item.isDirectory()) check(child);
        }
      };
      check(sidecar);
      targets.push(sidecar);
    }
  }
  if (!targets.length) throw new Error("找不到 Claude 原始会话历史，尚未删除会话。");
  return {
    id,
    close() {},
    async remove() {
      // Clear prompt indexes first: a retry can still verify the transcript if an index is busy.
      removeHistoryLines(location.home, "history.jsonl", id, ["sessionId"]);
      for (const path of targets) {
        safePath(location.home, path);
        rmSync(path, { recursive: true, force: true });
      }
    },
  };
}
