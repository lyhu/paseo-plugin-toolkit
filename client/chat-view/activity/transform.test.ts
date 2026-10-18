import { expect, it } from "vitest";
import { transformReasoning, transformToolCall } from "./transform";

it("transforms reasoning deterministically across repeat renders", () => {
  const input = {
    item: { type: "reasoning" as const, text: "working" },
    phase: "streaming" as const,
  };
  const first = transformReasoning(input);
  transformReasoning({ ...input, item: { ...input.item, text: "other agent" } });
  expect(transformReasoning(input)).toEqual(first);
  expect(first?.items[0]?.data).toMatchObject({ text: "working", phase: "streaming" });
});
it("keeps native speak messages", () => {
  expect(
    transformToolCall({
      item: {
        type: "tool_call",
        callId: "speak",
        name: "speak",
        status: "completed",
        error: null,
        detail: { type: "unknown", input: "hello", output: null },
      },
      phase: "complete",
    }),
  ).toBeUndefined();
});
