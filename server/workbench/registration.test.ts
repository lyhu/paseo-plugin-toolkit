import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import contribute from "../../index.server";
import {
  initializePersonalAI,
  createPersonalAISession,
  saveWorkbenchSkill,
  toggleWorkbenchSkill,
} from "../../shared/workbench/ai";
import { saveWorkbenchMemory, readWorkbenchState } from "../../shared/workbench/state";
import { readSearchStatus } from "../../shared/workbench/search";
import { listCreationPlans } from "../../shared/workbench/operations";

it("registers services together, limits personal context to confirmed enabled memory and closes tools", async () => {
  const home = mkdtempSync(join(tmpdir(), "workbench-registration-"));
  vi.stubEnv("PASEO_HOME", home);
  const handlers = new Map<unknown, (input: any, context?: any) => any>();
  let mcp: { url: string; headers: Record<string, string> } | undefined;
  let systemPrompt = "";
  const workspace = {
    id: "workspace",
    projectId: "project",
    refresh: async () => ({}),
    setTitle: async () => ({ title: "知行空间" }),
    agents: {
      create: async (input: any) => {
        mcp = input.config.mcpServers["toolkit-workbench"];
        systemPrompt = input.config.systemPrompt;
        return { id: input.agentId };
      },
    },
  };
  const paseo = {
    hosts: { list: async () => ({ self: { serverId: "self" }, hosts: [] }) },
    workspaces: { open: async () => workspace, ref: () => workspace },
  };
  const dispose = contribute({
    before: () => () => {},
    on: () => () => {},
    handle: (contract: unknown, handler: any) => handlers.set(contract, handler),
    registerSettings: () => ({ read: async () => ({ status: "ready", values: {} }) }),
  } as never);
  const client = new Client({ name: "registration-test", version: "1" });
  try {
    expect(handlers.has(readWorkbenchState)).toBe(true);
    expect(handlers.has(readSearchStatus)).toBe(true);
    expect(handlers.get(listCreationPlans)!({})).toEqual([]);
    for (const [revision, enabled, confirmed, scope, body] of [
      [0, true, true, "personal", "VISIBLE"],
      [1, false, true, "personal", "DISABLED"],
      [2, true, false, "personal", "UNCONFIRMED"],
      [3, true, true, "other-project", "OTHER_SCOPE"],
    ] as const) {
      handlers.get(saveWorkbenchMemory)!({
        revision,
        title: body,
        body,
        enabled,
        confirmed,
        scope,
      });
    }
    await handlers.get(initializePersonalAI)!({}, { paseo });
    for (const [slug, content] of [
      ["visible-skill", "ENABLED_SKILL_CONTENT"],
      ["hidden-skill", "DISABLED_SKILL_CONTENT"],
    ]) {
      handlers.get(saveWorkbenchSkill)!({ slug, name: slug, description: slug, content });
    }
    handlers.get(toggleWorkbenchSkill)!({ slug: "hidden-skill", enabled: false });
    await handlers.get(createPersonalAISession)!(
      { provider: "codex/test-model", title: "Personal" },
      { paseo },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcp!.url), {
        requestInit: { headers: mcp!.headers },
      }),
    );
    const context = JSON.stringify(await client.callTool({ name: "read_context", arguments: {} }));
    expect(context).toContain("ENABLED_SKILL_CONTENT");
    expect(context).not.toContain("DISABLED_SKILL_CONTENT");
    expect(systemPrompt).toContain("ENABLED_SKILL_CONTENT");
    expect(systemPrompt).not.toContain("DISABLED_SKILL_CONTENT");
    expect(context).toContain("VISIBLE");
    for (const hidden of ["DISABLED", "UNCONFIRMED", "OTHER_SCOPE"])
      expect(context).not.toContain(hidden);
    await client.close();
    await dispose();
    await expect(
      fetch(mcp!.url, { method: "POST", headers: mcp!.headers, body: "{}" }),
    ).rejects.toThrow();
  } finally {
    await client.close();
    await dispose();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
});
