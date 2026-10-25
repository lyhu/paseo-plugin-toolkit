import { expect, it, vi } from "vitest";
import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import { formatSessionTime, readWorkspaceSessions, sessionActionError } from "./sessions";
it("shows the deletion error without the daemon RPC envelope", () => {
  const message = "此 Provider 尚不支持原始历史物理删除，尚未删除会话。";
  expect(
    sessionActionError(
      `Request failed: ${message} requestType=plugin.rpc.invoke.request code=handler_error`,
    ),
  ).toBe(message);
  expect(sessionActionError("原始历史无法核实，请重试。")).toBe("原始历史无法核实，请重试。");
});
const agent = (id: string, workspaceId = "w", date = "2026-10-26T10:00:00Z") =>
  ({
    id,
    workspaceId,
    createdAt: date,
    lastUserMessageAt: date,
    updatedAt: date,
  }) as PaseoAgent;
it("reads every page, includes unnamed and archived sessions, and sorts by conversation activity", async () => {
  const old = {
    ...agent("old", "w", "2026-10-25T10:00:00Z"),
    updatedAt: "2026-10-27T10:00:00Z",
    archivedAt: "2026-10-26",
  };
  const fresh = { ...agent("fresh"), title: null };
  const list = vi
    .fn()
    .mockResolvedValueOnce({
      entries: [old, agent("foreign", "other")].map((agent) => ({ agent })),
      pageInfo: { nextCursor: "page2" },
    })
    .mockResolvedValueOnce({
      entries: [fresh, old, { ...agent("hidden"), internal: true }].map((agent) => ({ agent })),
      pageInfo: { nextCursor: null },
    });
  const sessions = await readWorkspaceSessions(
    { agents: { list } } as unknown as PaseoApi,
    "w",
    new AbortController().signal,
  );
  expect(sessions.map((entry) => entry.id)).toEqual(["fresh", "old"]);
  expect(list.mock.calls[0]![0].filter).toEqual({ includeArchived: true, includeInternal: false });
  expect(list.mock.calls[1]![0].page.cursor).toBe("page2");
});
it("rejects a stuck pagination cursor rather than returning a partial list as complete", async () => {
  const list = vi.fn().mockResolvedValue({ entries: [], pageInfo: { nextCursor: "stuck" } });
  await expect(
    readWorkspaceSessions(
      { agents: { list } } as unknown as PaseoApi,
      "w",
      new AbortController().signal,
    ),
  ).rejects.toThrow("分页未前进");
  expect(list).toHaveBeenCalledTimes(2);
});
it("stops a workspace load after the view is removed", async () => {
  const controller = new AbortController();
  const list = vi.fn(async () => {
    controller.abort();
    return { entries: [], pageInfo: { nextCursor: "next" } };
  });
  await expect(
    readWorkspaceSessions({ agents: { list } } as unknown as PaseoApi, "w", controller.signal),
  ).rejects.toThrow();
  expect(list).toHaveBeenCalledOnce();
});
const now = new Date(2026, 9, 26, 12, 0).getTime();
it.each([
  [0, "刚刚"],
  [59999, "刚刚"],
  [60000, "1m前"],
  [(2 * 60 + 3) * 60000, "2h3m前"],
  [(4 * 24 + 3) * 3600000, "4d3h前"],
  [30 * 86400000, "30d前"],
] as const)("adds the expected compact elapsed label at age=%s", (age, expected) => {
  const value = formatSessionTime(new Date(now - age).toISOString(), now, "zh-CN");
  expect(value).not.toContain("2026");
  expect(value.endsWith(` (${expected})`)).toBe(true);
});
it("keeps prior years and removes relative time after 30 days", () => {
  const old = formatSessionTime(new Date(2025, 9, 26, 12).toISOString(), now, "zh-CN");
  expect(old).toContain("2025");
  expect(old).not.toContain("(");
  expect(
    formatSessionTime(new Date(now - 30 * 86400000 - 1).toISOString(), now, "zh-CN"),
  ).not.toContain("(");
});
it("supports year boundaries, invalid times, and future timestamps", () => {
  const january = new Date(2026, 0, 2, 12).getTime();
  const december = formatSessionTime(new Date(2025, 11, 31, 12).toISOString(), january, "zh-CN");
  expect(december).toContain("2025");
  expect(december).toContain("(2d前)");
  expect(formatSessionTime("invalid", now, "zh-CN")).toBe("—");
  expect(formatSessionTime(new Date(now + 60000).toISOString(), now, "zh-CN")).not.toContain("(");
  expect(formatSessionTime(new Date(now - 60000).toISOString(), now, "en-US")).toContain(
    "(1m ago)",
  );
});
