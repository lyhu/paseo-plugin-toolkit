import { afterEach, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { PaseoAgent } from "@getpaseo/client";
import {
  codexHistory,
  prepareProviderHistory,
  providerLocation,
  removeHistoryLines,
} from "./provider-history";
const id = "00000000-0000-4000-8000-000000000001";
const dirs: string[] = [];
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true });
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "toolkit-provider-delete-"));
  dirs.push(home);
  const project = join(home, "projects", "encoded-cwd");
  mkdirSync(project, { recursive: true });
  const file = join(project, `${id}.jsonl`);
  writeFileSync(
    file,
    JSON.stringify({ sessionId: id, cwd: "/project", type: "user", message: "private" }) + "\n",
  );
  const agent = {
    provider: "claude",
    cwd: "/project",
    persistence: { provider: "claude", sessionId: id, nativeHandle: id },
  } as PaseoAgent;
  return { home, file, project, agent, config: { claude: { env: { CLAUDE_CONFIG_DIR: home } } } };
}
it("deletes only the exact Claude transcript, its subagent directory and matching prompt index", async () => {
  const f = fixture();
  const sub = join(f.project, id, "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "agent.jsonl"), "private");
  const other = join(f.project, "other.jsonl");
  writeFileSync(other, "untouched");
  writeFileSync(
    join(f.home, "history.jsonl"),
    JSON.stringify({ sessionId: id, display: "private" }) +
      '\n{"sessionId":"other","display":"keep"}\n',
  );
  const plan = await prepareProviderHistory(f.agent, f.config);
  expect(existsSync(f.file)).toBe(true);
  await plan.remove();
  plan.close();
  expect(existsSync(f.file)).toBe(false);
  expect(existsSync(join(f.project, id))).toBe(false);
  expect(readFileSync(other, "utf8")).toBe("untouched");
  expect(readFileSync(join(f.home, "history.jsonl"), "utf8")).toBe(
    '{"sessionId":"other","display":"keep"}\n',
  );
});
it.each(["foreign-cwd", "foreign-id", "symlink", "nested-symlink"])(
  "refuses ambiguous Claude target %s without touching it",
  async (kind) => {
    const f = fixture();
    if (kind === "foreign-cwd")
      writeFileSync(f.file, JSON.stringify({ sessionId: id, cwd: "/other" }));
    if (kind === "foreign-id")
      writeFileSync(f.file, JSON.stringify({ sessionId: "other", cwd: "/project" }));
    if (kind === "symlink") {
      rmSync(f.file);
      symlinkSync("/private/tmp", f.file);
    }
    if (kind === "nested-symlink") {
      mkdirSync(join(f.project, id));
      symlinkSync("/private/tmp", join(f.project, id, "link"));
    }
    await expect(prepareProviderHistory(f.agent, f.config)).rejects.toThrow();
    expect(existsSync(f.file)).toBe(true);
  },
);
it("does not remove the transcript when a shared prompt index cannot be parsed safely", async () => {
  const f = fixture();
  writeFileSync(join(f.home, "history.jsonl"), "invalid\n");
  const plan = await prepareProviderHistory(f.agent, f.config);
  await expect(plan.remove()).rejects.toThrow();
  expect(existsSync(f.file)).toBe(true);
});
it("resolves inherited provider roots and refuses unsupported/custom launchers", () => {
  expect(
    providerLocation("custom", {
      custom: { extends: "claude", env: { CLAUDE_CONFIG_DIR: "/other" } },
      claude: { env: { CLAUDE_CONFIG_DIR: "/base" } },
    }).home,
  ).toBe("/other");
  expect(() => providerLocation("custom", { custom: { extends: "custom" } })).toThrow();
  expect(() => providerLocation("codex", { codex: { command: ["ssh", "other"] } })).toThrow();
  expect(() => providerLocation("unknown", {})).toThrow();
  expect(() => providerLocation("codex", { codex: { env: { CODEX_HOME: "relative" } } })).toThrow();
});
it("preserves unrelated Codex prompt and session index entries", () => {
  const f = fixture();
  const file = join(f.home, "session_index.jsonl");
  writeFileSync(
    file,
    JSON.stringify({ id, thread_name: "remove" }) + '\n{"id":"other","thread_name":"keep"}\n',
  );
  removeHistoryLines(f.home, "session_index.jsonl", id, ["id"]);
  expect(readFileSync(file, "utf8")).toBe('{"id":"other","thread_name":"keep"}\n');
});
it.skipIf(!process.env.TOOLKIT_CODEX_DELETE_TEST)(
  "uses the installed Codex delete API in an isolated empty home without a model turn",
  async () => {
    const f = fixture();
    const api = codexHistory({ ...process.env, CODEX_HOME: f.home });
    try {
      await api.initialize();
      const result = (await api.request("thread/start", {
        cwd: f.home,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: false,
      })) as { thread: { id: string; path: string } };
      expect(result.thread.id).toBeTruthy();
      await api.request("thread/archive", { threadId: result.thread.id });
      await api.request("thread/delete", { threadId: result.thread.id });
      expect(existsSync(result.thread.path)).toBe(false);
      await expect(
        api.request("thread/read", { threadId: result.thread.id, includeTurns: false }),
      ).rejects.toThrow();
      const database = join(f.home, "state_5.sqlite");
      if (existsSync(database))
        expect(
          execFileSync(
            "sqlite3",
            ["-readonly", database, `select count(*) from threads where id='${result.thread.id}'`],
            { encoding: "utf8" },
          ).trim(),
        ).toBe("0");
      const another = (await api.request("thread/start", {
        cwd: f.home,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: false,
      })) as { thread: { id: string } };
      await api.request("thread/archive", { threadId: another.thread.id });
      api.close();
      const plan = await prepareProviderHistory(
        {
          provider: "codex",
          cwd: f.home,
          lastUserMessageAt: null,
          persistence: {
            provider: "codex",
            sessionId: another.thread.id,
            nativeHandle: another.thread.id,
          },
        } as PaseoAgent,
        { codex: { env: { CODEX_HOME: f.home } } },
      );
      try {
        await plan.remove();
      } finally {
        plan.close();
      }
      if (existsSync(database))
        expect(
          execFileSync(
            "sqlite3",
            ["-readonly", database, `select count(*) from threads where id='${another.thread.id}'`],
            { encoding: "utf8" },
          ).trim(),
        ).toBe("0");
    } finally {
      api.close();
    }
  },
  60000,
);
