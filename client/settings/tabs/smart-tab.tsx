import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../../i18n";
import type { TitleSettings } from "../../../shared/session-title/contracts";
import type { ChatViewSettings } from "../../../shared/chat-view/settings";
import type { SettingsTabId } from "../types";

interface SmartTabProps {
  theme: PluginSurfaceProps["theme"];
  sessionTitle: {
    enabled: boolean;
    rounds: number;
    maxLength: number;
    saving: boolean;
    saveError?: string | null;
  };
  chatSettings: {
    enhanceEnabled: boolean;
    saving: boolean;
  };
  onUpdateSessionTitle: (next: Partial<TitleSettings>) => void;
  onUpdateChatSettings: (next: Partial<ChatViewSettings>) => void;
  onNavigateTab: (tab: SettingsTabId) => void;
}

function NumberField({
  label,
  value,
  max,
  disabled,
  theme,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  theme: PluginSurfaceProps["theme"];
  hint?: string;
  onChange: (val: number) => void;
}) {
  const draft = useRef(String(value));

  const commit = () => {
    const parsed = parseInt(draft.current, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= max) {
      if (parsed !== value) onChange(parsed);
    } else {
      draft.current = String(value);
    }
  };

  return (
    <SettingsRow label={label} hint={hint}>
      <View style={{ width: 100 }}>
        <TextInput
          defaultValue={String(value)}
          editable={!disabled}
          keyboardType="numeric"
          onChangeText={(txt) => {
            draft.current = txt;
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          style={{
            color: theme.colors.foreground,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 14,
            textAlign: "center",
            backgroundColor: disabled ? theme.colors.surface2 : "transparent",
            opacity: disabled ? 0.6 : 1,
          }}
        />
      </View>
    </SettingsRow>
  );
}

export function SmartTab({
  theme,
  sessionTitle,
  chatSettings,
  onUpdateSessionTitle,
  onUpdateChatSettings,
  onNavigateTab,
}: SmartTabProps) {
  return (
    <View style={{ gap: 20 }}>
      {/* 会话智能命名 */}
      <SettingsSection title={tr("会话智能命名")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("自动命名业务会话")} [Host]`}
            hint={tr("仅对能够确认轮次的新会话生效；人工重命名后自动停止覆盖。")}
            value={sessionTitle.enabled}
            disabled={sessionTitle.saving}
            onValueChange={(val) => onUpdateSessionTitle({ enabled: val })}
          />

          <NumberField
            label={tr("自动判断轮数（1–20）")}
            hint={tr("在前几轮会话中逐步总结提炼标题。")}
            value={sessionTitle.rounds}
            max={20}
            disabled={sessionTitle.saving || !sessionTitle.enabled}
            theme={theme}
            onChange={(rounds) => onUpdateSessionTitle({ rounds })}
          />

          <NumberField
            label={tr("标题最大字符数（1–100）")}
            hint={tr("自动生成标题的最大字符限制。")}
            value={sessionTitle.maxLength}
            max={100}
            disabled={sessionTitle.saving || !sessionTitle.enabled}
            theme={theme}
            onChange={(maxLength) => onUpdateSessionTitle({ maxLength })}
          />
        </SettingsCard>

        {sessionTitle.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13, marginTop: 4 }}>
            {sessionTitle.saveError}
          </Text>
        ) : null}

        {/* 模型依赖关联卡片 */}
        <Pressable
          onPress={() => onNavigateTab("models")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 12,
            borderRadius: 6,
            backgroundColor: theme.colors.surface1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            marginTop: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <Icon name="Bot" size={16} color={theme.colors.foregroundMuted} />
            <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>
              {tr("智能命名复用 Toolkit 模型服务，若需更换请前往配置")}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "500", color: theme.colors.accent ?? theme.colors.foreground }}>
              {tr("AI 模型配置")}
            </Text>
            <Icon name="ArrowRight" size={14} color={theme.colors.accent ?? theme.colors.foreground} />
          </View>
        </Pressable>
      </SettingsSection>

      {/* 提示词增强 */}
      <SettingsSection title={tr("提示词增强 (Prompt Enhance)")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("启用输入框提示词增强")} [Host]`}
            hint={tr("在输入框提供增强按钮，结合当前项目上下文扩展简短草稿。")}
            value={chatSettings.enhanceEnabled}
            disabled={chatSettings.saving}
            onValueChange={(val) => onUpdateChatSettings({ enhanceEnabled: val })}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
