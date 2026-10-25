import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { collectSessionHistory, createHistoryIndex, createIndexJobs } from "./search";
import type { SearchHit, SearchSession } from "../../shared/workbench/search";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function home() {
  const root = mkdtempSync(join(tmpdir(), "workbench-index-"));
  roots.push(root);
  return root;
}
const session: SearchSession = {
  serverId: "host",
  workspaceId: "workspace",
  agentId: "agent",
  title: "Conversation",
};
const hit = (seq: number, text: string, s = session): SearchHit => ({
  ...s,
  seq,
  text,
  epoch: "epoch",
  indexedAt: "2026-10-24T00:00:00Z",
});
const entry = (seq: number, text: string, type = "user_message") => ({
  seqStart: seq,
  item: { type, text },
});
function page(entries: ReturnType<typeof entry>[], next?: number, epoch = "epoch") {
  return {
    entries,
    epoch,
    hasOlder: next !== undefined,
    startCursor: next === undefined ? undefined : { epoch, seq: next },
    error: null,
    gap: false,
    staleCursor: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

it("indexes exact normalized phrases, handles host identity, replacement, deletion and restart", () => {
  const root = home(),
    index = createHistoryIndex(root);
  index.replace(session, [hit(1, "Ｆｕｌｌ width and 中文検索"), hit(2, "alpha beta")]);
  const other = { ...session, serverId: "other" };
  index.replace(other, [hit(1, "alpha beta", other)]);
  expect(index.search("full WIDTH").map((h) => h.seq)).toEqual([1]);
  expect(index.search("中文")).toHaveLength(1);
  expect(index.search("alpha beta", "host")).toHaveLength(1);
  expect(index.search("alpha gamma")).toEqual([]);
  index.replace(session, [hit(3, "changed")]);
  expect(index.search("alpha", "host")).toEqual([]);
  expect(index.search("alpha", "other")).toHaveLength(1);
  expect(createHistoryIndex(root).search("changed")).toHaveLength(1);
  index.remove(other);
  expect(index.search("alpha")).toEqual([]);
});
it("reports corrupt shards and safely clears only the recorded file", () => {
  const root = home(),
    directory = join(root, "toolkit", "workbench", "search");
  mkdirSync(directory, { recursive: true });
  const filename = "a".repeat(64) + ".json",
    target = join(directory, filename);
  writeFileSync(target, "corrupt");
  const index = createHistoryIndex(root),
    status = index.statuses()[0]!;
  expect(status.status).toBe("failed");
  expect(existsSync(target)).toBe(true);
  index.remove({ ...status, agentId: "../outside" });
  expect(existsSync(target)).toBe(true);
  index.remove(status);
  expect(index.statuses()).toEqual([]);
  expect(existsSync(target)).toBe(false);
});
it("deduplicates overlapping history pages and preserves complete long messages", async () => {
  const refetch = vi
    .fn()
    .mockResolvedValueOnce(
      page(
        [entry(4, "Recent"), entry(3, "x".repeat(9000) + "tail keyword"), entry(2, "overlap")],
        2,
      ),
    )
    .mockResolvedValueOnce(
      page([entry(2, "overlap"), entry(1, "old"), entry(0, "skip", "tool_call")]),
    );
  const hits = await collectSessionHistory(
    { refetch } as never,
    session,
    new AbortController().signal,
  );
  expect(hits.map((h) => h.seq)).toEqual([4, 3, 2, 1]);
  expect(hits.find((h) => h.seq === 3)?.text.endsWith("tail keyword")).toBe(true);
  expect(refetch.mock.calls[1]?.[0]).toMatchObject({
    direction: "before",
    cursor: { epoch: "epoch", seq: 2 },
  });
});
it.each(["epoch", "gap", "stale", "stuck"])(
  "rejects %s history pages without a partial success",
  async (kind) => {
    const second = page(
      [entry(1, "old")],
      kind === "stuck" ? 2 : undefined,
      kind === "epoch" ? "changed" : "epoch",
    );
    if (kind === "gap") second.gap = true;
    if (kind === "stale") second.staleCursor = true;
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(page([entry(2, "recent")], 2))
      .mockResolvedValueOnce(second);
    await expect(
      collectSessionHistory({ refetch } as never, session, new AbortController().signal),
    ).rejects.toThrow();
  },
);
it("honors cancellation before and during refetch and rejects an oversized message", async () => {
  const abort = new AbortController(),
    refetch = vi.fn();
  abort.abort();
  await expect(collectSessionHistory({ refetch } as never, session, abort.signal)).rejects.toThrow(
    "取消",
  );
  expect(refetch).not.toHaveBeenCalled();
  const active = new AbortController();
  refetch.mockImplementation(async () => {
    active.abort();
    return page([entry(1, "text")]);
  });
  await expect(collectSessionHistory({ refetch } as never, session, active.signal)).rejects.toThrow(
    "取消",
  );
  refetch.mockResolvedValue(page([entry(1, "x".repeat(16_000_001))]));
  await expect(
    collectSessionHistory({ refetch } as never, session, new AbortController().signal),
  ).rejects.toThrow("字符预算");
});
it("allows two global jobs and only one per host, then drains the queue", async () => {
  const index = createHistoryIndex(home());
  const pending = new Map<string, ReturnType<typeof deferred<ReturnType<typeof page>>>>();
  const disposed: string[] = [];
  const acquire = vi.fn(async (serverId: string) => ({
    agents: {
      ref: (id: string) => {
        const d = deferred<ReturnType<typeof page>>();
        pending.set(id, d);
        return {
          workspaceId: "workspace",
          refresh: async () => {},
          timeline: { refetch: () => d.promise },
        };
      },
    },
    dispose: async () => {
      disposed.push(serverId);
    },
  }));
  const jobs = createIndexJobs(index, acquire as never);
  jobs.start({ ...session, agentId: "a" });
  jobs.start({ ...session, agentId: "b" });
  jobs.start({ ...session, serverId: "other", agentId: "c" });
  jobs.start({ ...session, serverId: "third", agentId: "d" });
  await flush();
  expect([...pending.keys()]).toEqual(["a", "c"]);
  pending.get("a")!.resolve(page([entry(1, "a")]));
  await flush();
  expect([...pending.keys()]).toEqual(["a", "c", "b"]);
  pending.get("c")!.resolve(page([entry(1, "c")]));
  await flush();
  expect([...pending.keys()]).toEqual(["a", "c", "b", "d"]);
  pending.get("b")!.resolve(page([]));
  pending.get("d")!.resolve(page([]));
  await flush();
  expect(jobs.statuses().every((s) => s.status === "ready")).toBe(true);
  expect(disposed).toHaveLength(4);
  jobs.dispose();
});
it("clears active jobs without late resurrection and contains connection disposal failures", async () => {
  const index = createHistoryIndex(home()),
    waiting = deferred<ReturnType<typeof page>>();
  const dispose = vi.fn(async () => {
    throw new Error("dispose failed");
  });
  const acquire = async () => ({
    agents: {
      ref: () => ({
        workspaceId: "workspace",
        refresh: async () => {},
        timeline: { refetch: () => waiting.promise },
      }),
    },
    dispose,
  });
  const jobs = createIndexJobs(index, acquire as never);
  jobs.start(session);
  await flush();
  jobs.clear(session);
  waiting.resolve(page([entry(1, "late")]));
  await flush();
  expect(index.statuses()).toEqual([]);
  expect(jobs.statuses()).toEqual([]);
  expect(dispose).toHaveBeenCalledOnce();
  jobs.start(session);
  await flush();
  expect(jobs.statuses()[0]?.status).toBe("ready");
  expect(jobs.statuses()[0]?.error).toContain("dispose failed");
  jobs.dispose();
});
it("rejects an agent that moved workspaces and keeps the prior successful index", async () => {
  const index = createHistoryIndex(home());
  index.replace(session, [hit(1, "preserved")]);
  const refetch = vi.fn(),
    dispose = vi.fn();
  const jobs = createIndexJobs(index, (async () => ({
    agents: {
      ref: () => ({ workspaceId: "moved", refresh: async () => {}, timeline: { refetch } }),
    },
    dispose,
  })) as never);
  jobs.start(session);
  await flush();
  expect(jobs.statuses()[0]?.status).toBe("failed");
  expect(refetch).not.toHaveBeenCalled();
  expect(index.search("preserved")).toHaveLength(1);
  expect(dispose).toHaveBeenCalledOnce();
  jobs.dispose();
});
