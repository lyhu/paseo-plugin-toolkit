import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { connectionSchema } from "../../shared/models/contracts";
import { createChatClient } from "../models/chat-client";
import { paseoHome } from "../models/storage";
import type { HistoryMessage } from "./history";
import { analyzeConversation } from "./model";
import { validTitle } from "../../shared/session-title/contracts";

// Explicit opt-in: synthetic content only, no user conversation is sent to the model.
it.skipIf(process.env.TOOLKIT_TITLE_LIVE !== "1").each([1, 100])(
  "accepts a stable business title from the configured Host model for %i synthetic repeats",
  async (repeats) => {
    const registry = JSON.parse(readFileSync(join(paseoHome(), "toolkit", "models.json"), "utf8"));
    const config = connectionSchema.parse(registry.defaultModel);
    expect(Boolean(config.baseUrl && config.model)).toBe(true);
    const messages: HistoryMessage[] = [
      {
        role: "user",
        text: "会员续费后权益没有及时同步。需要梳理修复方案，暂时不要改代码。",
        seq: 1,
        key: "1",
      },
      {
        role: "assistant",
        text: "建议先核对支付回调幂等性、权益更新事务和缓存失效策略，目前尚未确认根因。",
        seq: 2,
        key: "2",
      },
      {
        role: "user",
        text: "优先排查回调重复投递，补充幂等设计和回归测试方案。",
        seq: 3,
        key: "3",
      },
      {
        role: "assistant",
        text: "方案：按订单号去重，在同一事务记录回调与更新权益；回归覆盖重复回调和并发。尚未实施。",
        seq: 4,
        key: "4",
      },
    ];
    const started = performance.now();
    const result = await analyzeConversation({
      history: {
        epoch: "synthetic",
        fingerprint: "synthetic",
        through: repeats * 4,
        messages: Array.from({ length: repeats }, (_, index) =>
          messages.map((message) => ({
            ...message,
            seq: message.seq + index * messages.length,
            key: String(message.seq + index * messages.length),
          })),
        ).flat(),
      },
      previousTitle: "会员续费权益同步方案",
      maxLength: 30,
      client: createChatClient(config),
      signal: new AbortController().signal,
      progress: () => {},
    });
    expect(validTitle(result.title, 30)).toBe(true);
    expect(result.title).toMatch(/会员|权益|续费|回调/);
    if (repeats > 1) expect(result.summary).toContain("命名摘要（选取");
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.changed).toBe(false);
    console.log(
      JSON.stringify({
        repeats,
        elapsedMs: Math.round(performance.now() - started),
        title: result.title,
        changed: result.changed,
        summary: result.summary,
      }),
    );
  },
  180000,
);
