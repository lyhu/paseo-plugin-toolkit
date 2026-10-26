import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { PaseoAgent } from "@getpaseo/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { archiveTitle } from "../../shared/session-title/contracts";
import { observeAgents } from "../agent-directory";
import { tr } from "../i18n";

function ArchiveIcon(props: PluginButtonIconProps) {
  return <Icon name="Archive" size={props.size} color={props.color} />;
}
export function registerTitlePills(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const remove = (id: string) => {
    pills.get(id)?.registration.remove();
    pills.delete(id);
  };
  const upsert = (agent: PaseoAgent) => {
    if (!agent.workspaceId || agent.archivedAt) {
      remove(agent.id);
      return;
    }
    if (pills.get(agent.id)?.workspaceId !== agent.workspaceId) remove(agent.id);
    const existing = pills.get(agent.id);
    if (existing) {
      existing.registration.update({ disabled: agent.status !== "idle" });
      return;
    }
    const registration = client.addComposerPill({
      id: `session-archive-${agent.id}`,
      workspaceId: agent.workspaceId!,
      agentId: agent.id,
      button: {
        title: tr("总结归档"),
        label: tr("总结归档"),
        icon: ArchiveIcon,
        disabled: agent.status !== "idle",
        behavior: {
          kind: "action",
          onPress: async () => {
            await client.rpc(archiveTitle, { agentId: agent.id });
          },
        },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration });
  };
  const unobserve = observeAgents(client.paseo, {
    upsert,
    remove,
  });
  return {
    refresh: () => {
      for (const pill of pills.values())
        pill.registration.update({ title: tr("总结归档"), label: tr("总结归档") });
    },
    dispose() {
      unobserve();
      for (const id of pills.keys()) remove(id);
    },
  };
}
