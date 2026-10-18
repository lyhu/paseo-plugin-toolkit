import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ChatViewSettings } from "../../../shared/chat-view/settings";
import { createAgentPills } from "../agent-pills";
import type { FeatureDomain } from "../feature";
import { subscribeLocale } from "../locale";
import { cleanupStickyMessages } from "./StickyBar";
import { createStickyPill } from "./pill";

/**
 * The sticky bar self-mounts: `useStickyMessage` reads the switch itself and installs into whatever
 * viewport it discovers, so this domain has no global host registration to add or track. Turning
 * the switch off is enforced by tearing the installed viewports down; turning it back on needs no
 * re-registration, because the next mounted row installs itself.
 *
 * The composer pill is agent-scoped, so it is attached per conversation instead.
 */
export function createStickyDomain(
  client: PluginClientContext,
  onSettingsChange: (values: ChatViewSettings) => void,
): FeatureDomain<"stickyEnabled"> {
  const pills = createAgentPills((agent) => createStickyPill(client, agent, onSettingsChange));
  // The pill title is fixed at registration, so a language change rebuilds the pills.
  const unsubscribeLocale = subscribeLocale(() => pills.refresh());
  return {
    settingKey: "stickyEnabled",
    setEnabled(enabled) {
      if (!enabled) cleanupStickyMessages();
      pills.setEnabled(enabled);
    },
    registerAgent: (agent) => pills.registerAgent(agent),
    unregisterAgent: (agentId) => pills.unregisterAgent(agentId),
    dispose() {
      unsubscribeLocale();
      cleanupStickyMessages();
      pills.dispose();
    },
  };
}
