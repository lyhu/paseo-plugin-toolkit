import { expect, it, vi } from "vitest";
import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import { readWorkspaceSessions } from "./sessions";
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
