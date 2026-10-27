import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../i18n";
import type { SettingsScope } from "./types";

interface ScopeBadgeProps {
  scope: SettingsScope;
  theme: PluginSurfaceProps["theme"];
}

const scopeConfig: Record<
  SettingsScope,
  { label: string; bgLight: string; textLight: string }
> = {
  host: {
    label: "Host",
    bgLight: "rgba(59, 130, 246, 0.12)",
    textLight: "#3b82f6",
  },
  device: {
    label: "设备",
    bgLight: "rgba(16, 185, 129, 0.12)",
    textLight: "#10b981",
  },
  workspace: {
    label: "工作区",
    bgLight: "rgba(245, 158, 11, 0.12)",
    textLight: "#f59e0b",
  },
  macos: {
    label: "macOS",
    bgLight: "rgba(107, 114, 128, 0.12)",
    textLight: "#9ca3af",
  },
};

export function ScopeBadge({ scope, theme: _theme }: ScopeBadgeProps) {
  const cfg = scopeConfig[scope];
  const style = useMemo(
    () => ({
      backgroundColor: cfg.bgLight,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255, 255, 255, 0.08)",
      alignSelf: "flex-start" as const,
    }),
    [cfg.bgLight],
  );

  const textStyle = useMemo(
    () => ({
      color: cfg.textLight,
      fontSize: 10,
      fontWeight: "600" as const,
      lineHeight: 14,
    }),
    [cfg.textLight],
  );

  return (
    <View style={style}>
      <Text style={textStyle}>{tr(cfg.label)}</Text>
    </View>
  );
}
