import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { paseoHome } from "../models/storage";
import { renameSession } from "./rename";

// Opt-in acceptance against the local running plugin. Never prompts an AI or touches an existing agent.
it.skipIf(process.env.TOOLKIT_TITLE_DAEMON !== "1")(
  "serves real plugin RPCs and renames an empty disposable session through the CLI",
  async () => {
    const home = paseoHome();
    const missingId = `toolkit-acceptance-nonexistent-${randomUUID()}`;
    const lock = JSON.parse(readFileSync(join(home, "paseo.pid"), "utf8")) as { listen: string };
    const client = new DaemonClient({
      url: `ws://${lock.listen}/ws`,
      clientId: "toolkit-title-acceptance",
      clientType: "cli",
      localCredential: () => readFileSync(join(home, "local-credential"), "utf8").trim(),
      reconnect: { enabled: false },
    });
    let agentId: string | undefined;
    await client.connect();
    try {
      expect(
        await client.invokePluginRpc("toolkit", "session-title.read", {
          agentId: missingId,
        }),
      ).toMatchObject({ job: null, result: null });
      const agent = await client.createAgent({
        config: { provider: "codex", cwd: process.cwd(), title: "Toolkit 命名验收空会话" },
      });
      agentId = agent.id;
      await renameSession(agentId, "Toolkit 业务标题写回验收", new AbortController().signal);
      expect((await client.fetchAgent({ agentId }))?.agent.title).toBe("Toolkit 业务标题写回验收");
      expect(
        await client.invokePluginRpc("toolkit", "session-title.queue-clear", { agentId }),
      ).toMatchObject({ source: "archive", phase: "queued" });
      expect((await client.fetchAgent({ agentId }))?.agent.archivedAt).toBeFalsy();
      // Native /clear uses this same daemon operation after retargeting its tab to a fresh draft.
      await client.archiveAgent(agentId);
      expect((await client.fetchAgent({ agentId }))?.agent.archivedAt).toBeTruthy();
      const directory = await createPaseoApi(client).agents.list({
        filter: { includeArchived: true, includeInternal: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200 },
      });
      expect(directory.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent: expect.objectContaining({
              id: agentId,
              workspaceId: agent.workspaceId,
              archivedAt: expect.any(String),
            }),
          }),
        ]),
      );
      expect(
        await client.invokePluginRpc("toolkit", "session-title.turns", {
          agentId,
          workspaceId: "toolkit-unrelated-workspace",
        }),
      ).toEqual({ count: null });
      const namingDeadline = Date.now() + 5000;
      let naming: { phase: string; error: string | null } | null = null;
      while (Date.now() < namingDeadline && naming?.phase !== "error") {
        const state = (await client.invokePluginRpc("toolkit", "session-title.read", {
          agentId,
        })) as { job: { phase: string; error: string | null } | null };
        naming = state.job;
        if (naming?.phase !== "error") await new Promise((resolve) => setTimeout(resolve, 30));
      }
      // An unprompted archived provider thread may not be loaded. Neither empty-history path calls a model.
      expect(naming?.phase).toBe("error");
      expect(["会话历史读取失败，请在智能命名中重试。", "会话没有可总结的文本。"]).toContain(
        naming?.error,
      );
      await renameSession(agentId, "Toolkit 归档后标题写回验收", new AbortController().signal);
      expect((await client.fetchAgent({ agentId }))?.agent.title).toBe(
        "Toolkit 归档后标题写回验收",
      );
      expect(
        await client.invokePluginRpc("toolkit", "session-title.list", {
          workspaceId: agent.workspaceId,
        }),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ agentId, archived: true })]));
      // Starting is silent even for an unavailable session; diagnostics records the failure.
      expect(
        await client.invokePluginRpc("toolkit", "session-title.start", {
          agentId: missingId,
        }),
      ).toMatchObject({ source: "command" });
      const deadline = Date.now() + 5000;
      let phase = "reading";
      while (Date.now() < deadline && phase !== "error") {
        const state = (await client.invokePluginRpc("toolkit", "session-title.read", {
          agentId: missingId,
        })) as { job: { phase: string; error: string | null } };
        phase = state.job.phase;
        if (phase === "error") expect(state.job.error).toContain("会话不可用");
        else await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(phase).toBe("error");
    } finally {
      if (agentId) await client.archiveAgent(agentId);
      await client.close();
    }
  },
  60000,
);
