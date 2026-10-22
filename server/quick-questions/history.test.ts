import { describe, expect, it, vi } from "vitest";
import type { PaseoAgentTimelineHandle } from "@getpaseo/client";
import { readHistory, recentQuestions } from "./history";

type Page = Awaited<ReturnType<PaseoAgentTimelineHandle["refetch"]>>;
function entry(
  seq: number,
  type: "user_message" | "assistant_message" | "reasoning",
  text: string,
): Page["entries"][number] {
  return {
    provider: "codex",
    item: { type, text },
    timestamp: "2026-10-18T00:00:00Z",
    seqStart: seq,
    seqEnd: seq,
    sourceSeqRanges: [],
    collapsed: [],
  };
}
function page(entries: Page["entries"], hasOlder = false): Page {
  return {
    requestId: "r",
    agentId: "a",
    agent: null,
    direction: "tail",
    projection: "projected",
    epoch: "epoch",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 1, maxSeq: 9, nextSeq: 10 },
    startCursor: { epoch: "epoch", seq: entries[0]?.seqStart ?? 1 },
    endCursor: null,
    hasOlder,
    hasNewer: false,
    entries,
    error: null,
  };
}
describe("history collection", () => {
  it("keeps only the requested sample while scanning 100,000 messages", async () => {
    let remaining = 100000;
    const refetch = vi.fn(async () => {
      const end = remaining;
      const start = Math.max(1, end - 99);
      remaining = start - 1;
      return page(
        Array.from({ length: end - start + 1 }, (_, i) => ({
          ...entry(start + i, "user_message", `question ${start + i}`),
          timestamp: new Date((start + i) * 1000).toISOString(),
        })),
        remaining > 0,
      );
    });
    const onRead = vi.fn();
    const result = await readHistory({ refetch } as never, "a", new AbortController().signal, {
      limit: 50,
      onRead,
    });
    expect(result).toHaveLength(50);
    expect(result[0]!.sequence).toBe(99951);
    expect(result[49]!.sequence).toBe(100000);
    expect(onRead).toHaveBeenCalledWith(100000);
    expect(refetch).toHaveBeenCalledTimes(1000);
  });
  it("selects by timestamp even when an older page has the newest question", async () => {
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ ...entry(3, "user_message", "tail"), timestamp: "2026-01-01" }], true),
      )
      .mockResolvedValueOnce(
        page([
          entry(1, "assistant_message", "prior context"),
          { ...entry(2, "user_message", "newest"), timestamp: "2026-12-01" },
        ]),
      );
    const result = await readHistory({ refetch } as never, "a", new AbortController().signal, {
      limit: 1,
    });
    expect(result.map(({ text, context }) => ({ text, context }))).toEqual([
      { text: "newest", context: "prior context" },
    ]);
  });
  it("selects the newest 50 user questions across conversation histories by message time", async () => {
    const entries = Array.from({ length: 60 }, (_, index) => ({
      ...entry(index + 1, "user_message", `question ${index + 1}`),
      timestamp: new Date(Date.UTC(2026, 9, 18, 0, 0, index)).toISOString(),
    }));
    const first = await readHistory(
      {
        refetch: vi
          .fn<PaseoAgentTimelineHandle["refetch"]>()
          .mockResolvedValue(page(entries.filter((item) => item.seqStart % 2 === 0))),
      },
      "first",
      new AbortController().signal,
    );
    const second = await readHistory(
      {
        refetch: vi
          .fn<PaseoAgentTimelineHandle["refetch"]>()
          .mockResolvedValue(page(entries.filter((item) => item.seqStart % 2 !== 0))),
      },
      "second",
      new AbortController().signal,
    );
    const selected = recentQuestions([...first, ...second], 50);
    expect(selected.map((item) => item.text)).toEqual(
      Array.from({ length: 50 }, (_, index) => `question ${60 - index}`),
    );
    expect(recentQuestions([...first, ...second], 1).map((item) => item.text)).toEqual([
      "question 60",
    ]);
    expect(recentQuestions(first.slice(0, 2), 50)).toHaveLength(2);
    expect(
      recentQuestions(
        first.map((item) => ({ ...item, timestamp: "2026-10-18T00:00:00Z" })),
        1,
      )[0].text,
    ).toBe("question 60");
  });
  it("reads older pages chronologically, uses only user questions and text context", async () => {
    const refetch = vi
      .fn<PaseoAgentTimelineHandle["refetch"]>()
      .mockResolvedValueOnce(page([entry(3, "user_message", "另一台呢？")], true))
      .mockResolvedValueOnce(
        page([
          entry(1, "user_message", "检查 server-01"),
          entry(2, "assistant_message", "server-01 正常"),
          entry(2, "reasoning", "private reasoning"),
        ]),
      );
    const result = await readHistory({ refetch }, "a", new AbortController().signal);
    expect(result.map((item) => ({ text: item.text, context: item.context }))).toEqual([
      { text: "检查 server-01", context: "" },
      { text: "另一台呢？", context: "server-01 正常" },
    ]);
    expect(refetch.mock.calls[1][0]).toEqual({
      direction: "before",
      cursor: { epoch: "epoch", seq: 3 },
      limit: 100,
    });
    expect(result.map((q) => q.frequency)).toEqual([1, 1]);
  });
  it("reports a stale or incomplete history instead of claiming completeness", async () => {
    const refetch = vi
      .fn<PaseoAgentTimelineHandle["refetch"]>()
      .mockResolvedValue({ ...page([]), staleCursor: true });
    await expect(readHistory({ refetch }, "a", new AbortController().signal)).rejects.toMatchObject(
      { key: "quickQuestions.error.historyIncomplete" },
    );
  });
  it("stops canceled reads before fetching another page", async () => {
    const controller = new AbortController();
    controller.abort();
    const refetch = vi.fn<PaseoAgentTimelineHandle["refetch"]>();
    await expect(readHistory({ refetch }, "a", controller.signal)).rejects.toMatchObject({
      key: "quickQuestions.error.canceled",
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
