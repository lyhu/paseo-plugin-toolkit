import { observeAgents } from "../agent-directory";
import { createFeatureController } from "./features";
import type { PluginClientContext } from "@getpaseo/plugin/client";

import type { ChatViewSettings } from "../../shared/chat-view/settings";

export function registerChatView(
  client: PluginClientContext,
  onSettingsChange: (values: ChatViewSettings) => void,
) {
  const features = createFeatureController(client, onSettingsChange);
  const unsubscribe = observeAgents(client.paseo, {
    upsert: (agent) => features.registerAgent(agent),
    remove: (id) => features.unregisterAgent(id),
  });
  return {
    apply: features.apply,
    dispose: async () => {
      unsubscribe();
      features.cleanup();
    },
  };
}
