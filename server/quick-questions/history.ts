import type { PaseoAgentTimelineHandle, PaseoAgentTimelineRefetchOptions } from "@getpaseo/client";
import type { Evidence } from "./model";

export interface HistoryQuestion extends Evidence {
  timestamp: string;
  sequence: number;
}

export function recentQuestions(questions: HistoryQuestion[], limit: number): HistoryQuestion[] {
  return [...questions]
    .sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
        b.sequence - a.sequence ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

export async function readHistory(
  timeline: Pick<PaseoAgentTimelineHandle, "refetch">,
  agentId: string,
  signal: AbortSignal,
): Promise<HistoryQuestion[]> {
  const pages = [];
  let before: PaseoAgentTimelineRefetchOptions["cursor"];
  let epoch: string | undefined;
  do {
    if (signal.aborted) throw new Error("已取消总结");
    const page = await timeline.refetch({
      direction: before ? "before" : "tail",
      cursor: before,
      limit: 100,
    });
    if (page.error || page.staleCursor || page.gap || (epoch !== undefined && page.epoch !== epoch))
      throw new Error("历史读取不完整，请重试。");
    epoch = page.epoch;
    pages.push(
      page.entries.filter(
        (entry) => entry.item.type === "user_message" || entry.item.type === "assistant_message",
      ),
    );
    const next = page.hasOlder ? (page.startCursor ?? undefined) : undefined;
    if (page.hasOlder && (!next || next.seq === before?.seq))
      throw new Error("历史分页没有前进，请重试。");
    before = next;
  } while (before);
  let context = "";
  const seen = new Set<string>();
  const evidence: HistoryQuestion[] = [];
  for (const entry of pages.reverse().flat()) {
    const item = entry.item;
    if (item.type === "assistant_message") {
      context = item.text.slice(-1500);
      continue;
    }
    if (item.type !== "user_message" || !item.text.trim()) continue;
    const id = `${agentId}:${entry.seqStart}`;
    if (seen.has(id)) continue;
    seen.add(id);
    evidence.push({
      id,
      timestamp: entry.timestamp,
      sequence: entry.seqStart,
      text: item.text,
      context,
      frequency: 1,
      sources: [{ agentId, question: item.text.slice(0, 8000) }],
    });
  }
  return evidence;
}
