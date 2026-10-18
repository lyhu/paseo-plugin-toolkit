import { expect, it, vi } from "vitest";
import { createTimelinePager, type TimelinePage } from "./timeline-pager";

/** 一个可控的 timeline handle：每次 refetch 返回排队好的页，并记录调用参数。 */
function fakeTimeline(pages: Array<TimelinePage | Error>) {
  const calls: Array<Record<string, unknown>> = [];
  const handle = {
    refetch: vi.fn(async (args: Record<string, unknown>) => {
      calls.push(args);
      const next = pages.shift();
      if (!next) throw new Error("no page queued");
      if (next instanceof Error) return { error: next.message, entries: [] } as never;
      return next;
    }),
  };
  return { handle: handle as never, calls };
}

const page = (epoch: string, entries: unknown[] = [], older = false): TimelinePage =>
  ({
    epoch,
    entries,
    startCursor: older ? `cursor-${entries.length}` : null,
    hasOlder: older,
    error: null,
  }) as never;

function pagerFor(pages: Array<TimelinePage | Error>) {
  const { handle, calls } = fakeTimeline(pages);
  const applied: Array<{ page: TimelinePage; reset: boolean }> = [];
  const changes = vi.fn();
  const pager = createTimelinePager(handle, {
    apply: (appliedPage, reset) => {
      applied.push({ page: appliedPage, reset });
      return true;
    },
    onChange: changes,
  });
  return { pager, calls, applied, changes };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it("reads the tail first and paginates backwards from the cursor it stored", async () => {
  const { pager, calls, applied } = pagerFor([page("one", [1], true), page("one", [2], false)]);
  pager.load(true);
  await flush();
  pager.load(false);
  await flush();
  expect(calls[0]).toMatchObject({ direction: "tail", projection: "projected", limit: 200 });
  expect(calls[0]).not.toHaveProperty("cursor");
  expect(calls[1]).toMatchObject({ direction: "before", cursor: "cursor-1" });
  expect(applied.map((entry) => entry.reset)).toEqual([false, false]);
});

it("stops paginating once the host reports no older pages", async () => {
  const { pager, calls } = pagerFor([page("one", [1], false)]);
  pager.load(true);
  await flush();
  pager.load(false);
  await flush();
  expect(calls).toHaveLength(1);
});

it("queues one older read instead of dropping it while a page is in flight", async () => {
  const { pager, calls } = pagerFor([page("one", [1], true), page("one", [2], true)]);
  pager.load(true);
  pager.load(false);
  pager.load(false);
  await flush();
  await flush();
  expect(calls.map((call) => call.direction)).toEqual(["tail", "before"]);
});

it("tells the caller to reset when the epoch behind the page changed", async () => {
  const { pager, applied } = pagerFor([page("one", [1], true), page("two", [2], true)]);
  pager.load(true);
  await flush();
  pager.load(false);
  await flush();
  expect(applied.map((entry) => entry.reset)).toEqual([false, true]);
});

it("discards a page that arrives after the session was replaced", async () => {
  const { pager, applied, changes } = pagerFor([page("one", [1], true), page("one", [2], true)]);
  pager.load(true);
  pager.invalidate();
  await flush();
  await flush();
  expect(applied).toHaveLength(0);
  expect(changes).not.toHaveBeenCalled();
});

it("keeps a failed page from applying or repainting", async () => {
  const { pager, applied, changes } = pagerFor([new Error("gone")]);
  pager.load(true);
  await flush();
  expect(applied).toHaveLength(0);
  expect(changes).not.toHaveBeenCalled();
});

it("fetches again once resumed, after a stop dropped the queued read", async () => {
  const { pager, calls } = pagerFor([page("one", [1], true)]);
  pager.stop();
  pager.load(true);
  await flush();
  expect(calls).toHaveLength(0);
  pager.resume();
  pager.load(true);
  await flush();
  expect(calls).toHaveLength(1);
});

it("reports a streamed epoch change once, and ignores repeat and missing epochs", () => {
  const { pager } = pagerFor([]);
  expect(pager.noteEpoch("one")).toBe(false);
  expect(pager.noteEpoch("one")).toBe(false);
  expect(pager.noteEpoch(undefined)).toBe(false);
  expect(pager.noteEpoch("two")).toBe(true);
  expect(pager.noteEpoch("two")).toBe(false);
});
