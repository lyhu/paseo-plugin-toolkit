import type { PaseoAgentTimelineHandle } from "@getpaseo/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
export type TimelinePage = Awaited<ReturnType<PaseoAgentTimelineHandle["refetch"]>>;
export type Entry = TimelinePage["entries"][number];
export function timelineText(
  item: AgentTimelineItem,
): { role: string; text: string; candidate: boolean } | null {
  switch (item.type) {
    case "user_message":
      return { role: "你", text: item.text, candidate: false };
    case "assistant_message":
      return { role: "AI", text: item.text, candidate: true };
    case "error":
      return { role: "错误", text: item.message, candidate: false };
    case "notification":
      return { role: "提示", text: item.message, candidate: false };
    case "tool_call":
      return { role: "工具", text: `${item.name} · ${item.status}`, candidate: false };
    default:
      return null;
  }
}
export function mergeTimeline(
  previous: Entry[],
  page: TimelinePage,
  epoch: string | undefined,
): Entry[] {
  const entries = new Map<number, Entry>();
  if (page.epoch === epoch) for (const entry of previous) entries.set(entry.seqStart, entry);
  for (const entry of page.entries) entries.set(entry.seqStart, entry);
  return [...entries.values()].sort((a, b) => a.seqStart - b.seqStart);
}
