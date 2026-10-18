import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { formatError, formatReasoningText, toJsonValue } from "./text";
import { resolveToolCallPresentation } from "./tool-presentation";

export const REASONING_RENDERER_KIND = "colorful-reasoning";
export const TOOL_CALL_RENDERER_KIND = "colorful-tool-call";
export const REASONING_RENDERER_VERSION = 1;
export const TOOL_CALL_RENDERER_VERSION = 1;

export const reasoningItemDataSchema = z.object({
  callId: z.string().optional(),
  turnIndex: z.number().int().optional(),
  turnId: z.string().optional(),
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});

export const diffStatsSchema = z.object({
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

export const toolCallPresentationSchema = z.object({
  category: z.enum(["shell", "file", "search", "agent", "plan", "communication", "unknown"]),
  icon: z.string(),
  label: z.string(),
  summary: z.string().optional(),
  filePath: z.string().optional(),
  fileIcon: z.string().optional(),
  language: z.string().optional(),
  diffStats: diffStatsSchema.optional(),
});

export const toolCallItemDataSchema = z.object({
  callId: z.string().optional(),
  turnIndex: z.number().int().optional(),
  turnId: z.string().optional(),
  name: z.string(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  detail: z.json(),
  errorText: z.string().optional(),
  presentation: toolCallPresentationSchema,
});

export type ReasoningItemData = z.output<typeof reasoningItemDataSchema>;
export type ToolCallItemData = z.output<typeof toolCallItemDataSchema>;

export function getActivityExpansionState(
  isStreaming: boolean,
  isLatest: boolean,
  userExpanded: boolean | null,
): boolean {
  return isStreaming || (userExpanded !== null ? userExpanded : isLatest);
}

function timestampMillis(timestamp: string | number | Date): number {
  if (timestamp instanceof Date) return timestamp.getTime();
  return typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
}

/** Stable while streaming: it never embeds the growing reasoning text. */
export function activityKey(
  item: Extract<AgentTimelineItem, { type: "reasoning" | "tool_call" }>,
  timestamp: string | number | Date,
): string {
  return item.type === "tool_call"
    ? `tool:${item.callId}`
    : `reasoning:${timestampMillis(timestamp)}`;
}

/** The same identities for already-created row data, used by history and disclosure state. */
export function activityDataKey(
  data: ReasoningItemData | ToolCallItemData,
  timestamp: string | number | Date,
): string {
  return "name" in data
    ? `tool:${data.callId ?? timestampMillis(timestamp)}`
    : `reasoning:${timestampMillis(timestamp)}`;
}

/** A speak tool call is user-visible prose rendered natively, so it never joins a folded group. */
export function isSpeakToolCall(
  item: AgentTimelineItem,
): item is Extract<AgentTimelineItem, { type: "tool_call" }> {
  return (
    item.type === "tool_call" &&
    item.name === "speak" &&
    item.detail.type === "unknown" &&
    typeof item.detail.input === "string" &&
    item.detail.input.trim().length > 0
  );
}

export type TimelineProjection =
  | {
      kind: "activity";
      key: string;
      item: Extract<AgentTimelineItem, { type: "reasoning" | "tool_call" }>;
    }
  | { kind: "prose"; key: string }
  | { kind: "separator"; key: string };

/**
 * The one folding policy: visible messages end a group, speak and other item kinds break it, and
 * only reasoning and tool calls join it.
 */
export function projectTimelineItem(
  item: AgentTimelineItem,
  timestamp: string | number | Date,
): TimelineProjection {
  if (item.type === "reasoning" || (item.type === "tool_call" && !isSpeakToolCall(item)))
    return { kind: "activity", key: activityKey(item, timestamp), item };
  const key =
    item.type === "tool_call"
      ? `tool:${item.callId}`
      : `${item.type}:${timestampMillis(timestamp)}`;
  if (item.type === "user_message" || item.type === "assistant_message")
    return { kind: "prose", key };
  return { kind: "separator", key };
}

export function createReasoningData(
  item: Extract<AgentTimelineItem, { type: "reasoning" }>,
  phase: ReasoningItemData["phase"],
  turnIndex?: number,
  callId?: string,
  turnId?: string,
): ReasoningItemData {
  return {
    ...(callId ? { callId } : {}),
    ...(turnIndex !== undefined ? { turnIndex } : {}),
    ...(turnId ? { turnId } : {}),
    text: formatReasoningText(item.text),
    phase,
  };
}

export function createToolCallData(
  item: Extract<AgentTimelineItem, { type: "tool_call" }>,
  turnIndex?: number,
  callId?: string,
  turnId?: string,
): ToolCallItemData {
  const presentation = resolveToolCallPresentation(item);
  const errorText = formatError(item.error);
  return {
    callId: callId ?? item.callId,
    ...(turnIndex !== undefined ? { turnIndex } : {}),
    ...(turnId ? { turnId } : {}),
    name: item.name,
    status: item.status,
    detail: toJsonValue(item.detail),
    ...(errorText ? { errorText } : {}),
    presentation,
  };
}
