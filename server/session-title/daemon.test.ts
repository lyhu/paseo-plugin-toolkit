import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { paseoHome } from "../models/storage";
import { renameSession } from "./rename";

// Opt-in acceptance against the local running plugin. Never prompts an AI or touches an existing agent.
it.skipIf(process.env.TOOLKIT_TITLE_DAEMON !== "1")(
  "serves real plugin RPCs and renames an empty disposable session through the CLI",
  async () => {
    const home = paseoHome();
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
          agentId: "toolkit-acceptance-nonexistent",
        }),
      ).toMatchObject({ job: null, result: null });
      const agent = await client.createAgent({
        config: { provider: "codex", cwd: process.cwd(), title: "Toolkit 命名验收空会话" },
      });
      agentId = agent.id;
      await renameSession(agentId, "Toolkit 业务标题写回验收", new AbortController().signal);
      expect((await client.fetchAgent({ agentId }))?.agent.title).toBe("Toolkit 业务标题写回验收");
      expect(await client.invokePluginRpc("toolkit", "session-title.archive", { agentId })).toEqual(
        { archived: true },
      );
      expect((await client.fetchAgent({ agentId }))?.agent.archivedAt).toBeTruthy();
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
          agentId: "toolkit-acceptance-nonexistent",
        }),
      ).toMatchObject({ source: "command" });
      const deadline = Date.now() + 5000;
      let phase = "reading";
      while (Date.now() < deadline && phase !== "error") {
        const state = (await client.invokePluginRpc("toolkit", "session-title.read", {
          agentId: "toolkit-acceptance-nonexistent",
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
