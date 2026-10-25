import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../i18n";
import type { SettingsTabId, SettingsTabMeta } from "./types";

export const SETTINGS_TABS: readonly SettingsTabMeta[] = [
  {
    id: "overview",
    labelKey: "概览与主控",
    iconName: "LayoutDashboard",
    descriptionKey: "插件概览、子模块健康度与语言偏好",
  },
  {
    id: "chat",
    labelKey: "对话交互",
    iconName: "MessageSquare",
    descriptionKey: "紧凑活动、Mermaid、吸顶提问、只读保护",
  },
  {
    id: "workbench",
    labelKey: "工作台",
    iconName: "FolderGit2",
    descriptionKey: "项目多主机管理、分组视图与别名",
  },
  {
    id: "models",
    labelKey: "AI 与模型",
    iconName: "Bot",
    descriptionKey: "Host 级默认共享模型与工作区覆盖",
  },
  {
    id: "smart",
    labelKey: "智能辅助",
    iconName: "Sparkles",
    descriptionKey: "会话智能命名与提示词增强",
  },
  {
    id: "system",
    labelKey: "系统与环境",
    iconName: "Cpu",
    descriptionKey: "编辑器高亮补丁与快捷提问库",
  },
];

interface SettingsNavProps {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  compact: boolean;
  theme: PluginSurfaceProps["theme"];
  moduleStatus?: Record<SettingsTabId, boolean>;
}

export function SettingsNav({
  activeTab,
  onSelectTab,
  compact,
  theme,
  moduleStatus,
}: SettingsNavProps) {
  if (compact) {
    return (
      <View
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => onSelectTab(tab.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: isActive
                    ? theme.colors.surface2
                    : "transparent",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: isActive
                    ? theme.colors.border
                    : "transparent",
                }}
              >
                <Icon
                  name={tab.iconName}
                  size={14}
                  color={
                    isActive
                      ? theme.colors.accent ?? theme.colors.foreground
                      : theme.colors.foregroundMuted
                  }
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? "600" : "400",
                    color: isActive
                      ? theme.colors.foreground
                      : theme.colors.foregroundMuted,
                  }}
                >
                  {tr(tab.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={{
        width: 160,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.border,
        paddingVertical: 12,
        paddingHorizontal: 8,
        gap: 4,
      }}
    >
      <View style={{ paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: theme.colors.foregroundMuted,
          }}
        >
          {tr("功能设置导航")}
        </Text>
      </View>
      {SETTINGS_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const isEnabled = moduleStatus ? moduleStatus[tab.id] : undefined;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelectTab(tab.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 6,
              backgroundColor: isActive
                ? theme.colors.surface2
                : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Icon
                name={tab.iconName}
                size={16}
                color={
                  isActive
                    ? theme.colors.accent ?? theme.colors.foreground
                    : theme.colors.foregroundMuted
                }
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? "600" : "400",
                  color: isActive
                    ? theme.colors.foreground
                    : theme.colors.foregroundMuted,
                }}
              >
                {tr(tab.labelKey)}
              </Text>
            </View>
            {isEnabled !== undefined ? (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isEnabled
                    ? theme.colors.statusSuccess ?? "#10b981"
                    : theme.colors.foregroundMuted,
                  opacity: isEnabled ? 1 : 0.4,
                  marginLeft: 6,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
