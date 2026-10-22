import type { PaseoAgentTimelineHandle, PaseoAgentTimelineRefetchOptions } from "@getpaseo/client";
import { LocalizedError } from "../../shared/chat-view/i18n";
import type { Evidence } from "./model";

export interface HistoryQuestion extends Evidence {
  timestamp: string;
  sequence: number;
}

function compareQuestions(a: HistoryQuestion, b: HistoryQuestion) {
  return (
    Date.parse(b.timestamp) - Date.parse(a.timestamp) ||
    b.sequence - a.sequence ||
    a.id.localeCompare(b.id)
  );
}
export function recentQuestions(questions: HistoryQuestion[], limit: number): HistoryQuestion[] {
  return [...questions].sort(compareQuestions).slice(0, limit);
}

/** Walk backwards without retaining pages; only selected questions wait for their prior context. */
export async function readHistory(
  timeline: Pick<PaseoAgentTimelineHandle, "refetch">,
  agentId: string,
  signal: AbortSignal,
  options: { limit?: number; onRead?: (count: number) => void } = {},
): Promise<HistoryQuestion[]> {
  const limit = options.limit ?? Infinity;
  const selected: HistoryQuestion[] = [];
  const unresolved = new Set<HistoryQuestion>();
  const identities = new Set<string>();
  let count = 0;
  let newerBoundary = Infinity;
  let before: PaseoAgentTimelineRefetchOptions["cursor"];
  let epoch: string | undefined;
  const checkCanceled = () => {
    if (signal.aborted) throw new LocalizedError("quickQuestions.error.canceled");
  };
  do {
    checkCanceled();
    const page = await timeline.refetch({
      direction: before ? "before" : "tail",
      cursor: before,
      limit: 100,
    });
    checkCanceled();
    if (page.error || page.staleCursor || page.gap || (epoch !== undefined && page.epoch !== epoch))
      throw new LocalizedError("quickQuestions.error.historyIncomplete");
    epoch = page.epoch;
    const seen = new Set<number>();
    for (const entry of [...page.entries].sort((a, b) => b.seqStart - a.seqStart)) {
      if (entry.seqStart >= newerBoundary) continue;
      const item = entry.item;
      if (item.type === "assistant_message") {
        const context = item.text.slice(-1500);
        for (const question of unresolved) question.context = context;
        unresolved.clear();
        continue;
      }
      if (item.type !== "user_message" || !item.text.trim() || seen.has(entry.seqStart)) continue;
      seen.add(entry.seqStart);
      count++;
      const id = `${agentId}:${entry.seqStart}`;
      if (identities.has(id)) continue;
      const question: HistoryQuestion = {
        id,
        timestamp: entry.timestamp,
        sequence: entry.seqStart,
        text: item.text,
        context: "",
        frequency: 1,
        sources: [{ agentId, question: item.text.slice(0, 8000) }],
      };
      let lo = 0,
        hi = selected.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (compareQuestions(selected[mid]!, question) <= 0) lo = mid + 1;
        else hi = mid;
      }
      if (lo >= limit) continue;
      selected.splice(lo, 0, question);
      identities.add(id);
      unresolved.add(question);
      if (selected.length > limit) {
        const removed = selected.pop()!;
        identities.delete(removed.id);
        unresolved.delete(removed);
      }
    }
    newerBoundary = Math.min(newerBoundary, ...page.entries.map((entry) => entry.seqStart));
    const next = page.hasOlder ? (page.startCursor ?? undefined) : undefined;
    if (page.hasOlder && (!next || (before && next.seq >= before.seq)))
      throw new LocalizedError("quickQuestions.error.historyNoProgress");
    before = next;
  } while (before);
  options.onRead?.(count);
  return selected.sort((a, b) => a.sequence - b.sequence);
}
