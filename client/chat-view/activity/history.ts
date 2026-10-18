import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import type { PaseoApi, PaseoAgentTimelineHandle } from "@getpaseo/client";
import type {
  ReasoningItemData,
  ToolCallItemData,
} from "../../../shared/chat-view/activity/timeline";
import { createTimelinePager, type TimelinePage } from "../timeline-pager";
import type { TurnGroup, ActivityEntry } from "./group-store";
import { buildActivityGroups } from "./group-store";

export interface ResolvedActivity {
  group: TurnGroup;
  isLeader: boolean;
  itemId: string;
}

export function mergeResolvedGroups(
  target: Map<string, ResolvedActivity>,
  freshGroups: Map<string, ResolvedActivity>,
) {
  for (const [key, fresh] of freshGroups) {
    const existing = target.get(key);
    if (!existing) {
      target.set(key, fresh);
      continue;
    }
    // 规则 1：一旦当前计算明确条目为 Follower，坚决更新为 Follower，彻底清除因过往分页截断残留的虚假 Leader
    if (!fresh.isLeader) {
      const mergedGroup =
        existing.group.items.length > fresh.group.items.length ? existing.group : fresh.group;
      target.set(key, { ...fresh, group: mergedGroup, isLeader: false });
      continue;
    }
    // 规则 2：若当前 fresh 局部算出来是 Leader，但历史已有记录已经把它判为了 Follower：
    // 这说明 fresh 是一次被分页截断的局部断层，坚决压制为 Follower！
    if (!existing.isLeader && fresh.isLeader) {
      const mergedGroup =
        fresh.group.items.length >= existing.group.items.length ? fresh.group : existing.group;
      target.set(key, { ...fresh, group: mergedGroup, isLeader: false });
      continue;
    }
    // 规则 3：双方都是 Leader 时，保留 items 更多、更完整的组
    if (existing.group.items.length > fresh.group.items.length) {
      if (fresh.group.isFinished) existing.group.isFinished = true;
      if (fresh.group.hasError) existing.group.hasError = true;
      if (!fresh.group.isRunning) existing.group.isRunning = false;
      continue;
    }
    target.set(key, fresh);
  }
}

function createHistory(timeline: PaseoAgentTimelineHandle) {
  const entries = new Map<number, ActivityEntry>();
  const resolvedMemory = new Map<string, ResolvedActivity>();
  const listeners = new Set<() => void>();
  let snapshot = buildActivityGroups([]);
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    const freshGroups = buildActivityGroups([...entries.values()]);
    mergeResolvedGroups(resolvedMemory, freshGroups);
    snapshot = new Map(resolvedMemory);
    for (const listener of listeners) listener();
  };
  const pager = createTimelinePager(timeline, {
    apply(page: TimelinePage, reset: boolean) {
      let changed = !loaded;
      loaded = true;
      if (reset) {
        changed = entries.size > 0 || resolvedMemory.size > 0;
        entries.clear();
        resolvedMemory.clear();
      }
      for (const entry of page.entries) {
        const previous = entries.get(entry.seqStart);
        if (
          (!previous || previous.seqEnd <= entry.seqEnd) &&
          JSON.stringify(previous) !== JSON.stringify(entry)
        ) {
          entries.set(entry.seqStart, entry);
          changed = true;
        }
      }
      return changed;
    },
    onChange: publish,
  });
  let subscription: ReturnType<PaseoAgentTimelineHandle["subscribe"]> | undefined;
  const start = () => {
    if (subscription) return;
    pager.resume();
    subscription = timeline.subscribe(({ event }) => {
      if (event.type === "replacement") {
        // A replaced session makes every read in flight stale, so drop them, then read the new tail.
        pager.invalidate();
        entries.clear();
        resolvedMemory.clear();
        loaded = false;
        publish();
        pager.load(true);
      } else if (event.type === "subscription_restored") {
        // Restored delivery does not replace history. Keep cached row heights while checking
        // for missed output; the epoch guard clears the window only if it actually changed.
        pager.load(true);
      } else if (event.type === "timeline" && !timer) {
        timer = setTimeout(() => {
          timer = undefined;
          pager.load(true);
        }, 100);
      }
    });
    void subscription.ready.then(() => pager.load(true)).catch(() => {});
  };
  return {
    refs: 0,
    start,
    snapshot: () => snapshot,
    getResolved: (key: string) => resolvedMemory.get(key),
    loaded: () => loaded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    older() {
      pager.load(false);
    },
    pause() {
      pager.stop();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      subscription?.();
      subscription = undefined;
    },
  };
}

let histories = new WeakMap<PaseoApi, Map<string, ReturnType<typeof createHistory>>>();
const active = new Set<ReturnType<typeof createHistory>>();
export function cleanupActivityHistory() {
  for (const history of active) history.pause();
  active.clear();
  histories = new WeakMap();
}

export function useActivityGroup(
  agentId: string,
  timestamp: Date,
  data: ReasoningItemData | ToolCallItemData,
  enabled: boolean,
) {
  const paseo = usePaseo();
  const history = useMemo(() => {
    if (!enabled) return undefined;
    let agents = histories.get(paseo);
    if (!agents) {
      agents = new Map();
      histories.set(paseo, agents);
    }
    let session = agents.get(agentId);
    if (!session) {
      session = createHistory(paseo.agents.ref(agentId).timeline);
      agents.set(agentId, session);
      active.add(session);
    }
    return session;
  }, [paseo, agentId, enabled]);
  useEffect(() => {
    if (!history) return;
    history.refs++;
    history.start();
    return () => {
      history.refs--;
      void Promise.resolve().then(() => {
        if (history.refs === 0) {
          // Virtualization can remove every activity row while the agent is still open.
          // Stop network work, but retain folding data so remounts do not grow then shrink rows.
          history.pause();
        }
      });
    };
  }, [history, paseo, agentId]);
  const snapshot = useSyncExternalStore(
    history?.subscribe ?? noSubscribe,
    history?.snapshot ?? emptySnapshot,
    emptySnapshot,
  );
  // Keep this key aligned with activityIdentity so it stays stable while the text streams.
  const key = "name" in data ? `tool:${data.callId}` : `reasoning:${timestamp.getTime()}`;
  const previous = useRef<
    | {
        history: typeof history;
        timestamp: number;
        text: string;
        key: string;
      }
    | undefined
  >(undefined);
  let result = snapshot.get(key) ?? history?.getResolved(key);
  if (!("name" in data)) {
    const matches = (entry: typeof result): boolean => {
      const thought = entry?.group.items.find((item) => item.id === entry.itemId)?.reasoningData
        ?.text;
      return thought !== undefined && (thought === data.text || data.text.startsWith(thought));
    };
    const cached = previous.current;
    let resolvedKey = key;
    if (!matches(result)) {
      const candidates = [...snapshot].filter(
        ([identity, entry]) => identity.startsWith(`${key}:`) && matches(entry),
      );
      if (candidates.length === 1) {
        [resolvedKey, result] = candidates[0]!;
      } else if (
        history &&
        cached?.history === history &&
        cached.timestamp === timestamp.getTime() &&
        cached.text.length > 0 &&
        data.text.startsWith(cached.text)
      ) {
        resolvedKey = cached.key;
        result = matches(snapshot.get(resolvedKey)) ? snapshot.get(resolvedKey) : undefined;
      } else {
        result = undefined;
      }
    }
    previous.current = result
      ? { history, timestamp: timestamp.getTime(), text: data.text, key: resolvedKey }
      : undefined;
  }
  useEffect(() => {
    // start() owns the initial tail read. Only paginate once that read has resolved.
    if (history?.loaded() && !result) history.older();
  }, [history, result, snapshot]);
  return result;
}
const empty = buildActivityGroups([]);
const emptySnapshot = () => empty;
const noSubscribe = () => () => {};
