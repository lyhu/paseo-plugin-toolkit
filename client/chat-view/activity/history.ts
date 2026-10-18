import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import type { PaseoApi, PaseoAgentTimelineHandle } from "@getpaseo/client";
import {
  activityDataKey,
  projectTimelineItem,
  type ReasoningItemData,
  type ToolCallItemData,
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
  const updated = new Map<TurnGroup, TurnGroup>();
  for (const [key, fresh] of freshGroups) {
    const existing = target.get(key);
    if (!existing) {
      target.set(key, fresh);
      continue;
    }
    if (
      existing.group === fresh.group &&
      existing.isLeader === fresh.isLeader &&
      existing.itemId === fresh.itemId
    )
      continue;
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
      const group = updated.get(existing.group) ?? existing.group;
      const next = {
        ...group,
        isFinished: fresh.group.isFinished || group.isFinished,
        hasError: fresh.group.hasError || group.hasError,
        isRunning: fresh.group.isRunning && group.isRunning,
      };
      if (
        next.isFinished !== group.isFinished ||
        next.hasError !== group.hasError ||
        next.isRunning !== group.isRunning
      )
        updated.set(existing.group, next);
      continue;
    }
    target.set(key, fresh);
  }
  for (const [key, entry] of target) {
    const group = updated.get(entry.group);
    if (group) target.set(key, { ...entry, group });
  }
}

function createHistory(timeline: PaseoAgentTimelineHandle) {
  const entries = new Map<number, ActivityEntry>();
  const ordered: ActivityEntry[] = [];
  const toolStarts = new Map<string, number>();
  const dataCache = new WeakMap<ActivityEntry["item"], ReasoningItemData | ToolCallItemData>();
  let dirty = Infinity;
  let bytes = 0;
  const costs = new Map<number, number>();
  const position = (seq: number) => {
    let lo = 0,
      hi = ordered.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (ordered[mid]!.seqStart < seq) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const clear = () => {
    entries.clear();
    ordered.length = 0;
    toolStarts.clear();
    costs.clear();
    bytes = 0;
    dirty = 0;
  };
  const resolvedMemory = new Map<string, ResolvedActivity>();
  const listeners = new Set<() => void>();
  let snapshot = buildActivityGroups([]);
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    let from = position(dirty);
    while (
      from > 0 &&
      projectTimelineItem(ordered[from - 1]!.item, ordered[from - 1]!.timestamp).kind === "activity"
    )
      from--;
    // Timestamp collisions need the complete identity count to preserve reasoning lookup keys.
    const times = new Set<number>();
    for (const entry of ordered) {
      if (entry.item.type !== "reasoning") continue;
      if (times.has(Date.parse(entry.timestamp))) {
        from = 0;
        break;
      }
      times.add(Date.parse(entry.timestamp));
    }
    const freshGroups = buildActivityGroups(ordered.slice(from), dataCache);
    const reused = new Map<TurnGroup, TurnGroup>();
    for (const [key, fresh] of freshGroups) {
      let group = reused.get(fresh.group);
      if (!group) {
        const old = resolvedMemory.get(key)?.group;
        group =
          old &&
          old.items.length === fresh.group.items.length &&
          Object.keys(fresh.group).every(
            (field) =>
              field === "items" ||
              old[field as keyof TurnGroup] === fresh.group[field as keyof TurnGroup],
          ) &&
          old.items.every((item, index) => {
            const next = fresh.group.items[index]!;
            return (
              item.id === next.id &&
              item.timestamp === next.timestamp &&
              item.reasoningData === next.reasoningData &&
              item.toolCallData === next.toolCallData
            );
          })
            ? old
            : fresh.group;
        reused.set(fresh.group, group);
      }
      fresh.group = group;
    }
    dirty = Infinity;
    mergeResolvedGroups(resolvedMemory, freshGroups);
    snapshot = new Map();
    for (const listener of listeners) listener();
  };
  const pager = createTimelinePager(timeline, {
    apply(page: TimelinePage, reset: boolean) {
      let changed = !loaded;
      loaded = true;
      if (reset) {
        changed = entries.size > 0 || resolvedMemory.size > 0;
        clear();
        resolvedMemory.clear();
      }
      for (const entry of page.entries) {
        const previous = entries.get(entry.seqStart);
        if (previous && previous.seqEnd > entry.seqEnd) continue;
        const serialized = JSON.stringify(entry);
        if (previous && JSON.stringify(previous) === serialized) continue;
        // Account for the raw entry and its projected detail without retaining serialized text.
        const cost = serialized.length * 4;
        bytes += cost - (costs.get(entry.seqStart) ?? 0);
        costs.set(entry.seqStart, cost);
        entries.set(entry.seqStart, entry);
        const index = position(entry.seqStart);
        if (previous) ordered[index] = entry;
        else ordered.splice(index, 0, entry);
        let affected = entry.seqStart;
        if (entry.item.type === "tool_call") {
          affected = Math.min(affected, toolStarts.get(entry.item.callId) ?? affected);
          toolStarts.set(entry.item.callId, affected);
        }
        dirty = Math.min(dirty, affected);
        changed = true;
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
        clear();
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
    lastUsed: Date.now(),
    size: () => entries.size,
    bytes: () => bytes,
    discard() {
      clear();
      resolvedMemory.clear();
      snapshot = new Map();
      listeners.clear();
    },
    start,
    snapshot: () => resolvedMemory,
    pending: () => snapshot,
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
const forget = new Map<ReturnType<typeof createHistory>, () => void>();
let expiry: ReturnType<typeof setTimeout> | undefined;
function trimHistories() {
  clearTimeout(expiry);
  expiry = undefined;
  const idle = [...active]
    .filter((history) => history.refs === 0)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  let entries = idle.reduce((sum, history) => sum + history.size(), 0);
  let bytes = idle.reduce((sum, history) => sum + history.bytes(), 0);
  while (
    idle.length &&
    (idle.length > 5 ||
      entries > 20000 ||
      bytes > 16 * 1024 * 1024 ||
      Date.now() - idle[0]!.lastUsed >= 120000)
  ) {
    const history = idle.shift()!;
    entries -= history.size();
    bytes -= history.bytes();
    history.pause();
    history.discard();
    forget.get(history)?.();
    forget.delete(history);
    active.delete(history);
  }
  if (idle.length)
    expiry = setTimeout(trimHistories, Math.max(1, 120000 - (Date.now() - idle[0]!.lastUsed)));
}
export function cleanupActivityHistory(paseo?: PaseoApi) {
  const owned = paseo ? [...(histories.get(paseo)?.values() ?? [])] : [...active];
  for (const history of owned) {
    history.pause();
    history.discard();
    active.delete(history);
    forget.delete(history);
  }
  if (paseo) histories.delete(paseo);
  else {
    histories = new WeakMap();
    forget.clear();
  }
  trimHistories();
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
      if (expiry === undefined) expiry = setTimeout(trimHistories, 120000);
      forget.set(session, () => {
        agents!.delete(agentId);
      });
    }
    return session;
  }, [paseo, agentId, enabled]);
  useEffect(() => {
    if (!history) return;
    history.refs++;
    history.lastUsed = Date.now();
    history.start();
    return () => {
      history.refs--;
      void Promise.resolve().then(() => {
        if (history.refs === 0) {
          // Virtualization can remove every activity row while the agent is still open.
          // Stop network work, but retain folding data so remounts do not grow then shrink rows.
          history.pause();
          history.lastUsed = Date.now();
          trimHistories();
        }
      });
    };
  }, [history, paseo, agentId]);
  // Keep this key aligned with the folding identity so it stays stable while the text streams.
  const key = activityDataKey(data, timestamp);
  const previous = useRef<
    | {
        history: typeof history;
        timestamp: number;
        text: string;
        key: string;
      }
    | undefined
  >(undefined);
  const select = () => {
    const snapshot = history?.snapshot() ?? empty;
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
    return result ?? history?.pending() ?? empty;
  };
  const selected = useSyncExternalStore(history?.subscribe ?? noSubscribe, select, emptySnapshot);
  const result = selected instanceof Map ? undefined : selected;
  useEffect(() => {
    // start() owns the initial tail read. Only paginate once that read has resolved.
    if (history?.loaded() && !result) history.older();
  }, [history, result, selected]);
  return result;
}
const empty = buildActivityGroups([]);
const emptySnapshot = () => empty;
const noSubscribe = () => () => {};
