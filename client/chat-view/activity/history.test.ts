import { afterEach, expect, it, vi } from "vitest";
import { createToolCallData } from "../../../shared/chat-view/activity/timeline";
import { cleanupActivityHistory, mergeResolvedGroups, useActivityGroup } from "./history";

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | void>,
  paseo: undefined as unknown,
  ref: { current: undefined as unknown },
}));
vi.mock("react", () => ({
  useMemo: (factory: () => unknown) => factory(),
  useRef: () => hooks.ref,
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("@getpaseo/plugin/client", () => ({ usePaseo: () => hooks.paseo }));

function commit() {
  const cleanups = hooks.effects.splice(0).map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}
afterEach(() => {
  hooks.effects.length = 0;
  hooks.ref.current = undefined;
  cleanupActivityHistory();
});

it("keeps reasoning folded while streamed text is ahead of the history fetch", async () => {
  const refetch = vi.fn(async () => ({
    entries: [
      {
        item: { type: "reasoning", text: "thinking" },
        seqStart: 1,
        seqEnd: 1,
        timestamp: new Date(1000).toISOString(),
      },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  }));
  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };
  const render = (text: string) =>
    useActivityGroup("agent", new Date(1000), { text, phase: "streaming" }, true);
  render("thinking");
  commit();
  await vi.waitFor(() => expect(render("thinking")?.isLeader).toBe(true));
  expect(refetch).toHaveBeenCalledOnce();
  hooks.effects.length = 0;
  expect(render("thinking more streamed tokens")?.isLeader).toBe(true);
  expect(render("different thought at the same timestamp")).toBeUndefined();
});

it("continues loading older activity when the tail contains only visible messages", async () => {
  const cursor = { epoch: "one", seq: 2 };
  const refetch = vi
    .fn()
    .mockResolvedValueOnce({
      entries: [
        {
          item: { type: "assistant_message", text: "answer" },
          seqStart: 2,
          seqEnd: 2,
          timestamp: new Date(2000).toISOString(),
        },
      ],
      epoch: "one",
      startCursor: cursor,
      hasOlder: true,
    })
    .mockResolvedValueOnce({
      entries: [
        {
          item: { type: "reasoning", text: "thinking" },
          seqStart: 1,
          seqEnd: 1,
          timestamp: new Date(1000).toISOString(),
        },
      ],
      epoch: "one",
      startCursor: null,
      hasOlder: false,
    });
  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };
  const render = () =>
    useActivityGroup("agent", new Date(1000), { text: "thinking", phase: "complete" }, true);
  render();
  commit();
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  hooks.effects.length = 0;
  expect(render()).toBeUndefined();
  commit();
  await vi.waitFor(() => expect(render()?.isLeader).toBe(true));
  expect(refetch).toHaveBeenNthCalledWith(2, {
    direction: "before",
    cursor,
    projection: "projected",
    limit: 200,
  });
});

it("keeps folded row geometry when virtualized activity rows unmount and remount", async () => {
  const tool = {
    type: "tool_call" as const,
    callId: "shell-1",
    name: "exec_command",
    status: "completed" as const,
    error: null,
    detail: { type: "shell" as const, command: "pwd", cwd: "/tmp" },
  };
  const refetch = vi.fn(async () => ({
    entries: [
      {
        item: { type: "reasoning", text: "thinking" },
        seqStart: 1,
        seqEnd: 1,
        timestamp: new Date(1000).toISOString(),
      },
      { item: tool, seqStart: 2, seqEnd: 2, timestamp: new Date(2000).toISOString() },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  }));
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => Object.assign(unsubscribe, { ready: Promise.resolve() }));
  hooks.paseo = { agents: { ref: () => ({ timeline: { refetch, subscribe } }) } };
  const render = () => useActivityGroup("agent", new Date(2000), createToolCallData(tool), true);
  render();
  const unmount = commit();
  await vi.waitFor(() => expect(render()?.isLeader).toBe(false));
  hooks.effects.length = 0;
  unmount();
  await Promise.resolve();
  expect(unsubscribe).toHaveBeenCalledOnce();
  // This row must stay hidden immediately, before the next asynchronous history read.
  expect(render()?.isLeader).toBe(false);
  const cached = render();
  const fetchCount = refetch.mock.calls.length;
  const unmountAgain = commit();
  await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(fetchCount + 1));
  expect(render()).toBe(cached);
  unmountAgain();
});

it.each(["unchanged", "new output", "new epoch", "replacement"])(
  "refreshes %s without prematurely clearing folded geometry",
  async (scenario) => {
    const page = {
      entries: [
        {
          item: { type: "reasoning", text: "thinking" },
          seqStart: 1,
          seqEnd: 1,
          timestamp: new Date(1000).toISOString(),
        },
      ],
      epoch: "one",
      startCursor: null,
      hasOlder: false,
    };
    let recover!: () => void;
    let finish!: (value: typeof page) => void;
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockImplementationOnce(
        () =>
          new Promise<typeof page>((resolve) => {
            finish = resolve;
          }),
      );
    hooks.paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch,
            subscribe: (listener: (update: unknown) => void) => {
              recover = () =>
                listener({
                  event: {
                    type: scenario === "replacement" ? "replacement" : "subscription_restored",
                  },
                });
              return Object.assign(vi.fn(), { ready: Promise.resolve() });
            },
          },
        }),
      },
    };
    const render = () =>
      useActivityGroup("agent", new Date(1000), { text: "thinking", phase: "complete" }, true);
    render();
    commit();
    await vi.waitFor(() => expect(render()?.isLeader).toBe(true));
    const cached = render();
    recover();
    if (scenario === "replacement") expect(render()).toBeUndefined();
    else expect(render()).toBe(cached);
    const refreshed = JSON.parse(JSON.stringify(page)) as typeof page;
    if (scenario === "new output") refreshed.entries[0]!.item.text = "updated thinking";
    if (scenario === "new epoch") {
      refreshed.epoch = "two";
      refreshed.entries = [];
    }
    finish(refreshed);
    await Promise.resolve();
    await Promise.resolve();
    if (scenario === "unchanged") expect(render()).toBe(cached);
    else if (scenario === "replacement")
      await vi.waitFor(() => expect(render()?.isLeader).toBe(true));
    else expect(render()).toBeUndefined();
    if (scenario === "new output") {
      expect(
        useActivityGroup(
          "agent",
          new Date(1000),
          { text: "updated thinking", phase: "complete" },
          true,
        )?.isLeader,
      ).toBe(true);
    }
  },
);

it("matches a later thought to its own text within the same folded group", async () => {
  const refetch = vi.fn(async () => ({
    entries: [
      {
        item: { type: "reasoning", text: "first thought" },
        seqStart: 1,
        seqEnd: 1,
        timestamp: new Date(1000).toISOString(),
      },
      {
        item: { type: "reasoning", text: "second thought" },
        seqStart: 2,
        seqEnd: 2,
        timestamp: new Date(2000).toISOString(),
      },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  }));
  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };
  const render = () =>
    useActivityGroup("agent", new Date(2000), { text: "second thought", phase: "complete" }, true);
  render();
  commit();
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  await Promise.resolve();
  expect(render()?.isLeader).toBe(false);
});

it("folds distinct thoughts sharing a provider timestamp without conflating their text", async () => {
  const refetch = vi.fn(async () => ({
    entries: [
      {
        item: { type: "reasoning", text: "first thought" },
        seqStart: 1,
        seqEnd: 1,
        timestamp: new Date(1000).toISOString(),
      },
      {
        item: { type: "reasoning", text: "second thought" },
        seqStart: 2,
        seqEnd: 2,
        timestamp: new Date(1000).toISOString(),
      },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  }));
  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };
  const render = (text: string) =>
    useActivityGroup("agent", new Date(1000), { text, phase: "complete" }, true);
  render("first thought");
  commit();
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  await Promise.resolve();
  expect(render("first thought")?.isLeader).toBe(true);
  expect(render("second thought")?.isLeader).toBe(false);
  expect(render("unrelated thought")).toBeUndefined();
});

it("preserves follower state and avoids regressing to leader when entries are isolated", () => {
  const target = new Map();
  const leaderGroup = {
    turnIndex: 1,
    leaderId: "tool:1",
    items: [
      { id: "tool:1", type: "tool_call" as const, timestamp: 1000 },
      { id: "tool:2", type: "tool_call" as const, timestamp: 2000 },
    ],
    hasReasoning: false,
    commandCount: 2,
    editCount: 0,
    readCount: 0,
    searchCount: 0,
    otherToolCount: 0,
    isRunning: false,
    hasError: false,
    startedAt: 1000,
  };
  target.set("tool:1", { group: leaderGroup, isLeader: true, itemId: "tool:1" });
  target.set("tool:2", { group: leaderGroup, isLeader: false, itemId: "tool:2" });

  const isolatedGroup = {
    turnIndex: 2,
    leaderId: "tool:2",
    items: [{ id: "tool:2", type: "tool_call" as const, timestamp: 2000 }],
    hasReasoning: false,
    commandCount: 1,
    editCount: 0,
    readCount: 0,
    searchCount: 0,
    otherToolCount: 0,
    isRunning: false,
    hasError: false,
    startedAt: 2000,
  };
  const fresh = new Map();
  fresh.set("tool:2", { group: isolatedGroup, isLeader: true, itemId: "tool:2" });

  mergeResolvedGroups(target, fresh);

  expect(target.get("tool:2")?.isLeader).toBe(false);
  expect(target.get("tool:2")?.group.items.length).toBe(2);
});

it("demotes false leader to follower when more complete history confirms it is a follower", () => {
  const target = new Map();
  // 模拟之前因断页误将 tool:2 记录为 Leader（包含 50 项）
  const oldFalseLeaderGroup = {
    turnIndex: 2,
    leaderId: "tool:2",
    items: Array.from({ length: 50 }).map((_, i) => ({
      id: `tool:${i + 2}`,
      type: "tool_call" as const,
      timestamp: 2000 + i,
    })),
    hasReasoning: false,
    commandCount: 50,
    editCount: 0,
    readCount: 0,
    searchCount: 0,
    otherToolCount: 0,
    isRunning: false,
    hasError: false,
    startedAt: 2000,
  };
  target.set("tool:2", { group: oldFalseLeaderGroup, isLeader: true, itemId: "tool:2" });

  // 后来拉回了更早的真实起点 tool:1，证实 tool:2 实际上是 tool:1 所在组的 Follower
  const completeLeaderGroup = {
    turnIndex: 1,
    leaderId: "tool:1",
    items: [
      { id: "tool:1", type: "tool_call" as const, timestamp: 1000 },
      { id: "tool:2", type: "tool_call" as const, timestamp: 2000 },
    ],
    hasReasoning: false,
    commandCount: 55,
    editCount: 0,
    readCount: 0,
    searchCount: 0,
    otherToolCount: 0,
    isRunning: false,
    hasError: false,
    startedAt: 1000,
  };
  const fresh = new Map();
  fresh.set("tool:1", { group: completeLeaderGroup, isLeader: true, itemId: "tool:1" });
  fresh.set("tool:2", { group: completeLeaderGroup, isLeader: false, itemId: "tool:2" });

  mergeResolvedGroups(target, fresh);

  // tool:2 必须被降级为 follower，绝不允许并存两个 Leader（消灭截图中 Ran 55 与 Ran 50 并存的现象）
  expect(target.get("tool:2")?.isLeader).toBe(false);
  expect(target.get("tool:1")?.isLeader).toBe(true);
});

it("retains resolved history memory across remounts even when new fetches only contain tail", async () => {
  const toolOld = {
    type: "tool_call" as const,
    callId: "old-tool",
    name: "exec_command",
    status: "completed" as const,
    error: null,
    detail: { type: "shell" as const, command: "ls", cwd: "/tmp" },
  };
  const toolNew = {
    type: "tool_call" as const,
    callId: "new-tool",
    name: "exec_command",
    status: "completed" as const,
    error: null,
    detail: { type: "shell" as const, command: "pwd", cwd: "/tmp" },
  };

  const initialPage = {
    entries: [
      {
        item: { type: "reasoning", text: "thinking" },
        seqStart: 1,
        seqEnd: 1,
        timestamp: new Date(1000).toISOString(),
      },
      { item: toolOld, seqStart: 2, seqEnd: 2, timestamp: new Date(2000).toISOString() },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  };

  const refetch = vi.fn().mockResolvedValue(initialPage);
  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };

  const renderOld = () =>
    useActivityGroup("agent", new Date(2000), createToolCallData(toolOld), true);

  renderOld();
  const unmountOld = commit();
  await vi.waitFor(() => expect(renderOld()?.isLeader).toBe(false));

  // 虚拟列表卸载旧条目
  unmountOld();
  await Promise.resolve();

  const tailOnlyPage = {
    entries: [
      {
        item: { type: "assistant_message" as const, text: "done old turn" },
        seqStart: 9,
        seqEnd: 9,
        timestamp: new Date(4000).toISOString(),
      },
      { item: toolNew, seqStart: 10, seqEnd: 10, timestamp: new Date(5000).toISOString() },
    ],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  };
  refetch.mockResolvedValue(tailOnlyPage);

  // 挂载新条目，重新激活 history 并拉取新的 tail
  const renderNew = () =>
    useActivityGroup("agent", new Date(5000), createToolCallData(toolNew), true);
  renderNew();
  commit();
  await vi.waitFor(() => expect(renderNew()?.isLeader).toBe(true));

  // 虚拟列表重新滚动到旧命令：即使最新一次 fetch 不含旧命令，旧命令必须立即从记忆池命中且保持 follower！
  expect(renderOld()?.isLeader).toBe(false);
  expect(renderOld()?.group.commandCount).toBe(1);
});

it("queues concurrent older requests while a fetch is in-flight instead of dropping them", async () => {
  const cursor1 = { epoch: "one", seq: 10 };
  const cursor2 = { epoch: "one", seq: 5 };

  let resolveSecondFetch!: (page: unknown) => void;
  const secondFetchPromise = new Promise((resolve) => {
    resolveSecondFetch = resolve;
  });

  const refetch = vi
    .fn()
    // 第一次 tail fetch：返回最新消息，有 older
    .mockResolvedValueOnce({
      entries: [
        {
          item: { type: "assistant_message", text: "latest" },
          seqStart: 10,
          seqEnd: 10,
          timestamp: new Date(3000).toISOString(),
        },
      ],
      epoch: "one",
      startCursor: cursor1,
      hasOlder: true,
    })
    // 第二次 before fetch：挂起中（in-flight）
    .mockImplementationOnce(() => secondFetchPromise)
    // 第三次 before fetch：返回最终思考
    .mockResolvedValueOnce({
      entries: [
        {
          item: { type: "reasoning", text: "thinking" },
          seqStart: 1,
          seqEnd: 1,
          timestamp: new Date(1000).toISOString(),
        },
      ],
      epoch: "one",
      startCursor: null,
      hasOlder: false,
    });

  hooks.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: () => Object.assign(vi.fn(), { ready: Promise.resolve() }),
        },
      }),
    },
  };

  const render = () =>
    useActivityGroup("agent", new Date(1000), { text: "thinking", phase: "complete" }, true);

  render();
  commit();

  // 1. 等待第一次 tail fetch 完成
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  hooks.effects.length = 0;

  // 2. 第一次 fetch 结束后未匹配，重新 render 触发第二次 fetch（before，in-flight）
  expect(render()).toBeUndefined();
  commit();
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
  hooks.effects.length = 0;

  // 3. 在第二次 fetch 正在进行中时（fetching === true），另一个未命中的组件触发了 older()
  expect(render()).toBeUndefined();
  commit();

  // 4. 第二次 fetch resolve
  resolveSecondFetch({
    entries: [
      {
        item: { type: "assistant_message", text: "mid" },
        seqStart: 5,
        seqEnd: 5,
        timestamp: new Date(2000).toISOString(),
      },
    ],
    epoch: "one",
    startCursor: cursor2,
    hasOlder: true,
  });

  // 5. 验证排队的第三次 fetch 被自动执行了
  await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(3));
  expect(refetch).toHaveBeenNthCalledWith(3, {
    direction: "before",
    cursor: cursor2,
    projection: "projected",
    limit: 200,
  });
});
