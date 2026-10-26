import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { connectionSchema } from "../../shared/models/contracts";
import { createChatClient } from "../models/chat-client";
import { paseoHome } from "../models/storage";
import { analyzeConversation } from "./model";
import { validTitle } from "../../shared/session-title/contracts";

// Explicit opt-in: synthetic content only, no user conversation is sent to the model.
it.skipIf(process.env.TOOLKIT_TITLE_LIVE !== "1")(
  "accepts a summary and <=30-character business title from the configured Host model",
  async () => {
    const registry = JSON.parse(readFileSync(join(paseoHome(), "toolkit", "models.json"), "utf8"));
    const config = connectionSchema.parse(registry.defaultModel);
    expect(Boolean(config.baseUrl && config.model)).toBe(true);
    const result = await analyzeConversation({
      history: {
        epoch: "synthetic",
        fingerprint: "synthetic",
        through: 4,
        messages: [
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
        ],
      },
      previousTitle: "会员续费权益同步方案",
      maxLength: 30,
      client: createChatClient(config),
      signal: new AbortController().signal,
      progress: () => {},
    });
    expect(validTitle(result.title, 30)).toBe(true);
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.changed).toBe(false);
    console.log(
      JSON.stringify({ title: result.title, changed: result.changed, summary: result.summary }),
    );
  },
  180000,
);
