import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import { personalAIStateSchema, type PersonalAIState } from "../../shared/workbench/ai";
import { writePrivateJsonFile } from "../storage/revisioned-json";
import { createSkillStore } from "./skills";
import type { createWorkbenchTools } from "./tools";

export function createPersonalAI(
  home: string,
  tools: ReturnType<typeof createWorkbenchTools>,
  readContext?: () => Promise<unknown>,
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
  return {
    read,
    initialize(paseo: PaseoApi) {
      if (initializing) return initializing;
      initializing = (async () => {
        const current = read();
        if (current.initialized) return current;
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
      const capability = await tools.issue(agentId, async () => ({
        personalAI: read(),
        hosts: await paseo.hosts.list(),
        memory: readContext ? await readContext() : undefined,
      }));
      try {
        const agent = await workspace.agents.create({
          agentId,
          config: {
            provider: input.provider,
            mcpServers: { "toolkit-workbench": capability.config },
            systemPrompt:
              "Use toolkit-workbench tools for personal context and creation plans. Creation requires user confirmation in Workbench. Tool credentials expire when the plugin restarts; start a new personal-AI session to reconnect.",
          },
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
