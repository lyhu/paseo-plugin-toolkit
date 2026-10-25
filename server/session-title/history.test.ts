import { describe, expect, it, vi } from "vitest";
import type { PaseoAgentTimelineHandle } from "@getpaseo/client";
import { readConversation } from "./history";
type Page = Awaited<ReturnType<PaseoAgentTimelineHandle["refetch"]>>;
function page(start: number, end: number, older = false): Page {
  return {
    requestId: "r",
    agentId: "a",
    agent: null,
    direction: "tail",
    projection: "canonical",
    epoch: "e",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 1, maxSeq: 4, nextSeq: 5 },
    startCursor: { epoch: "e", seq: start },
    endCursor: null,
    hasOlder: older,
    hasNewer: false,
    error: null,
    entries: Array.from({ length: end - start + 1 }, (_, index) => ({
      provider: "codex",
      item: {
        type: (start + index) % 2 ? "user_message" : "assistant_message",
        text: String(start + index),
      },
      timestamp: "2026-10-26",
      seqStart: start + index,
      seqEnd: start + index,
      sourceSeqRanges: [],
      collapsed: [],
    })),
  };
}
describe("complete conversation history", () => {
  it("reads ordered pages, excludes a newer boundary and ignores tool/reasoning items", async () => {
    const tail = page(3, 4, true);
    tail.entries.push({
      ...tail.entries[0]!,
      seqStart: 5,
      seqEnd: 5,
      item: { type: "reasoning", text: "private reasoning" },
    });
    const refetch = vi.fn().mockResolvedValueOnce(tail).mockResolvedValueOnce(page(1, 2));
    const history = await readConversation({ refetch }, new AbortController().signal);
    expect(history.messages.map((message) => message.text)).toEqual(["1", "2", "3", "4"]);
    expect(history.through).toBe(4);
    expect(refetch.mock.calls[1]![0]).toMatchObject({
      direction: "before",
      projection: "canonical",
      cursor: { epoch: "e", seq: 3 },
    });
  });
  it.each(["gap", "staleCursor", "epoch", "error"])("fails closed on %s", async (field) => {
    const broken = page(1, 2);
    Object.assign(broken, {
      [field]: field === "epoch" ? "replacement" : field === "error" ? "unavailable" : true,
    });
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(page(3, 4, true))
      .mockResolvedValueOnce(broken);
    await expect(readConversation({ refetch }, new AbortController().signal)).rejects.toThrow(
      "历史不完整",
    );
  });
  it("rejects non-progressing cursors and cancels before another page", async () => {
    const refetch = vi.fn().mockResolvedValue(page(3, 4, true));
    await expect(readConversation({ refetch }, new AbortController().signal)).rejects.toThrow(
      "未前进",
    );
    const controller = new AbortController();
    controller.abort();
    refetch.mockClear();
    await expect(readConversation({ refetch }, controller.signal)).rejects.toThrow("取消");
    expect(refetch).not.toHaveBeenCalled();
  });
  it("reports unavailable archived history without exposing provider details", async () => {
    const refetch = vi.fn().mockRejectedValue(new Error("thread not loaded: private-thread-id"));
    await expect(readConversation({ refetch }, new AbortController().signal)).rejects.toThrow(
      "会话历史读取失败，请在智能命名中重试。",
    );
    const controller = new AbortController();
    refetch.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted provider call");
    });
    await expect(readConversation({ refetch }, controller.signal)).rejects.toThrow("已取消");
  });
});
