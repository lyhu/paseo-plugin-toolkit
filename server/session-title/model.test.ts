import { expect, it, vi } from "vitest";
import { analyzeConversation } from "./model";
import { titleLength, validTitle } from "../../shared/session-title/contracts";
import type { History } from "./history";
const history: History = {
  epoch: "e",
  through: 1,
  fingerprint: "f",
  messages: [{ role: "user", text: "A".repeat(40000), seq: 1, key: "1" }],
};
const output = (title: string) => ({
  content: JSON.stringify({
    summary: "保留最初的业务目标、关键决策和待办",
    title,
    changed: false,
    reason: "同一目标的细化",
  }),
});
it("merges every ordered segment while retaining the original title as the drift baseline", async () => {
  const complete = vi.fn().mockResolvedValue(output("会员业务"));
  const progress = vi.fn();
  const result = await analyzeConversation({
    history,
    previousTitle: "会员业务",
    maxLength: 30,
    client: { complete, listModels: vi.fn() },
    signal: new AbortController().signal,
    progress,
  });
  expect(complete).toHaveBeenCalledTimes(4);
  const prompts = complete.mock.calls.map((call) => JSON.parse(call[0][1].content));
  expect(prompts.map((prompt) => prompt.segment)).toEqual([1, 2, 3, 4]);
  expect(prompts[3].cumulativeSummary).toContain("最初的业务目标");
  expect(prompts.every((prompt) => prompt.previousTitle === "会员业务")).toBe(true);
  expect(result.changed).toBe(false);
  expect(progress).toHaveBeenLastCalledWith(4, 4);
});
it("repairs an overlong title once, then rejects persistent invalid output", async () => {
  const one = {
    ...history,
    messages: history.messages.map((message) => ({ ...message, text: "问题" })),
  };
  const complete = vi.fn().mockResolvedValue(output("超长标题"));
  const run = () =>
    analyzeConversation({
      history: one,
      previousTitle: null,
      maxLength: 2,
      client: { complete, listModels: vi.fn() },
      signal: new AbortController().signal,
      progress: vi.fn(),
    });
  await expect(run()).rejects.toThrow("长度限制");
  expect(complete).toHaveBeenCalledTimes(2);
  complete
    .mockReset()
    .mockResolvedValueOnce(output("超长标题"))
    .mockResolvedValueOnce(output("会员"));
  expect((await run()).title).toBe("会员");
});
it("counts visible graphemes and enforces both configured and host limits", () => {
  expect(titleLength("会员👨‍👩‍👧‍👦e\u0301")).toBe(4);
  expect(validTitle("会员👨‍👩‍👧‍👦e\u0301", 4)).toBe(true);
  expect(validTitle("A B!", 3)).toBe(false);
  expect(validTitle("换\n行", 30)).toBe(false);
  expect(validTitle("👨‍👩‍👧‍👦".repeat(30), 30)).toBe(false);
});
