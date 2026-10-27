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
it.each([1, 100, 1000])("bounds model work for %i long user turns", async (turns) => {
  const complete = vi.fn().mockResolvedValue(output("会员业务"));
  const progress = vi.fn();
  const messages = Array.from({ length: turns }, (_, index) => [
    {
      role: "user" as const,
      text: `目标${index}:` + "A".repeat(40000) + `约束${index}`,
      seq: index * 2,
      key: `u${index}`,
    },
    {
      role: "assistant" as const,
      text: "回复".repeat(10000),
      seq: index * 2 + 1,
      key: `a${index}`,
    },
  ]).flat();
  const original = messages.map((message) => message.text);
  const result = await analyzeConversation({
    history: { ...history, messages },
    previousTitle: "会员业务",
    maxLength: 30,
    client: { complete, listModels: vi.fn() },
    signal: new AbortController().signal,
    progress,
  });
  expect(complete).toHaveBeenCalledTimes(1);
  const [request, options] = complete.mock.calls[0]!;
  expect(
    request.reduce(
      (length: number, message: { content: string }) => length + message.content.length,
      0,
    ),
  ).toBeLessThanOrEqual(12000);
  expect(request[1].content).toContain("目标0:");
  expect(request[1].content).toContain(`约束${turns - 1}`);
  expect(JSON.parse(request[1].content).previousTitle).toBe("会员业务");
  expect(options.maxTokens).toBeLessThanOrEqual(1500);
  expect(options.timeoutMs).toBeLessThanOrEqual(30000);
  expect(result.changed).toBe(false);
  expect(result.summary).toContain("命名摘要（选取");
  expect(progress).toHaveBeenLastCalledWith(1, 1);
  expect(messages.map((message) => message.text)).toEqual(original);
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

it("keeps short evidence intact and does not call a model for empty or canceled work", async () => {
  const complete = vi.fn().mockResolvedValue(output("会员业务"));
  const signal = new AbortController();
  const run = (messages = history.messages) =>
    analyzeConversation({
      history: { ...history, messages },
      previousTitle: null,
      maxLength: 30,
      client: { complete, listModels: vi.fn() },
      signal: signal.signal,
      progress: vi.fn(),
    });
  await expect(run([])).rejects.toThrow("没有可总结");
  expect(complete).not.toHaveBeenCalled();
  const messages = [{ ...history.messages[0]!, text: "会员续费方案" }];
  expect((await run(messages)).summary).toBe("保留最初的业务目标、关键决策和待办");
  const prompt = JSON.parse(complete.mock.calls[0]![0][1].content);
  expect(prompt.context.mode).toBe("full");
  expect(prompt.context.messages[0].text).toBe(messages[0]!.text);
  signal.abort();
  await expect(run()).rejects.toThrow("已取消");
  expect(complete).toHaveBeenCalledTimes(1);
});

it("repairs only the title without changing the original decision or summary", async () => {
  const complete = vi
    .fn()
    .mockResolvedValueOnce(output("超长标题"))
    .mockResolvedValueOnce({
      content: JSON.stringify({
        summary: "错误修改的摘要",
        title: "会员",
        changed: true,
        reason: "错误修改的原因",
      }),
    });
  const result = await analyzeConversation({
    history: { ...history, messages: [{ ...history.messages[0]!, text: "问题" }] },
    previousTitle: "会员",
    maxLength: 2,
    client: { complete, listModels: vi.fn() },
    signal: new AbortController().signal,
    progress: vi.fn(),
  });
  expect(result).toEqual(JSON.parse(output("会员").content));
  expect(complete.mock.calls[1]![1]!.timeoutMs).toBeLessThanOrEqual(15000);
});

it("does not retry timeouts or invalid responses", async () => {
  const complete = vi.fn();
  const run = () =>
    analyzeConversation({
      history,
      previousTitle: null,
      maxLength: 30,
      client: { complete, listModels: vi.fn() },
      signal: new AbortController().signal,
      progress: vi.fn(),
    });
  complete.mockRejectedValueOnce(new Error("timeout"));
  await expect(run()).rejects.toThrow("timeout");
  expect(complete).toHaveBeenCalledTimes(1);
  complete.mockReset().mockResolvedValue({ content: "invalid json" });
  await expect(run()).rejects.toThrow("总结格式无效");
  expect(complete).toHaveBeenCalledTimes(1);
});
