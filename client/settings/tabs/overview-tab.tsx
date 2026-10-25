import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../../i18n";
import {
  languageModeSchema,
  type ChatViewSettings,
} from "../../../shared/chat-view/settings";
import type { SupportedLocale } from "../../../shared/chat-view/i18n";
import { ScopeBadge } from "../scope-badge";
import type { SettingsTabId } from "../types";

interface OverviewTabProps {
  theme: PluginSurfaceProps["theme"];
  host: PluginSurfaceProps["host"];
  locale: SupportedLocale;
  chatSettings: ChatViewSettings;
  saving: boolean;
  onSaveLanguage: (lang: string) => void;
  onNavigateTab: (tab: SettingsTabId) => void;
  moduleStatus: {
    compact: boolean;
    mermaid: boolean;
    sticky: boolean;
    readonly: boolean;
    workbench: boolean;
    naming: boolean;
    models: boolean;
    highlight: boolean;
  };
}

const languageChoices: readonly { value: string; labelKey: string }[] = [
  { value: "auto", labelKey: "跟随客户端语言" },
  { value: "zh-CN", labelKey: "简体中文" },
  { value: "en-US", labelKey: "English" },
];

export function OverviewTab({
  theme,
  host: _host,
  locale: _locale,
  chatSettings,
  saving,
  onSaveLanguage,
  onNavigateTab,
  moduleStatus,
}: OverviewTabProps) {
  const cards = useMemo(
    () => [
      {
        tabId: "chat" as SettingsTabId,
        title: "紧凑活动",
        enabled: moduleStatus.compact,
        desc: "折叠推理与工具调用，提升阅读流畅度",
        scope: "host" as const,
      },
      {
        tabId: "chat" as SettingsTabId,
        title: "Mermaid 图表",
        enabled: moduleStatus.mermaid,
        desc: "在回答中渲染交互式流程图与序列图",
        scope: "host" as const,
      },
      {
        tabId: "chat" as SettingsTabId,
        title: "吸顶提问",
        enabled: moduleStatus.sticky,
        desc: "在长对话滚动时保留用户问题上下文",
        scope: "host" as const,
      },
      {
        tabId: "workbench" as SettingsTabId,
        title: "跨 Host 工作台",
        enabled: moduleStatus.workbench,
        desc: "统一项目树、多主机资源总览与场景切换",
        scope: "host" as const,
      },
      {
        tabId: "smart" as SettingsTabId,
        title: "会话智能命名",
        enabled: moduleStatus.naming,
        desc: "前几轮对话自动提炼简练业务标题",
        scope: "host" as const,
      },
      {
        tabId: "models" as SettingsTabId,
        title: "AI 共享模型",
        enabled: moduleStatus.models,
        desc: "共用主机模型配置，提供总结与增强能力",
        scope: "workspace" as const,
      },
      {
        tabId: "system" as SettingsTabId,
        title: "编辑器高亮补丁",
        enabled: moduleStatus.highlight,
        desc: "扩展 Paseo 本地应用的语法着色能力",
        scope: "macos" as const,
      },
    ],
    [moduleStatus],
  );

  return (
    <View style={{ gap: 20 }}>
      {/* 语言设置 */}
      <SettingsSection title={tr("界面语言与多语言")}>
        <SettingsCard>
          <SettingsSelect
            label={tr("Toolkit 语言偏好")}
            hint={tr("选择 Toolkit 界面显示语言，也可跟随 Paseo 客户端默认设置。")}
            value={chatSettings.language}
            options={languageChoices.map((c) => ({ value: c.value, label: tr(c.labelKey) }))}
            disabled={saving}
            onValueChange={(val) => {
              const parsed = languageModeSchema.safeParse(val);
              if (parsed.success) onSaveLanguage(parsed.data);
            }}
          />
        </SettingsCard>
      </SettingsSection>

      {/* 功能状态矩阵 */}
      <SettingsSection title={tr("功能模块状态一览")}>
        <View style={{ gap: 10 }}>
          {cards.map((item, idx) => (
            <Pressable
              key={idx}
              onPress={() => onNavigateTab(item.tabId)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                borderRadius: 6,
                backgroundColor: theme.colors.surface1,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ gap: 4, flex: 1, paddingRight: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: theme.colors.foreground }}>
                    {tr(item.title)}
                  </Text>
                  <ScopeBadge scope={item.scope} theme={theme} />
                </View>
                <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
                  {tr(item.desc)}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 12,
                    backgroundColor: item.enabled
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(156, 163, 175, 0.12)",
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: item.enabled ? "#10b981" : "#9ca3af",
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "500",
                      color: item.enabled ? "#10b981" : "#9ca3af",
                    }}
                  >
                    {tr(item.enabled ? "已启用" : "已停用")}
                  </Text>
                </View>
                <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
              </View>
            </Pressable>
          ))}
        </View>
      </SettingsSection>
    </View>
  );
}
