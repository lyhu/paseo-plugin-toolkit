import type { PaseoAgent } from "@getpaseo/client";
import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createAgentPills } from "../agent-pills";
import type { FeatureDomain } from "../feature";
import { subscribeLocale, tr } from "../locale";
import { requireComposerText, runEnhance, undoEnhance } from "./controller";
import { EnhanceIcon } from "./pill";
import { enhanceState } from "./state";

function createEnhancePill(
  client: PluginClientContext,
  agent: PaseoAgent,
): PluginButtonRegistration {
  const workspaceId = agent.workspaceId ?? "";
  const pillTitle = tr("enhance.pillTitle");
  const pillLabel = tr("enhance.pillLabel");
  // Declared before the behavior closes over it: the press runs long after this returns.
  let pill: PluginButtonRegistration | undefined;
  pill = client.addComposerPill({
    id: `enhance-${agent.id}`,
    workspaceId,
    agentId: agent.id,
    button: {
      title: pillTitle,
      label: pillLabel,
      icon: EnhanceIcon,
      behavior: {
        kind: "action",
        onPress: async () => {
          // Clear the previous note first: this press either replaces it or fails on its own terms.
          pill?.update({ title: pillTitle });
          const note = await pressEnhance(client, agent.id, workspaceId);
          // A shortened body still lands; the tooltip says so instead of the text silently shrinking.
          if (note) pill?.update({ title: note });
        },
      },
    },
  });
  return pill;
}

/** A second press restores the pre-enhancement text instead of enhancing twice. */
async function pressEnhance(
  client: PluginClientContext,
  agentId: string,
  workspaceId: string,
): Promise<string | null> {
  enhanceState.markCurrent(agentId);
  if (undoEnhance(agentId)) return null;
  const raw = requireComposerText();
  return runEnhance(client, { agentId, workspaceId }, raw);
}

/**
 * Two entry points share one enhancement flow: a slash command on every client, and a composer pill
 * per conversation. Both read and write the composer through the one stable attribute the host
 * renders, so a single press handler serves every platform.
 */
export function createEnhanceDomain(client: PluginClientContext): FeatureDomain<"enhanceEnabled"> {
  // A command's description and a pill's title are fixed at registration, so a language change
  // re-registers them instead of leaving the previous language in the composer.
  const addCommand = () =>
    client.addSlashCommand({
      name: "enhance",
      description: tr("enhance.commandDesc"),
      argumentHint: tr("enhance.commandArgHint"),
      context: "agent",
      onSubmit: async ({ args, agent }) => {
        enhanceState.markCurrent(agent.id);
        const raw = args.trim();
        if (!raw) throw new Error(tr("enhance.commandUsage"));
        await runEnhance(client, { agentId: agent.id, workspaceId: agent.workspaceId ?? "" }, raw);
      },
    });
  let removeCommand = addCommand();
  const pills = createAgentPills((agent) => createEnhancePill(client, agent));
  const unsubscribeLocale = subscribeLocale(() => {
    removeCommand();
    removeCommand = addCommand();
    pills.refresh();
  });
  return {
    settingKey: "enhanceEnabled",
    setEnabled(enabled) {
      pills.setEnabled(enabled);
    },
    registerAgent: (agent) => pills.registerAgent(agent),
    unregisterAgent: (agentId) => pills.unregisterAgent(agentId),
    dispose() {
      unsubscribeLocale();
      removeCommand();
      pills.dispose();
    },
  };
}
