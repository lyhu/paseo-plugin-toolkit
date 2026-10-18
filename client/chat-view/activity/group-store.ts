import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  createReasoningData,
  createToolCallData,
  projectTimelineItem,
} from "../../../shared/chat-view/activity/timeline";
import type {
  ReasoningItemData,
  ToolCallItemData,
} from "../../../shared/chat-view/activity/timeline";

export interface GroupItemData {
  id: string;
  type: "reasoning" | "tool_call";
  timestamp: number;
  reasoningData?: ReasoningItemData;
  toolCallData?: ToolCallItemData;
}

export interface TurnGroup {
  turnIndex: number;
  agentId?: string;
  leaderId: string;
  items: GroupItemData[];
  hasReasoning: boolean;
  commandCount: number;
  editCount: number;
  readCount: number;
  searchCount: number;
  otherToolCount: number;
  isRunning: boolean;
  isFinished?: boolean;
  hasError: boolean;
  startedAt: number;
  completedAt?: number;
}

export function isFileEditAction(tc: ToolCallItemData): boolean {
  if (tc.detail && typeof tc.detail === "object") {
    const detailType = (tc.detail as { type?: string }).type;
    if (
      detailType === "edit" ||
      detailType === "write" ||
      detailType === "patch" ||
      detailType === "create"
    ) {
      return true;
    }
    if (detailType === "read") {
      return false;
    }
  }

  if (tc.presentation.diffStats) {
    return true;
  }

  const label = tc.presentation.label.toLowerCase();
  if (
    label.includes("write") ||
    label.includes("edit") ||
    label.includes("patch") ||
    label.includes("create")
  ) {
    return true;
  }

  const name = tc.name.toLowerCase();
  if (
    name.includes("write") ||
    name.includes("edit") ||
    name.includes("replace") ||
    name.includes("patch") ||
    name.includes("create")
  ) {
    return true;
  }

  return false;
}

export function createActivityGroup(
  turnIndex: number,
  leaderId: string,
  startedAt: number,
  items: GroupItemData[] = [],
): TurnGroup {
  return {
    turnIndex,
    leaderId,
    items,
    hasReasoning: false,
    commandCount: 0,
    editCount: 0,
    readCount: 0,
    searchCount: 0,
    otherToolCount: 0,
    isRunning: false,
    hasError: false,
    startedAt,
  };
}

/**
 * Fold one item into the running totals. Build visits every entry exactly once, so accumulating per
 * item keeps grouping linear instead of rescanning the whole group per entry. Returns true when the
 * item is still active, which the caller tracks to derive isRunning.
 */
function accumulateItemStats(group: TurnGroup, item: GroupItemData): boolean {
  if (item.type === "reasoning") {
    group.hasReasoning = true;
    return item.reasoningData?.phase === "streaming";
  }
  if (item.type !== "tool_call" || !item.toolCallData) return false;
  const tc = item.toolCallData;
  if (tc.status === "failed" || tc.errorText) group.hasError = true;
  const cat = tc.presentation.category;
  if (cat === "shell") {
    group.commandCount++;
  } else if (cat === "file") {
    if (isFileEditAction(tc)) {
      group.editCount++;
    } else {
      group.readCount++;
    }
  } else if (cat === "search") {
    group.searchCount++;
  } else {
    group.otherToolCount++;
  }
  return tc.status === "running";
}

/** Recompute every counter from the items, so a group whose item changed in place stays consistent. */
export function updateGroupStats(group: TurnGroup): void {
  group.hasReasoning = false;
  group.commandCount = 0;
  group.editCount = 0;
  group.readCount = 0;
  group.searchCount = 0;
  group.otherToolCount = 0;
  group.hasError = false;
  let activeCount = 0;
  for (const item of group.items) {
    if (accumulateItemStats(group, item)) activeCount++;
  }
  group.isRunning = group.isFinished ? false : activeCount > 0;
}

export function formatGroupSummary(group: TurnGroup): string {
  const parts: string[] = [];

  if (group.hasReasoning) {
    parts.push("Thought");
  }
  if (group.commandCount > 0) {
    parts.push(`Ran ${group.commandCount} command${group.commandCount > 1 ? "s" : ""}`);
  }
  if (group.editCount > 0) {
    parts.push(`Edited ${group.editCount} file${group.editCount > 1 ? "s" : ""}`);
  }
  if (group.readCount > 0) {
    parts.push(`Read ${group.readCount} file${group.readCount > 1 ? "s" : ""}`);
  }
  if (group.searchCount > 0) {
    parts.push(`Searched ${group.searchCount} time${group.searchCount > 1 ? "s" : ""}`);
  }
  if (group.otherToolCount > 0) {
    parts.push(`Called ${group.otherToolCount} tool${group.otherToolCount > 1 ? "s" : ""}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Activity";
}

export interface ActivityEntry {
  item: AgentTimelineItem;
  timestamp: string;
  seqStart: number;
  seqEnd: number;
}

/** Fold contiguous activity only: never move details across a visible message. */
export function buildActivityGroups(
  entries: readonly ActivityEntry[],
  dataCache = new WeakMap<AgentTimelineItem, ReasoningItemData | ToolCallItemData>(),
) {
  const groups = new Map<string, { group: TurnGroup; isLeader: boolean; itemId: string }>();
  let group: TurnGroup | undefined;
  const tools = new Map<string, ActivityEntry>();
  for (const entry of entries) {
    if (entry.item.type !== "tool_call") continue;
    const previous = tools.get(entry.item.callId);
    if (!previous || previous.seqEnd < entry.seqEnd)
      tools.set(entry.item.callId, {
        ...entry,
        seqStart: previous?.seqStart ?? entry.seqStart,
      });
  }
  const ordered = entries.filter((entry) => entry.item.type !== "tool_call");
  ordered.push(...tools.values());
  ordered.sort((a, b) => a.seqStart - b.seqStart);
  const identityCounts = new Map<string, number>();
  for (const entry of ordered) {
    const projection = projectTimelineItem(entry.item, entry.timestamp);
    if (projection.kind !== "activity" || projection.item.type !== "reasoning") continue;
    identityCounts.set(projection.key, (identityCounts.get(projection.key) ?? 0) + 1);
  }
  let activeCount = 0;
  const seal = (finished: boolean) => {
    if (!group) return;
    group.isFinished = finished;
    group.isRunning = !finished && activeCount > 0;
    activeCount = 0;
  };
  for (const entry of ordered) {
    const { item, timestamp } = entry;
    const startedAt = Date.parse(timestamp);
    const projection = projectTimelineItem(item, timestamp);
    // Visible prose and one-off items end contiguous activity, so details never cross them.
    if (projection.kind !== "activity") {
      seal(true);
      group = undefined;
      continue;
    }
    const identity = projection.key;
    // Sequence positions keep thought identities stable even when provider timestamps collide.
    const id = projection.item.type === "reasoning" ? `${identity}:${entry.seqStart}` : identity;
    const lookup = (identityCounts.get(identity) ?? 0) > 1 ? id : identity;
    if (!group) group = createActivityGroup(entry.seqStart, id, startedAt);
    let data = dataCache.get(projection.item);
    if (!data) {
      data =
        projection.item.type === "reasoning"
          ? createReasoningData(projection.item, "complete")
          : createToolCallData(projection.item);
      dataCache.set(projection.item, data);
    }
    const groupItem: GroupItemData = {
      id,
      type: projection.item.type,
      timestamp: startedAt,
      ...(projection.item.type === "reasoning"
        ? { reasoningData: data as ReasoningItemData }
        : { toolCallData: data as ToolCallItemData }),
    };
    group.items.push(groupItem);
    if (accumulateItemStats(group, groupItem)) activeCount++;
    groups.set(lookup, { group, isLeader: group.leaderId === id, itemId: id });
  }
  seal(false);
  return groups;
}
