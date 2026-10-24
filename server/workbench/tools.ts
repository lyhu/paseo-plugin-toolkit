import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { creationPayloadSchema } from "../../shared/workbench/operations";
import type { OperationStore } from "./operations";

/** A capability token is issued only for a personal-AI session and lives until plugin unload. */
export function createWorkbenchTools(operations: OperationStore) {
  const sessions = new Map<string, { agentId: string; readContext: () => Promise<unknown> }>();
  const active = new Set<McpServer>();
  const http = createServer(async (request, response) => {
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const session = token && sessions.get(token);
    if (!session || request.url !== "/mcp") {
      response.writeHead(401).end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const server = new McpServer({ name: "toolkit-workbench", version: "1.0.0" });
    const result = (value: unknown) => ({
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
    });
    server.registerTool(
      "read_context",
      {
        description: "Read personal Workbench context. This tool does not mutate memory.",
        inputSchema: {},
      },
      async () => result(await session.readContext()),
    );
    server.registerTool(
      "prepare_creation",
      {
        description:
          "Prepare a creation plan for user review. Does not create any project, workspace or session. User must explicitly confirm in Workbench.",
        inputSchema: creationPayloadSchema,
      },
      async (payload) =>
        result(operations.prepare(creationPayloadSchema.parse(payload), session.agentId)),
    );
    server.registerTool(
      "get_creation_result",
      {
        description: "Read the actual status of a plan prepared by this session.",
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const plan = operations.get(id);
        if (plan.sourceAgentId !== session.agentId) throw new Error("该计划不属于当前会话");
        return result(plan);
      },
    );
    active.add(server);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      active.delete(server);
      void server.close();
    });
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 128_000) {
          response.writeHead(413).end();
          return;
        }
      }
      await server.connect(transport);
      await transport.handleRequest(request, response, JSON.parse(body));
    } catch {
      if (!response.headersSent) response.writeHead(400).end();
    }
  });
  let listening: Promise<string> | undefined;
  function listen() {
    return (listening ??= new Promise<string>((resolve, reject) => {
      http.once("error", reject);
      http.listen(0, "127.0.0.1", () => {
        const address = http.address();
        if (!address || typeof address === "string")
          return reject(new Error("无法启动 Workbench 工具"));
        resolve(`http://127.0.0.1:${address.port}/mcp`);
      });
    }));
  }
  return {
    async issue(agentId: string, readContext: () => Promise<unknown>) {
      const url = await listen();
      const token = randomBytes(32).toString("hex");
      sessions.set(token, { agentId, readContext });
      return {
        config: { type: "http" as const, url, headers: { Authorization: `Bearer ${token}` } },
        revoke: () => sessions.delete(token),
      };
    },
    async close() {
      sessions.clear();
      await Promise.all([...active].map((server) => server.close()));
      if (http.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
