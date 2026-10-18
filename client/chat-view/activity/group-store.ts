import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  createReasoningData,
  createToolCallData,
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

/**
 * Identity must stay stable while streaming text grows: it becomes the React key of the rendered
 * activity row, so embedding the reasoning text would remount the subtree on every token and
 * restart reveal state, scroll anchoring and measured row heights.
 */
export function activityIdentity(item: AgentTimelineItem, timestamp: string): string {
  return item.type === "tool_call"
    ? `tool:${item.callId}`
    : `${item.type}:${Date.parse(timestamp)}`;
}

/** Fold contiguous activity only: never move details across a visible message. */
export function buildActivityGroups(entries: readonly ActivityEntry[]) {
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
    if (entry.item.type !== "reasoning") continue;
    const identity = activityIdentity(entry.item, entry.timestamp);
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
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
    // Visible messages end contiguous activity, so folded details never cross native prose.
    if (item.type === "user_message") {
      seal(true);
      group = undefined;
      continue;
    }
    if (item.type === "assistant_message") {
      seal(true);
      group = undefined;
      continue;
    }
    const speak =
      item.type === "tool_call" &&
      item.name === "speak" &&
      item.detail.type === "unknown" &&
      typeof item.detail.input === "string" &&
      item.detail.input.trim();
    if (speak) {
      seal(true);
      group = undefined;
      continue;
    }
    if (item.type !== "reasoning" && item.type !== "tool_call") {
      seal(true);
      group = undefined;
      continue;
    }
    const identity = activityIdentity(item, timestamp);
    // Sequence positions keep thought identities stable even when provider timestamps collide.
    const id = item.type === "reasoning" ? `${identity}:${entry.seqStart}` : identity;
    const lookup = (identityCounts.get(identity) ?? 0) > 1 ? id : identity;
    if (!group) group = createActivityGroup(entry.seqStart, id, startedAt);
    const groupItem: GroupItemData = {
      id,
      type: item.type,
      timestamp: startedAt,
      ...(item.type === "reasoning"
        ? { reasoningData: createReasoningData(item, "complete") }
        : { toolCallData: createToolCallData(item) }),
    };
    group.items.push(groupItem);
    if (accumulateItemStats(group, groupItem)) activeCount++;
    groups.set(lookup, { group, isLeader: group.leaderId === id, itemId: id });
  }
  seal(false);
  return groups;
}
