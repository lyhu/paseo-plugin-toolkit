import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { endpoint, groundCandidates, summarize, type Evidence } from "./model";
import { fetchModels, probeModel } from "../models/connection";

import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";

const evidence: Evidence[] = [
  {
    id: "q1",
    text: "检查集群",
    context: "",
    frequency: 2,
    sources: [{ agentId: "a", question: "检查集群" }],
  },
  {
    id: "q2",
    text: "集群正常吗",
    context: "",
    frequency: 3,
    sources: [{ agentId: "b", question: "集群正常吗" }],
  },
];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
describe("model summary", () => {
  it("fetches and deduplicates a model catalog using the configured base URL and key", async () => {
    let path = "";
    let authorization = "";
    const server = createServer((req, res) => {
      path = req.url ?? "";
      authorization = req.headers.authorization ?? "";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "beta" }, { id: "alpha" }, { id: "beta" }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    expect(
      await fetchModels({
        baseUrl: `http://127.0.0.1:${address.port}/v1/chat/completions`,
        model: "",
        apiKey: "test-key",
      }),
    ).toEqual({ models: ["alpha", "beta"] });
    expect(path).toBe("/v1/models");
    expect(authorization).toBe("Bearer test-key");
  });
  it("tests the selected model and its JSON output capability", async () => {
    let received: Record<string, unknown> = {};
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      received = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    const result = await probeModel({
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "chosen-model",
      apiKey: "",
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(received.model).toBe("chosen-model");
    expect(received.response_format).toEqual({ type: "json_object" });
  });
  it("does not report JSON-incompatible model output as a successful connection test", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    await expect(
      probeModel({ baseUrl: `http://127.0.0.1:${address.port}`, model: "test", apiKey: "" }),
    ).rejects.toThrow("未返回要求的 JSON");
  });
  it("keeps model catalog errors from exposing provider response bodies", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(401);
      res.end("private-key and account information");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    await expect(
      fetchModels({ baseUrl: `http://127.0.0.1:${address.port}`, model: "", apiKey: "" }),
    ).rejects.toThrow("模型服务请求失败（HTTP 401），请检查地址、API Key 和模型。");
  });
  it("ranks and keeps the top 20 when a real provider returns more candidates", () => {
    const input = Array.from(
      { length: 21 },
      (_, index): Evidence => ({
        id: `q${index}`,
        text: `question ${index}`,
        context: "",
        frequency: index === 20 ? 9 : 1,
        sources: [{ agentId: "a", question: `question ${index}` }],
      }),
    );
    const response = {
      candidates: input.map((item) => ({ text: item.text, sourceIds: [item.id] })),
    };
    const result = groundCandidates(response, input);
    expect(result).toHaveLength(20);
    expect(result.map((item) => item.text)).toEqual([
      "question 20",
      ...Array.from({ length: 19 }, (_, index) => `question ${index}`),
    ]);
    expect(result[0].frequency).toBe(9);
  });
  it("ranks merged repeated questions ahead of isolated questions regardless of model order", () => {
    const result = groundCandidates(
      {
        candidates: [
          { text: "单次提问", sourceIds: ["once"] },
          { text: "检查集群状态", sourceIds: ["q1", "q2", "q2"] },
        ],
      },
      [...evidence, { ...evidence[0], id: "once", frequency: 1 }],
    );
    expect(result.map(({ text, frequency }) => ({ text, frequency }))).toEqual([
      { text: "检查集群状态", frequency: 5 },
      { text: "单次提问", frequency: 1 },
    ]);
  });
  it("grounds frequencies and sources in supplied evidence", () => {
    expect(
      groundCandidates(
        { candidates: [{ text: "检查集群状态", sourceIds: ["q1", "q2"] }] },
        evidence,
      ),
    ).toEqual([
      {
        id: "candidate-0",
        text: "检查集群状态",
        origin: "history",
        frequency: 5,
        sources: [evidence[0].sources[0], evidence[1].sources[0]],
      },
    ]);
    expect(() =>
      groundCandidates({ candidates: [{ text: "invented", sourceIds: ["q3"] }] }, evidence),
    ).toThrow("不存在");
  });
  it("allows one message to support multiple questions but counts it once per question", () => {
    const result = groundCandidates(
      {
        candidates: [
          { text: "one", sourceIds: ["q1", "q1"] },
          { text: "two", sourceIds: ["q1"] },
        ],
      },
      evidence,
    );
    expect(
      result.map((item) => ({ text: item.text, frequency: item.frequency, sources: item.sources })),
    ).toEqual([
      { text: "one", frequency: 2, sources: evidence[0].sources },
      { text: "two", frequency: 2, sources: evidence[0].sources },
    ]);
  });
  it("sends only text to a compatible HTTP service without tools", async () => {
    let received: Record<string, unknown> = {};
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      received = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  candidates: [{ text: "检查集群状态", sourceIds: ["q1", "q2"] }],
                }),
              },
            },
          ],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    const result = await summarize(
      { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test", apiKey: "" },
      evidence,
      new AbortController().signal,
    );
    expect(result[0].frequency).toBe(5);
    expect((received.messages as { content: string }[])[0].content).toContain(
      DEFAULT_SUMMARY_PROMPT,
    );
    expect(received.model).toBe("test");
    expect(received.response_format).toEqual({ type: "json_object" });
    expect(received).not.toHaveProperty("tools");
    expect(received).not.toHaveProperty("tool_choice");
    expect(JSON.stringify(received)).not.toContain("agentId");
  });
  it.each([
    {
      name: "prose",
      invalid: "好的，以下是一些常见问题：\n1. 检查集群状态",
      reason: "模型返回的内容不是有效 JSON，请重试总结。",
    },
    {
      name: "wrong JSON fields",
      invalid: JSON.stringify({ intent: "answer", items: [], summary: "继续历史任务" }),
      reason: "模型响应缺少有效的 candidates、text 或 sourceIds 字段，请重试总结。",
    },
  ])(
    "retries $name once using the same batch and reports the retry",
    async ({ invalid, reason }) => {
      const requests: Record<string, unknown>[] = [];
      const retries: string[] = [];
      const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        requests.push(JSON.parse(body));
        const content =
          requests.length === 1
            ? invalid
            : JSON.stringify({ candidates: [{ text: "检查集群状态", sourceIds: ["q1", "q2"] }] });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }] }));
      });
      servers.push(server);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing HTTP address");
      const result = await summarize(
        { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test", apiKey: "" },
        evidence,
        new AbortController().signal,
        { prompt: "优先合并服务器巡检相关的重复提问", onRetry: (reason) => retries.push(reason) },
      );
      expect(result[0].frequency).toBe(5);
      expect(requests).toHaveLength(2);
      expect(requests.map((request) => request.response_format)).toEqual([
        { type: "json_object" },
        { type: "json_object" },
      ]);
      expect(retries).toEqual([reason]);
      for (const request of requests) {
        const messages = request.messages as { role: string; content: string }[];
        expect(messages[0].content).toContain("优先合并服务器巡检相关的重复提问");
        expect(messages[0].content).toContain("sourceIds 必须引用输入 id");
      }
    },
  );
  it("stops after one format retry instead of repeatedly calling the service", async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests += 1;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "普通文字，不是 JSON" } }],
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    await expect(
      summarize(
        { baseUrl: `http://127.0.0.1:${address.port}`, model: "test", apiKey: "" },
        evidence,
        new AbortController().signal,
      ),
    ).rejects.toThrow("已自动重试 1 次");
    expect(requests).toBe(2);
  });
  it("does not expose provider error bodies", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(401);
      res.end("private-key and private history");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP address");
    await expect(
      summarize(
        { baseUrl: `http://127.0.0.1:${address.port}`, model: "test", apiKey: "" },
        evidence,
        new AbortController().signal,
      ),
    ).rejects.toThrow("HTTP 401");
  });
  it("accepts base URLs and full completion endpoints", () => {
    expect(endpoint("https://example.com/v1/")).toBe("https://example.com/v1/chat/completions");
    expect(endpoint("https://example.com")).toBe("https://example.com/v1/chat/completions");
    expect(endpoint("https://example.com/v1/chat/completions")).toBe(
      "https://example.com/v1/chat/completions",
    );
  });
});
