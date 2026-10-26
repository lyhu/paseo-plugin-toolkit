import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaseoApi, PaseoAgentTimelineHandle } from "@getpaseo/client";
import { createTitleStore } from "./storage";
import { createTitleService } from "./service";
import { sessionTitleSettings } from "../../shared/session-title/contracts";
import type { ChatClient } from "../models/chat-client";

type Page = Awaited<ReturnType<PaseoAgentTimelineHandle["refetch"]>>;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const home = mkdtempSync(join(tmpdir(), "toolkit-title-"));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));
  const store = createTitleStore(home);
  const agent = {
    id: "a",
    workspaceId: "w",
    title: null as string | null,
    status: "idle",
    activeTurn: null,
    archivedAt: null as string | null,
  };
  let epoch = "epoch";
  const entries: Page["entries"] = [];
  const add = (role: "user_message" | "assistant_message", text: string) => {
    const seq = entries.length + 1;
    entries.push({
      provider: "codex",
      item: { type: role, text, messageId: `message-${seq}` },
      timestamp: "2026-10-26T00:00:00Z",
      seqStart: seq,
      seqEnd: seq,
      sourceSeqRanges: [],
      collapsed: [],
    });
  };
  const refetch = vi.fn(
    async (): Promise<Page> => ({
      requestId: "r",
      agentId: "a",
      agent: null,
      direction: "tail",
      projection: "canonical",
      epoch,
      reset: false,
      staleCursor: false,
      gap: false,
      window: { minSeq: 1, maxSeq: entries.length, nextSeq: entries.length + 1 },
      startCursor: entries.length ? { epoch, seq: 1 } : null,
      endCursor: null,
      hasOlder: false,
      hasNewer: false,
      entries: [...entries],
      error: null,
    }),
  );
  const refresh = vi.fn(async () => ({ agent: { ...agent }, project: null }));
  const archive = vi.fn(async () => {
    agent.archivedAt = "2026-10-26T10:00:00Z";
    agent.status = "closed";
    service.archived("a", agent.archivedAt);
    return { archivedAt: agent.archivedAt };
  });
  const paseo = {
    agents: { ref: () => ({ refresh, archive, timeline: { refetch } }) },
  } as unknown as PaseoApi;
  const complete = vi.fn<ChatClient["complete"]>().mockImplementation(async () => ({
    content: JSON.stringify({
      summary: "目标：修复会员权益同步。已确认根因，待回归测试。",
      title: "修复会员权益同步",
      changed: true,
      reason: "主要目标已明确",
    }),
  }));
  const rename = vi.fn(async (_id: string, title: string, _signal: AbortSignal) => {
    agent.title = title;
  });
  const settings = sessionTitleSettings.schema.parse({ enabled: true });
  const build = () =>
    createTitleService({
      store,
      models: { resolve: vi.fn() },
      settings: async () => settings,
      rename,
      client: () => ({ complete, listModels: vi.fn() }),
    });
  let service = build();
  service.created("a", null, "w");
  const round = (text = "修复会员权益同步") => {
    add("user_message", text);
    add("assistant_message", "完成根因分析，需要回归测试。");
  };
  return {
    home,
    store,
    agent,
    add,
    round,
    paseo,
    complete,
    rename,
    archive,
    settings,
    refetch,
    refresh,
    get service() {
      return service;
    },
    reopen: async () => {
      await service.dispose();
      service = build();
    },
    replaceHistory: () => {
      epoch = "replacement";
    },
  };
}
describe("session title lifecycle", () => {
  it("names only the first five completed requests, persists across reload, and ignores duplicate hooks", async () => {
    const f = fixture();
    for (let index = 0; index < 6; index++) {
      f.round(`会员需求 ${index}`);
      await f.service.automatic(f.paseo, "a");
      await f.service.automatic(f.paseo, "a");
      if (index === 1) await f.reopen();
    }
    expect(f.complete).toHaveBeenCalledTimes(5);
    expect(f.rename).toHaveBeenCalledTimes(5);
    expect(f.store.read("a").rounds).toBe(5);
    expect(f.store.read("a").result?.applied).toBe(true);
    expect(f.service.read("a").job?.source).toBe("automatic");
    const file = join(
      f.home,
      "toolkit",
      "session-title",
      `${createHash("sha256").update("a").digest("hex")}.json`,
    );
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  it("protects explicit initial titles and unknown old sessions", async () => {
    const f = fixture();
    f.agent.title = "人工指定的业务标题";
    f.round();
    await f.service.automatic(f.paseo, "a");
    expect(f.store.read("a").protected).toBe(true);
    await f.service.automatic(f.paseo, "old");
    expect(f.complete).not.toHaveBeenCalled();
  });
  it("accepts Paseo's provisional first-line title on a newly observed session", async () => {
    const f = fixture();
    f.agent.title = "修复会员权益同步";
    f.round();
    await f.service.automatic(f.paseo, "a");
    expect(f.rename).toHaveBeenCalledOnce();
  });
  it("keeps a stable title on refinement and stops after an outside rename", async () => {
    const f = fixture();
    f.round();
    await f.service.automatic(f.paseo, "a");
    f.complete.mockResolvedValue({
      content: JSON.stringify({
        summary: "补充测试",
        title: "会员权益回归测试",
        changed: false,
        reason: "同一业务目标的细化",
      }),
    });
    f.round("补充回归测试");
    await f.service.automatic(f.paseo, "a");
    expect(f.rename).toHaveBeenCalledTimes(1);
    expect(f.store.read("a").result?.analysis.summary).toBe("补充测试");
    f.agent.title = "用户亲自命名";
    f.round();
    await f.service.automatic(f.paseo, "a");
    expect(f.store.read("a").protected).toBe(true);
    expect(f.complete).toHaveBeenCalledTimes(2);
  });
  it("does not count a hook without a new user request or an assistant answer", async () => {
    const f = fixture();
    f.add("user_message", "问题");
    await f.service.automatic(f.paseo, "a");
    expect(f.store.read("a").rounds).toBe(0);
    f.add("assistant_message", "回答");
    await f.service.automatic(f.paseo, "a");
    f.add("assistant_message", "自动续跑的更多输出");
    await f.service.automatic(f.paseo, "a");
    expect(f.complete).toHaveBeenCalledTimes(1);
  });
  it("stops automatic processing after a history replacement or missed request boundary", async () => {
    const f = fixture();
    f.round();
    await f.service.automatic(f.paseo, "a");
    f.replaceHistory();
    f.round();
    await f.service.automatic(f.paseo, "a");
    expect(f.store.read("a").protected).toBe(true);
    expect(f.complete).toHaveBeenCalledTimes(1);
    const other = fixture();
    other.round();
    other.round();
    await other.service.automatic(other.paseo, "a");
    expect(other.complete).not.toHaveBeenCalled();
  });
  it("the explicit command silently summarizes all history and applies even with automatic naming disabled", async () => {
    const f = fixture();
    f.settings.enabled = false;
    for (let index = 0; index < 12; index++) f.round();
    const job = await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    expect(job.phase).toBe("done");
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.service.read("a").result?.messages).toBe(24);
    await f.reopen();
    const result = f.service.read("a").result!;
    expect(f.store.read("a").protected).toBe(true);
    expect(f.service.read("a").result?.applied).toBe(true);
    await expect(f.service.apply(f.paseo, "a", result.id)).rejects.toThrow("已应用");
  });
  it.each(["title", "messages", "epoch"])(
    "the silent command rejects its result when %s changes during analysis",
    async (change) => {
      const f = fixture();
      f.round();
      const original = f.complete.getMockImplementation()!;
      f.complete.mockImplementation(async (...args) => {
        const response = await original(...args);
        if (change === "title") f.agent.title = "人工修改";
        if (change === "messages") f.round();
        if (change === "epoch") f.replaceHistory();
        return response;
      });
      await f.service.start(f.paseo, "a");
      await f.service.settled("a");
      expect(f.service.read("a").job?.phase).toBe("error");
      expect(f.service.read("a").job?.error).toContain("已变化");
      expect(f.rename).not.toHaveBeenCalled();
    },
  );
  it("does not overwrite a manual rename made while the model was responding", async () => {
    const f = fixture();
    f.round();
    const original = f.complete.getMockImplementation()!;
    f.complete.mockImplementation(async (...args) => {
      const response = await original(...args);
      f.agent.title = "期间手动改名";
      return response;
    });
    await f.service.automatic(f.paseo, "a");
    expect(f.rename).not.toHaveBeenCalled();
    expect(f.store.read("a").error).toContain("标题已变化");
  });
  it("disabling automatic naming during a model request prevents its write", async () => {
    const f = fixture();
    f.round();
    const original = f.complete.getMockImplementation()!;
    f.complete.mockImplementation(async (...args) => {
      f.settings.enabled = false;
      return original(...args);
    });
    await f.service.automatic(f.paseo, "a");
    expect(f.rename).not.toHaveBeenCalled();
  });
  it("cancel and new-turn invalidation abort in-flight requests and preserve the prior result", async () => {
    const f = fixture();
    f.round();
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    const previous = f.service.read("a").result;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.complete.mockImplementation(
      (_messages, options) =>
        new Promise((_resolve, reject) => {
          entered();
          options!.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    await f.service.start(f.paseo, "a");
    await pending;
    expect(f.service.cancel("a")).toBe(true);
    await f.service.settled("a");
    expect(f.service.read("a").job?.phase).toBe("canceled");
    expect(f.service.read("a").result).toEqual(previous);
    f.agent.status = "running";
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    expect(f.service.read("a").job?.error).toContain("执行完成");
  });
  it("invalid model output cannot erase the saved summary or expose provider errors", async () => {
    const f = fixture();
    f.round();
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    const previous = f.service.read("a").result;
    f.complete.mockRejectedValue(new Error("secret provider body api-key-123"));
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    expect(f.service.read("a").result).toEqual(previous);
    expect(f.service.read("a").job?.error).not.toContain("secret");
    expect(f.rename).toHaveBeenCalledOnce();
  });
  it("keeps a failed silent write inspectable and lets diagnostics retry it without another model call", async () => {
    const f = fixture();
    f.round();
    f.rename.mockRejectedValueOnce(
      new Error("会话标题写回失败，请检查此 Host 的 Paseo CLI 与 daemon 连接。"),
    );
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    const state = f.service.read("a");
    expect(state.job).toMatchObject({ source: "command", phase: "error" });
    expect(state.result?.applied).toBe(false);
    expect(state.error).toContain("写回失败");
    await f.service.apply(f.paseo, "a", state.result!.id);
    expect(f.service.read("a").job).toMatchObject({ phase: "done", error: null });
    expect(f.complete).toHaveBeenCalledOnce();
  });
  it("archives immediately, continues after the archive hook, and stores browsable workspace history", async () => {
    const f = fixture();
    f.round();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = f.complete.getMockImplementation()!;
    f.complete.mockImplementation(async (...args) => {
      enter();
      await gate;
      return original(...args);
    });
    expect(await f.service.archive(f.paseo, "a")).toEqual({ archived: true });
    expect(f.agent.status).toBe("closed");
    await entered;
    expect(f.rename).not.toHaveBeenCalled();
    expect(f.store.read("a").archiveRequest).not.toBeNull();
    release();
    await f.service.settled("a");
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.store.read("a").archiveRequest).toBeNull();
    expect(f.service.list("w")).toMatchObject([
      { agentId: "a", archived: true, runs: 1, phase: "done" },
    ]);
    expect(f.service.list("unrelated-workspace")).toEqual([]);
    await f.reopen();
    expect(f.service.read("a").history).toMatchObject([
      { source: "archive", phase: "done", result: { applied: true } },
    ]);
  });
  it("recovers interrupted archived work without archiving again", async () => {
    const f = fixture();
    f.round();
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const original = f.complete.getMockImplementation()!;
    f.complete.mockImplementation(
      (_messages, options) =>
        new Promise((_resolve, reject) => {
          enter();
          options!.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    await f.service.archive(f.paseo, "a");
    await entered;
    await f.reopen();
    expect(f.store.read("a").archiveRequest).not.toBeNull();
    f.complete.mockImplementation(original);
    expect(await f.service.recover(f.paseo)).toEqual({ resumed: 1 });
    await f.service.settled("a");
    expect(f.archive).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.service.read("a").job).toMatchObject({ phase: "done", source: "archive" });
  });
  it("preserves the archive and original title when the model fails, and keeps every later attempt", async () => {
    const f = fixture();
    f.round();
    const original = f.complete.getMockImplementation()!;
    f.complete.mockRejectedValueOnce(new Error("model unavailable"));
    await f.service.archive(f.paseo, "a");
    await f.service.settled("a");
    expect(f.agent.archivedAt).not.toBeNull();
    expect(f.agent.title).toBeNull();
    expect(f.service.read("a").history).toMatchObject([{ phase: "error", source: "archive" }]);
    f.complete.mockImplementation(original);
    await f.service.start(f.paseo, "a");
    await f.service.settled("a");
    await f.reopen();
    expect(f.service.read("a").history.map((job) => job.phase)).toEqual(["error", "done"]);
  });
  it("does not start the model if archiving fails and ignores duplicate archive requests", async () => {
    const f = fixture();
    f.round();
    f.archive.mockRejectedValueOnce(new Error("offline"));
    await expect(f.service.archive(f.paseo, "a")).rejects.toThrow("归档未完成");
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.agent.archivedAt).toBeNull();
    expect(f.store.read("a").archiveRequest).toBeNull();
    await f.service.archive(f.paseo, "a");
    await f.service.archive(f.paseo, "a");
    await f.service.settled("a");
    expect(f.archive).toHaveBeenCalledTimes(2); // one failed attempt, one actual archive
    expect(f.complete).toHaveBeenCalledOnce();
  });
  it("verifies a lost archive acknowledgement without archiving the same session twice", async () => {
    const f = fixture();
    f.round();
    f.archive.mockImplementationOnce(async () => {
      f.agent.archivedAt = "2026-10-26T10:00:00Z";
      f.agent.status = "closed";
      throw new Error("acknowledgement lost");
    });
    expect(await f.service.archive(f.paseo, "a")).toEqual({ archived: true });
    await f.service.settled("a");
    expect(f.archive).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
  });
  it("retains an unknown archive intent through offline recovery and later resumes without repeating the side effect", async () => {
    const f = fixture();
    f.round();
    f.archive.mockImplementationOnce(async () => {
      f.refresh.mockRejectedValueOnce(new Error("offline"));
      throw new Error("ack lost");
    });
    await expect(f.service.archive(f.paseo, "a")).rejects.toThrow("归档未完成");
    expect(f.store.read("a").archiveRequest).not.toBeNull();
    f.refresh.mockRejectedValueOnce(new Error("still offline"));
    expect(await f.service.recover(f.paseo)).toEqual({ resumed: 0 });
    expect(f.store.read("a").archiveRequest).not.toBeNull();
    f.agent.archivedAt = "2026-10-26T10:00:00Z";
    f.agent.status = "closed";
    expect(await f.service.recover(f.paseo)).toEqual({ resumed: 1 });
    await f.service.settled("a");
    expect(f.archive).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledOnce();
  });
});
