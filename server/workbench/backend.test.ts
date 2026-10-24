import { mkdtempSync, rmSync, existsSync, readFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaseoApi } from "@getpaseo/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createOperationStore } from "./operations";
import { createWorkbenchTools } from "./tools";
import { createPersonalAI } from "./personal-ai";
import { createSkillStore } from "./skills";
import { createPersonalAISession } from "../../shared/workbench/ai";

const homes: string[] = [];
function home() {
  const value = mkdtempSync(join(tmpdir(), "workbench-test-"));
  homes.push(value);
  return value;
}
afterEach(() => {
  for (const value of homes.splice(0)) rmSync(value, { recursive: true, force: true });
});
function fakeApi() {
  const workspace = {
    id: "workspace",
    projectId: "project",
    directory: "/workspace",
    refresh: vi.fn(async () => ({})),
    agents: { create: vi.fn(async () => ({ id: "agent" })) },
  };
  const api = {
    hosts: {
      list: vi.fn(async () => ({ self: { serverId: "self" }, hosts: [] })),
      client: vi.fn(),
    },
    workspaces: {
      create: vi.fn(async () => workspace),
      open: vi.fn(async () => workspace),
      ref: vi.fn(() => workspace),
    },
    dispose: vi.fn(),
  };
  return { api: api as unknown as PaseoApi, raw: api, workspace };
}
describe("creation operations", () => {
  it("rejects a provider without its model before saving or executing", () => {
    expect(
      createPersonalAISession.input.safeParse({ provider: "codex", title: "Test" }).success,
    ).toBe(false);
    const store = createOperationStore(join(home(), "operations.json"));
    expect(() =>
      store.prepare({
        kind: "session",
        serverId: "self",
        workspaceId: "workspace",
        provider: "codex",
        name: "Test",
      }),
    ).toThrow("provider/model");
    expect(store.list()).toEqual([]);
  });
  it("requires revision confirmation, executes exactly once and routes remote operations", async () => {
    const store = createOperationStore(join(home(), "operations.json"));
    const local = fakeApi();
    const remote = fakeApi();
    local.raw.hosts.client.mockResolvedValue(remote.api);
    const plan = store.prepare({
      kind: "workspace",
      serverId: "remote",
      name: "Work",
      path: "/remote/path",
      provider: "codex/test-model",
    });
    expect(remote.raw.workspaces.create).not.toHaveBeenCalled();
    const first = store.execute(plan.id, plan.revision, local.api);
    await expect(store.execute(plan.id, plan.revision, local.api)).rejects.toThrow("计划已更新");
    const result = await first;
    expect(result.status).toBe("completed");
    expect(local.raw.workspaces.create).not.toHaveBeenCalled();
    expect(remote.raw.workspaces.create).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: plan.id,
      source: { kind: "directory", path: "/remote/path", projectId: undefined },
      title: "Work",
    });
    expect(remote.raw.dispose).toHaveBeenCalledOnce();
    expect(result.result?.agentId).toBe("agent");
  });
  it("creates only a confirmed local project directory and keeps partial success", async () => {
    const directory = join(home(), "new-project");
    const store = createOperationStore(join(home(), "operations.json"));
    const { api, workspace } = fakeApi();
    workspace.agents.create.mockRejectedValue(new Error("provider unavailable"));
    const plan = store.prepare({
      kind: "project",
      serverId: "self",
      name: "Project",
      path: directory,
      provider: "codex/test-model",
    });
    expect(existsSync(directory)).toBe(false);
    const result = await store.execute(plan.id, 0, api);
    expect(existsSync(directory)).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.result?.workspaceId).toBe("workspace");
    await expect(store.execute(plan.id, result.revision, api)).rejects.toThrow("不能重复执行");
  });
  it("preserves uncertain outcome after restart and rejects edits without corrupting the draft", async () => {
    const filename = join(home(), "operations.json");
    const store = createOperationStore(filename);
    const { api, raw } = fakeApi();
    const plan = store.prepare({
      kind: "workspace",
      serverId: "self",
      name: "Work",
      path: "/existing",
    });
    expect(() => store.edit(plan.id, 0, { ...plan.payload, path: "relative" })).toThrow();
    expect(store.get(plan.id).payload.path).toBe("/existing");
    raw.workspaces.create.mockImplementation(() => new Promise(() => {}));
    void store.execute(plan.id, 0, api);
    await Promise.resolve();
    const recovered = createOperationStore(filename).get(plan.id);
    expect(recovered.status).toBe("unknown");
  });
});

describe("personal AI and skills", () => {
  it("initializes once, loads real files, disables by moving, and injects MCP into actual sessions", async () => {
    const directory = home();
    const tools = createWorkbenchTools(createOperationStore(join(directory, "operations.json")));
    const ai = createPersonalAI(directory, tools);
    const { api, raw, workspace } = fakeApi();
    expect(ai.read().initialized).toBe(false);
    expect(existsSync(join(directory, "workbench"))).toBe(false);
    const [a, b] = await Promise.all([ai.initialize(api), ai.initialize(api)]);
    expect(a).toEqual(b);
    expect(raw.workspaces.open).toHaveBeenCalledOnce();
    expect(a.skills).toHaveLength(3);
    ai.saveSkill({
      slug: "my-skill",
      name: "Mine",
      description: "Test",
      content: "Do the requested thing.",
    });
    const skill = ai.read().skills.find((item) => item.slug === "my-skill")!;
    expect(readFileSync(skill.path, "utf8")).toContain("Do the requested thing.");
    const disabled = ai
      .toggleSkill("my-skill", false)
      .skills.find((item) => item.slug === "my-skill")!;
    expect(disabled.enabled).toBe(false);
    expect(existsSync(skill.path)).toBe(false);
    expect(existsSync(disabled.path)).toBe(true);
    await ai.createSession(api, { provider: "codex/test-model", title: "Personal" });
    expect(workspace.agents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          provider: "codex/test-model",
          mcpServers: { "toolkit-workbench": expect.objectContaining({ type: "http" }) },
        }),
      }),
    );
    await tools.close();
  });
  it("rejects symbolic skill directories", () => {
    const directory = home();
    mkdirSync(join(directory, ".agents"));
    symlinkSync(home(), join(directory, ".agents", "skills"));
    expect(() =>
      createSkillStore(directory).save({
        slug: "test",
        name: "Test",
        description: "Test",
        content: "Content",
      }),
    ).toThrow("符号链接");
  });
});

it("serves real MCP read/prepare/result tools with session isolation and no execution tool", async () => {
  const operations = createOperationStore(join(home(), "operations.json"));
  const tools = createWorkbenchTools(operations);
  const capability = await tools.issue("personal-agent", async () => ({
    memory: "Personal context",
  }));
  const client = new Client({ name: "workbench-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(capability.config.url), {
        requestInit: { headers: capability.config.headers },
      }),
    );
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      "read_context",
      "prepare_creation",
      "get_creation_result",
    ]);
    const context = await client.callTool({ name: "read_context", arguments: {} });
    expect(JSON.stringify(context)).toContain("Personal context");
    const result = await client.callTool({
      name: "prepare_creation",
      arguments: { kind: "workspace", serverId: "self", name: "Draft", path: "/existing" },
    });
    expect(result.isError).not.toBe(true);
    expect(operations.list()[0].status).toBe("pending");
    const other = operations.prepare(
      { kind: "workspace", serverId: "self", name: "Other", path: "/other" },
      "other-agent",
    );
    const denied = await client.callTool({
      name: "get_creation_result",
      arguments: { id: other.id },
    });
    expect(denied.isError).toBe(true);
    const unauthenticated = await fetch(capability.config.url, { method: "POST", body: "{}" });
    expect(unauthenticated.status).toBe(401);
  } finally {
    await client.close();
    await tools.close();
  }
});
