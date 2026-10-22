import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { cleanupActivityHistory, useActivityGroup } from "./history";

const state = vi.hoisted(() => ({ paseo: undefined as unknown }));
vi.mock("@getpaseo/plugin/client", () => ({ usePaseo: () => state.paseo }));
afterEach(() => {
  cleanupActivityHistory();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("publishes only the changed group to real React subscribers and expires idle history", async () => {
  vi.useFakeTimers();
  const dom = new JSDOM("<div id='root'></div>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const time = new Date(1000);
  const first = { type: "reasoning", text: "first" };
  const second = { type: "reasoning", text: "second" };
  let page = {
    epoch: "one",
    startCursor: null,
    hasOlder: false,
    entries: [
      { item: first, timestamp: time.toISOString(), seqStart: 1, seqEnd: 1 },
      {
        item: { type: "user_message", text: "next" },
        timestamp: new Date(2000).toISOString(),
        seqStart: 2,
        seqEnd: 2,
      },
      { item: second, timestamp: new Date(3000).toISOString(), seqStart: 3, seqEnd: 3 },
    ],
  };
  let notify!: (update: unknown) => void;
  const refetch = vi.fn(async () => page);
  state.paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch,
          subscribe: (listener: typeof notify) => {
            notify = listener;
            return Object.assign(vi.fn(), { ready: Promise.resolve() });
          },
        },
      }),
    },
  };
  const renders = [0, 0];
  function Row({ index }: { index: number }) {
    useActivityGroup(
      "agent",
      new Date(index ? 3000 : 1000),
      { text: index ? "second" : "first", phase: "complete" },
      true,
    );
    renders[index]++;
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  await act(async () =>
    root.render(
      createElement(
        "div",
        null,
        createElement(Row, { index: 0 }),
        createElement(Row, { index: 1 }),
      ),
    ),
  );
  const before = [...renders];
  page = {
    ...page,
    entries: [
      ...page.entries.slice(0, 2),
      { ...page.entries[2]!, item: { ...second, text: "second updated" } },
    ],
  };
  await act(async () => {
    notify({ event: { type: "timeline" } });
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(renders[0]).toBe(before[0]);
  expect(renders[1]).toBeGreaterThan(before[1]!);
  await act(async () => root.unmount());
  await vi.advanceTimersByTimeAsync(120000);
  const next = createRoot(document.getElementById("root")!);
  await act(async () => next.render(createElement(Row, { index: 0 })));
  expect(refetch).toHaveBeenCalledTimes(3);
  await act(async () => next.unmount());
  dom.window.close();
});
