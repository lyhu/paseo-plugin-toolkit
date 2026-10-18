import { expect, it, vi } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { observeAgents } from "./agent-directory";

it("shares a subscription and preserves live updates while reconciling paginated snapshots", async () => {
  let observer: any;
  let complete!: (page: unknown) => void;
  const release = vi.fn();
  const a = { id: "a", workspaceId: "w" } as PaseoAgent;
  const b = { id: "b", workspaceId: "w" } as PaseoAgent;
  const list = vi
    .fn()
    .mockResolvedValueOnce({
      subscription: {
        release,
        subscribe(next: unknown) {
          observer = next;
        },
      },
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
  const paseo = { agents: { list } } as never;
  const first = { upsert: vi.fn(), remove: vi.fn() };
  const second = { upsert: vi.fn(), remove: vi.fn() };
  const stopFirst = observeAgents(paseo, first);
  const stopSecond = observeAgents(paseo, second);
  await Promise.resolve();
  expect(list).toHaveBeenCalledOnce();
  observer.snapshot({ entries: [{ agent: a }], pageInfo: { nextCursor: "next" } });
  observer.update({
    type: "agent_update",
    payload: { kind: "upsert", agent: { ...b, workspaceId: "moved" } },
  });
  complete({ entries: [{ agent: b }], pageInfo: { nextCursor: null } });
  await Promise.resolve();
  expect(first.upsert.mock.calls.at(-1)![0].workspaceId).toBe("moved");
  observer.snapshot({ entries: [{ agent: a }], pageInfo: { nextCursor: null } });
  expect(first.remove).toHaveBeenCalledWith("b");
  stopFirst();
  expect(release).not.toHaveBeenCalled();
  stopSecond();
  await Promise.resolve();
  expect(release).toHaveBeenCalledOnce();
  const before = second.upsert.mock.calls.length;
  observer.update({ type: "agent_update", payload: { kind: "upsert", agent: b } });
  expect(second.upsert).toHaveBeenCalledTimes(before);
});
