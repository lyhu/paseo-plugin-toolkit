import { useEffect, useRef, useSyncExternalStore } from "react";
import { View } from "react-native";
import type { PaseoAgent } from "@getpaseo/client";
import {
  useSettings,
  type PluginButtonIconProps,
  type PluginButtonRegistration,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useStickyMessage } from "./StickyBar";

import { activitySettings, type ChatViewSettings } from "../../../shared/chat-view/settings";
import { tr } from "../locale";

const disabled = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function toggleSticky(agentId: string) {
  if (disabled.has(agentId)) disabled.delete(agentId);
  else disabled.add(agentId);
  for (const listener of listeners) listener();
}

export function createStickyPill(
  client: PluginClientContext,
  agent: PaseoAgent,
  onSettingsChange: (values: ChatViewSettings) => void,
): PluginButtonRegistration {
  const pillTitle = tr("sticky.pill");
  return client.addComposerPill({
    id: `sticky-${agent.id}`,
    workspaceId: agent.workspaceId ?? "",
    agentId: agent.id,
    button: {
      title: pillTitle,
      label: pillTitle,
      icon: (props) => <StickyIcon {...props} onSettingsChange={onSettingsChange} />,
      behavior: { kind: "action", onPress: () => toggleSticky(agent.id) },
    },
  });
}

export function StickyIcon(
  props: PluginButtonIconProps & { onSettingsChange: (values: ChatViewSettings) => void },
) {
  const settings = useSettings(activitySettings);
  const values = settings.status === "ready" ? settings.values : undefined;
  useEffect(() => {
    if (values) props.onSettingsChange(values);
  }, [values, props.onSettingsChange]);
  const agentId = props.context === "agent" ? props.agentId : "";
  const locallyEnabled = useSyncExternalStore(subscribe, () => !disabled.has(agentId));
  const enabled = values?.stickyEnabled === true && locallyEnabled;
  const anchor = useRef<View>(null);
  useStickyMessage(anchor, agentId, props.theme, enabled);
  return (
    <View ref={anchor}>
      <Icon
        name={enabled ? "Pin" : "PinOff"}
        size={props.size}
        color={enabled ? props.theme.colors.accent : props.color}
      />
    </View>
  );
}
