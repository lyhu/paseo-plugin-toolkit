import { expect, it, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { createSessionTurnCounter } from "./turns";
const page = {
  epoch: "e",
  window: { maxSeq: 24 },
  hasOlder: false,
  error: null,
  staleCursor: false,
  gap: false,
  entries: Array.from({ length: 24 }, (_, index) => ({
    seqStart: index + 1,
    item: {
      type: index % 2 ? "assistant_message" : "user_message",
      text: "text",
      messageId: String(index),
    },
  })),
};
it("counts the whole conversation beyond the naming window, without any model call", async () => {
  const refetch = vi.fn().mockResolvedValue(page);
  const paseo = {
    agents: {
      ref: () => ({
        refresh: async () => ({ agent: { workspaceId: "w" } }),
        timeline: { refetch },
      }),
    },
  } as unknown as PaseoApi;
  const count = createSessionTurnCounter();
  expect(await count(paseo, "a", "w")).toEqual({ count: 12 });
  expect(refetch).toHaveBeenCalledWith(expect.objectContaining({ projection: "canonical" }));
  expect(await count(paseo, "a", "other")).toEqual({ count: null });
  expect(refetch).toHaveBeenCalledOnce();
});
it("uses unknown for unavailable or incomplete history instead of a misleading zero", async () => {
  const refetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("thread not loaded"))
    .mockResolvedValueOnce({ ...page, gap: true });
  const paseo = {
    agents: {
      ref: () => ({
        refresh: async () => ({ agent: { workspaceId: "w" } }),
        timeline: { refetch },
      }),
    },
  } as unknown as PaseoApi;
  const count = createSessionTurnCounter();
  expect(await count(paseo, "a", "w")).toEqual({ count: null });
  expect(await count(paseo, "a", "w")).toEqual({ count: null });
});
it("limits provider history reads to two while visible rows load", async () => {
  let active = 0,
    peak = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refetch = vi.fn(async () => {
    peak = Math.max(peak, ++active);
    await gate;
    active--;
    return page;
  });
  const paseo = {
    agents: {
      ref: () => ({
        refresh: async () => ({ agent: { workspaceId: "w" } }),
        timeline: { refetch },
      }),
    },
  } as unknown as PaseoApi;
  const count = createSessionTurnCounter();
  const requests = ["a", "b", "c", "d"].map((id) => count(paseo, id, "w"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(refetch).toHaveBeenCalledTimes(2);
  release();
  expect(await Promise.all(requests)).toEqual(Array(4).fill({ count: 12 }));
  expect(peak).toBe(2);
});
