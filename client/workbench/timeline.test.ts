import { expect, it } from "vitest";
import { mergeTimeline, timelineText, type Entry, type TimelinePage } from "./timeline";
const entry = (seq: number, text: string): Entry =>
  ({ seqStart: seq, seqEnd: seq, item: { type: "assistant_message", text } }) as Entry;
const page = (epoch: string, entries: Entry[]) => ({ epoch, entries }) as TimelinePage;
it("deduplicates overlapping history and streaming updates in timeline order", () => {
  const merged = mergeTimeline(
    [entry(2, "partial"), entry(3, "new")],
    page("a", [entry(1, "old"), entry(2, "complete")]),
    "a",
  );
  expect(merged.map((e) => e.seqStart)).toEqual([1, 2, 3]);
  expect(timelineText(merged[1].item)?.text).toBe("complete");
});
it("discards history when the server replaces its timeline epoch", () => {
  expect(
    mergeTimeline([entry(1, "stale")], page("b", [entry(8, "current")]), "a").map(
      (e) => e.seqStart,
    ),
  ).toEqual([8]);
});
it("only assistant replies can become memory candidates", () => {
  expect(timelineText(entry(1, "reply").item)?.candidate).toBe(true);
  expect(timelineText({ type: "user_message", text: "prompt" } as never)?.candidate).toBe(false);
});
