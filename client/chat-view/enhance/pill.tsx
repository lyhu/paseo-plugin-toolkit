import { useSyncExternalStore } from "react";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { enhanceState } from "./state";

/** Shows the undo affordance once an enhancement is waiting in the composer. */
export function EnhanceIcon(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : "";
  const enhanced = useSyncExternalStore(enhanceState.subscribe, () =>
    Boolean(enhanceState.snapshot(agentId)),
  );
  return (
    <Icon
      name={enhanced ? "Undo2" : "Sparkles"}
      size={props.size}
      color={enhanced ? props.theme.colors.accent : props.color}
    />
  );
}
