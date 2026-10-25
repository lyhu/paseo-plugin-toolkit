import type {
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import type { PaseoAgent } from "@getpaseo/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { View } from "react-native";
import { observeAgents } from "../agent-directory";
import { tr } from "../i18n";
import { prepareClear } from "./prepare-clear";

function ArchiveIcon(props: PluginButtonIconProps) {
  return (
    <View testID={`session-title-composer-${props.context === "agent" ? props.agentId : ""}`}>
      <Icon name="ArchiveRestore" size={props.size} color={props.color} />
    </View>
  );
}
export function registerTitlePills(client: PluginClientContext) {
  const pills = new Map<
    string,
    { workspaceId: string; registration: PluginButtonRegistration; controller: AbortController }
  >();
  const remove = (id: string) => {
    pills.get(id)?.controller.abort();
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
    const controller = new AbortController();
    const registration = client.addComposerPill({
      id: `session-archive-${agent.id}`,
      workspaceId: agent.workspaceId!,
      agentId: agent.id,
      button: {
        title: tr("归档新建"),
        label: tr("归档新建"),
        icon: ArchiveIcon,
        disabled: agent.status !== "idle",
        behavior: {
          kind: "action",
          onPress: async () => {
            await prepareClear(client, agent.id, controller.signal);
          },
        },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration, controller });
  };
  const unobserve = observeAgents(client.paseo, {
    upsert,
    remove,
  });
  return {
    refresh: () => {
      for (const pill of pills.values())
        pill.registration.update({ title: tr("归档新建"), label: tr("归档新建") });
    },
    dispose() {
      unobserve();
      for (const id of pills.keys()) remove(id);
    },
  };
}
