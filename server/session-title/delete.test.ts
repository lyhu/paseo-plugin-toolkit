import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import { createSessionDeletion } from "./delete";
import { createTitleStore } from "./storage";
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "toolkit-session-delete-"));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));
  const store = createTitleStore(home);
  let present = true;
  const agent = {
    id: "a",
    workspaceId: "w",
    title: "会员续费",
    cwd: "/project",
    provider: "codex",
    status: "idle",
    activeTurn: null,
    persistence: { provider: "codex", sessionId: "native" },
    labels: {},
    archivedAt: null,
  } as PaseoAgent;
  const refresh = vi.fn(async () => (present ? { agent: { ...agent } } : undefined));
  const archive = vi.fn(async () => {
    agent.archivedAt = "archived";
    agent.status = "closed";
    return { archivedAt: "archived" };
  });
  const list = vi.fn(async () => ({ entries: [{ agent }], pageInfo: { nextCursor: null } }));
  const refetch = vi.fn(async () => ({ entries: [], hasOlder: false, error: null, gap: false }));
  const paseo = {
    agents: { ref: () => ({ refresh, archive, timeline: { refetch } }), list },
    config: { get: async () => ({ config: { providers: {} } }) },
  } as unknown as PaseoApi;
  const remove = vi.fn(async () => {}),
    close = vi.fn();
  const prepare = vi.fn(async () => ({ id: "native", remove, close }));
  const block = vi.fn(async () => {
    store.update("a", (state) => ({ ...state, deleting: true }));
  });
  const forget = vi.fn(() => store.remove("a")),
    clearSearch = vi.fn();
  const command = vi.fn(async () => {
    present = false;
    return { deletedCount: 1, agentIds: ["a"] };
  });
  const run = createSessionDeletion({
    store,
    titles: { block, forget },
    clearSearch,
    prepare,
    command,
  });
  const input = { agentId: "a", workspaceId: "w", previousTitle: "会员续费" };
  return {
    run,
    paseo,
    input,
    agent,
    store,
    prepare,
    remove,
    close,
    block,
    forget,
    clearSearch,
    command,
    archive,
    list,
    refresh,
    refetch,
  };
}
it("closes the idle runtime, removes provider history, verifies Paseo deletion and clears Toolkit data", async () => {
  const f = fixture();
  expect(await f.run(f.paseo, f.input)).toEqual({ deleted: true });
  expect(f.archive).toHaveBeenCalledOnce();
  expect(f.remove).toHaveBeenCalledOnce();
  expect(f.archive.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]!);
  expect(f.remove.mock.invocationCallOrder[0]).toBeLessThan(f.command.mock.invocationCallOrder[0]!);
  expect(f.command).toHaveBeenCalledWith(["delete", "a"], expect.any(AbortSignal));
  expect(f.forget).toHaveBeenCalledWith("a");
  expect(f.clearSearch).toHaveBeenCalledWith("a");
  expect(f.close).toHaveBeenCalledOnce();
});
it.each(["running", "workspace", "title", "shared", "unsupported"])(
  "refuses %s before deleting anything",
  async (kind) => {
    const f = fixture();
    if (kind === "running") f.agent.activeTurn = { turnId: "t", startedAt: null };
    if (kind === "workspace") f.input.workspaceId = "other";
    if (kind === "title") f.input.previousTitle = "changed";
    if (kind === "shared")
      f.list.mockResolvedValue({
        entries: [{ agent: { ...f.agent, id: "other" } }],
        pageInfo: { nextCursor: null },
      });
    if (kind === "unsupported")
      f.prepare.mockRejectedValue(new Error("此 Provider 尚不支持物理删除。"));
    await expect(f.run(f.paseo, f.input)).rejects.toThrow();
    expect(f.block).not.toHaveBeenCalled();
    expect(f.archive).not.toHaveBeenCalled();
    expect(f.command).not.toHaveBeenCalled();
  },
);
it("preserves the session and permits retry when provider cleanup fails", async () => {
  const f = fixture();
  f.remove.mockRejectedValueOnce(new Error("历史仍存在"));
  await expect(f.run(f.paseo, f.input)).rejects.toThrow("历史仍存在");
  expect(f.command).not.toHaveBeenCalled();
  expect(f.forget).not.toHaveBeenCalled();
  expect(f.store.read("a").deleting).toBe(true);
  expect(await f.run(f.paseo, f.input)).toEqual({ deleted: true });
});
it("does not purge the provider twice if Paseo deletion fails and is retried", async () => {
  const f = fixture();
  f.command.mockRejectedValueOnce(new Error("连接失败"));
  await expect(f.run(f.paseo, f.input)).rejects.toThrow();
  expect(f.forget).not.toHaveBeenCalled();
  expect(await f.run(f.paseo, f.input)).toEqual({ deleted: true });
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(f.remove).toHaveBeenCalledOnce();
});
it("does not report success when the daemon acknowledges deletion but the record still exists", async () => {
  const f = fixture();
  f.command.mockResolvedValue({ deletedCount: 1, agentIds: ["a"] });
  await expect(f.run(f.paseo, f.input)).rejects.toThrow("删除未完成");
  expect(f.forget).not.toHaveBeenCalled();
});
it("refuses a changed Provider handle after its original history has been removed", async () => {
  const f = fixture();
  f.command.mockRejectedValueOnce(new Error("连接失败"));
  await expect(f.run(f.paseo, f.input)).rejects.toThrow();
  f.agent.persistence!.sessionId = "different";
  await expect(f.run(f.paseo, f.input)).rejects.toThrow("标识已变化");
});
it("can delete a verified empty session without a Provider transcript", async () => {
  const f = fixture();
  f.agent.persistence = null;
  expect(await f.run(f.paseo, f.input)).toEqual({ deleted: true });
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.refetch).toHaveBeenCalledOnce();
});
