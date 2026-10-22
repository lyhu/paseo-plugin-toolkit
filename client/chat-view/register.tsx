import { observeAgents } from "../agent-directory";
import { createFeatureController } from "./features";
import { subscribeLocale, tr } from "./locale";
import { ActivitySettings } from "./settings";
import type { PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";

import type { ChatViewSettings } from "../../shared/chat-view/settings";

export function registerChatView(
  client: PluginClientContext,
  onSettingsChange: (values: ChatViewSettings) => void,
) {
  const features = createFeatureController(client, onSettingsChange);
  // Built once: re-registering the screen for a new title reuses this component, so React keeps the
  // page's local draft state instead of remounting it.
  const Screen = (props: PluginSurfaceProps) => (
    <ActivitySettings
      {...props}
      onSettingsChange={features.apply}
      onOpenModels={() => client.openSettings("models")}
    />
  );
  const addSettings = () =>
    client.addSettingsScreen({
      id: "chat-view-display",
      title: tr("settings.title"),
      icon: "Palette",
      Component: Screen,
    });
  let removeSettings = addSettings();
  // A settings screen has no update handle, and the host renders its title from the registration.
  const unsubscribeLocale = subscribeLocale(() => {
    void removeSettings();
    removeSettings = addSettings();
  });
  const unsubscribe = observeAgents(client.paseo, {
    upsert: (agent) => features.registerAgent(agent),
    remove: (id) => features.unregisterAgent(id),
  });
  return async () => {
    unsubscribeLocale();
    await removeSettings();
    unsubscribe();
    features.cleanup();
  };
}
