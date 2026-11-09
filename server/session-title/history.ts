import { createHash } from "node:crypto";
import type { PaseoAgentTimelineHandle, PaseoAgentTimelineRefetchOptions } from "@getpaseo/client";
import { TITLE_MESSAGES, TitleFailureError } from "./errors";

export interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  seq: number;
  key: string;
}
export interface History {
  messages: HistoryMessage[];
  fingerprint: string;
  epoch: string;
  through: number;
}
export function checkCanceled(signal: AbortSignal) {
  if (signal.aborted) throw new TitleFailureError("canceled", TITLE_MESSAGES.canceled);
}

/** Freeze the first tail's boundary; later pages cannot accidentally include a new turn. */
export async function readConversation(
  timeline: Pick<PaseoAgentTimelineHandle, "refetch">,
  signal: AbortSignal,
): Promise<History> {
  let cursor: PaseoAgentTimelineRefetchOptions["cursor"];
  let epoch: string | undefined;
  let through = -1;
  let olderThan = Infinity;
  const messages: HistoryMessage[] = [];
  const identities = new Set<string>();
  do {
    checkCanceled(signal);
    const page = await timeline
      .refetch({
        direction: cursor ? "before" : "tail",
        cursor,
        limit: 100,
        projection: "canonical",
      })
      .catch((error) => {
        checkCanceled(signal);
        throw new TitleFailureError("history.read", TITLE_MESSAGES.historyRead, { cause: error });
      });
    checkCanceled(signal);
    const epochChanged = epoch !== undefined && page.epoch !== epoch;
    if (page.error || page.staleCursor || page.gap || epochChanged)
      throw new TitleFailureError("history.incomplete", TITLE_MESSAGES.historyIncomplete, {
        cause: {
          pageError: page.error ?? null,
          staleCursor: page.staleCursor,
          gap: page.gap,
          epochChanged,
          expectedEpoch: epoch ?? null,
          actualEpoch: page.epoch ?? null,
        },
      });
    epoch = page.epoch;
    if (through === -1) through = page.window.maxSeq;
    for (const entry of page.entries) {
      if (entry.seqStart > through || entry.seqStart >= olderThan) continue;
      const item = entry.item;
      if ((item.type !== "user_message" && item.type !== "assistant_message") || !item.text.trim())
        continue;
      const key =
        item.messageId ??
        (item.type === "user_message" ? item.clientMessageId : undefined) ??
        `${epoch}:${entry.seqStart}`;
      const identity = `${item.type}:${entry.seqStart}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      messages.push({
        role: item.type === "user_message" ? "user" : "assistant",
        text: item.text,
        seq: entry.seqStart,
        key,
      });
    }
    const next = page.hasOlder ? page.startCursor : null;
    if (page.hasOlder && (!next || next.seq >= olderThan || page.entries.length === 0))
      throw new TitleFailureError("history.incomplete", TITLE_MESSAGES.historyPageStuck);
    olderThan = Math.min(olderThan, ...page.entries.map((entry) => entry.seqStart));
    cursor = next ?? undefined;
  } while (cursor);
  messages.sort((a, b) => a.seq - b.seq);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([epoch, messages]))
    .digest("hex");
  return { messages, fingerprint, epoch: epoch ?? "", through };
}
