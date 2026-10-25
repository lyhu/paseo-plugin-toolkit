import { expect, it } from "vitest";
import { titleContext } from "./context";
import type { HistoryMessage } from "./history";

function conversation(rounds: number, text = "会员目标"): HistoryMessage[] {
  return Array.from({ length: rounds }, (_, index) => [
    { role: "user" as const, text: `${text}-${index}`, seq: index * 2, key: `u${index}` },
    { role: "assistant" as const, text: `结论-${index}`, seq: index * 2 + 1, key: `a${index}` },
  ]).flat();
}

it("keeps short conversations intact including assistant decisions", () => {
  const messages = conversation(20);
  const context = titleContext(messages);
  expect(context).toMatchObject({ mode: "full", omittedMessages: 0, truncatedMessages: 0 });
  expect(context.messages).toEqual(messages.map(({ role, text, seq }) => ({ role, text, seq })));
  expect(titleContext([]).messages).toEqual([]);
});

it("prioritizes original and recent user goals while sampling the middle in order", () => {
  const messages = conversation(100);
  const context = titleContext(messages);
  const users = context.messages.filter((message) => message.role === "user");
  expect(context.mode).toBe("user-focused");
  expect(users).toHaveLength(16);
  expect(users.slice(0, 2).map((message) => message.text)).toEqual(["会员目标-0", "会员目标-1"]);
  expect(users.slice(-8).map((message) => message.text)).toEqual(
    Array.from({ length: 8 }, (_, index) => `会员目标-${92 + index}`),
  );
  expect(users.slice(2, 8).every((message) => message.seq > 2 && message.seq < 184)).toBe(true);
  expect(context.messages.slice(-1)[0]?.text).toBe("结论-99");
  expect(context.omittedMessages).toBe(182);
  expect(context.messages.map((message) => message.seq)).toEqual(
    context.messages.map((message) => message.seq).sort((a, b) => a - b),
  );
});

it("clips huge individual messages at both ends and reports incomplete evidence", () => {
  const messages = conversation(1);
  messages[0]!.text = "最初目标" + "长内容".repeat(10000) + "最新约束";
  const context = titleContext(messages);
  expect(context.mode).toBe("user-focused");
  expect(context.truncatedMessages).toBe(1);
  expect(context.messages[0]!.text).toMatch(/^最初目标.*省略中间内容.*最新约束$/s);
  expect(messages[0]!.text).not.toContain("省略");
});

it.each(['\u0000\n\t"\\', "中文👨‍👩‍👧‍👦"])(
  "bounds serialized evidence for escaped and unicode text: %s",
  (text) => {
    const context = titleContext(conversation(100, text.repeat(2000)));
    expect(context.messages.filter((message) => message.role === "user")).toHaveLength(16);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(10000);
  },
);

it("handles assistant-only history with a bounded sample", () => {
  const messages = conversation(100, "A".repeat(2000))
    .filter((message) => message.role === "assistant")
    .map((message) => ({ ...message, text: "结论".repeat(1000) }));
  const context = titleContext(messages);
  expect(context.totalUserMessages).toBe(0);
  expect(context.messages).toHaveLength(16);
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(10000);
});
