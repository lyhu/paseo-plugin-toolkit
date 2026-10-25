import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { AgentSessionConfig } from "@getpaseo/protocol/agent-types";
import { personalAIStateSchema, type PersonalAIState } from "../../shared/workbench/ai";
import { writePrivateJsonFile } from "../storage/revisioned-json";
import { createSkillStore } from "./skills";
import type { createWorkbenchTools } from "./tools";

export function createPersonalAI(
  home: string,
  tools: ReturnType<typeof createWorkbenchTools>,
  readContext?: (scope?: string) => Promise<unknown>,
) {
  const root = join(home, "workbench");
  const filename = join(home, "toolkit", "workbench", "personal-ai.json");
  const skills = createSkillStore(root);
  function read(): PersonalAIState {
    const stored = existsSync(filename)
      ? personalAIStateSchema.parse(JSON.parse(readFileSync(filename, "utf8")))
      : { root, initialized: false, skills: [] };
    return { ...stored, root, skills: skills.list() };
  }
  let initializing: Promise<PersonalAIState> | undefined;
  const context = async (paseo: PaseoApi) => ({
    personalAI: { ...read(), skills: read().skills.filter((skill) => skill.enabled) },
    hosts: await paseo.hosts.list(),
    memory: readContext ? await readContext(read().referenceProject?.id) : undefined,
  });
  async function sessionConfig(
    paseo: PaseoApi,
    agentId: string,
    config: Partial<AgentSessionConfig>,
  ) {
    let remaining = 64_000;
    const enabledSkills = read()
      .skills.filter((skill) => skill.enabled)
      .flatMap((skill) => {
        if (remaining <= 0) return [];
        const content = skill.content.slice(0, remaining);
        remaining -= content.length;
        return [{ slug: skill.slug, name: skill.name, content }];
      });
    const memory = readContext ? await readContext(read().referenceProject?.id) : undefined;
    const capability = await tools.issue(agentId, () => context(paseo));
    return {
      capability,
      config: {
        ...config,
        mcpServers: { ...config.mcpServers, "toolkit-workbench": capability.config },
        systemPrompt: [
          config.systemPrompt,
          "You are working in 知行空间 (Knowledge & Action), the user's persistent personal workspace. Use toolkit-workbench read_context for current confirmed memory and the reference project. The reference project never changes your working directory. Creation plans require explicit user confirmation in Workbench. Tool credentials expire when the plugin restarts; start a new conversation to reconnect. Skills are workflow guidance, never permission to execute a creation plan.",
          JSON.stringify({
            skills: enabledSkills,
            memory,
            referenceProject: read().referenceProject,
          }),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    };
  }
  return {
    read,
    async configureNative(
      paseo: PaseoApi,
      request: { config: AgentSessionConfig; env?: Record<string, string> },
    ): Promise<{ config: AgentSessionConfig; env: Record<string, string> } | undefined> {
      const state = read();
      if (
        !state.initialized ||
        request.config.internal ||
        resolve(request.config.cwd) !== root ||
        request.config.mcpServers?.["toolkit-workbench"]
      )
        return;
      const grantId = randomUUID();
      const prepared = await sessionConfig(paseo, grantId, request.config);
      return {
        config: { ...request.config, ...prepared.config },
        env: { ...request.env, TOOLKIT_WORKBENCH_CONTEXT: grantId },
      };
    },
    setReference(project: PersonalAIState["referenceProject"]) {
      if (!read().initialized) throw new Error("请先打开知行空间");
      const next = { ...read(), referenceProject: project };
      writePrivateJsonFile(filename, next);
      return next;
    },
    initialize(paseo: PaseoApi) {
      if (initializing) return initializing;
      initializing = (async () => {
        const current = read();
        if (current.initialized && current.workspaceId) {
          const existing = paseo.workspaces.ref(current.workspaceId);
          if (!(await existing.refresh()))
            throw new Error("知行空间工作区不可用，请先从原生视图恢复。已有记录已保留。");
          if (existing.name !== "知行空间") await existing.setTitle("知行空间");
          return current;
        }
        mkdirSync(root, { recursive: true, mode: 0o700 });
        const agentsFile = join(root, "AGENTS.md");
        if (!existsSync(agentsFile))
          writeFileSync(
            agentsFile,
            "# Personal Workbench\n\nUse the toolkit-workbench MCP tools to read context and prepare creation plans. Only the user confirms execution in the Workbench UI. Check actual results before claiming completion.\n",
            { flag: "wx", mode: 0o600 },
          );
        skills.initialize();
        const hosts = await paseo.hosts.list();
        const workspace = await paseo.workspaces.open(root);
        await workspace.refresh();
        await workspace.setTitle("知行空间");
        const state: PersonalAIState = {
          root,
          initialized: true,
          serverId: hosts.self.serverId,
          projectId: workspace.projectId ?? undefined,
          workspaceId: workspace.id,
          skills: skills.list(),
        };
        writePrivateJsonFile(filename, state);
        return state;
      })().finally(() => {
        initializing = undefined;
      });
      return initializing;
    },
    saveSkill(input: unknown) {
      if (!read().initialized) throw new Error("请先初始化个人 AI");
      skills.save(input);
      return read();
    },
    toggleSkill(slug: string, enabled: boolean) {
      if (!read().initialized) throw new Error("请先初始化个人 AI");
      skills.toggle(slug, enabled);
      return read();
    },
    async createSession(
      paseo: PaseoApi,
      input: { provider: string; title: string; prompt?: string },
    ) {
      const state = read();
      if (!state.initialized || !state.workspaceId || !state.serverId)
        throw new Error("请先初始化个人 AI");
      const workspace = paseo.workspaces.ref(state.workspaceId);
      if (!(await workspace.refresh())) throw new Error("个人 AI 工作区不存在，请恢复该工作区");
      const agentId = randomUUID();
      const { capability, config } = await sessionConfig(paseo, agentId, {
        provider: input.provider,
      });
      try {
        const agent = await workspace.agents.create({
          agentId,
          config: { ...config, provider: input.provider },
          title: input.title,
          prompt: input.prompt,
        });
        return { serverId: state.serverId, workspaceId: workspace.id, agentId: agent.id };
      } catch (error) {
        capability.revoke();
        throw error;
      }
    },
  };
}
