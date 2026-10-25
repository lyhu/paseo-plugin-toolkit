import { useMemo } from "react";
import { Text, View } from "react-native";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../../i18n";
import {
  displayModeSchema,
  paletteModeSchema,
  type ChatViewSettings,
} from "../../../shared/chat-view/settings";

interface ChatTabProps {
  theme: PluginSurfaceProps["theme"];
  settings: ChatViewSettings;
  saving: boolean;
  saveError?: string;
  onUpdate: (next: Partial<ChatViewSettings>) => void;
}

const displayModeChoices = [
  { value: "folded", label: "折叠" },
  { value: "detailed", label: "展开" },
];

const paletteChoices = [
  { value: "vivid", label: "鲜艳" },
  { value: "soft", label: "柔和" },
  { value: "high_contrast", label: "高对比度" },
];

export function ChatTab({
  theme,
  settings,
  saving,
  saveError,
  onUpdate,
}: ChatTabProps) {
  const descriptionStyle = useMemo(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }),
    [theme.colors.foregroundMuted],
  );

  return (
    <View style={{ gap: 20 }}>
      {/* 紧凑活动卡片 */}
      <SettingsSection title={tr("紧凑推理与活动记录")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("紧凑活动总开关")} [Host]`}
            hint={tr("将推理过程和工具调用归并为可展开的紧凑记录，减少滚动篇幅。")}
            value={settings.compactActivityEnabled}
            disabled={saving}
            onValueChange={(val) => onUpdate({ compactActivityEnabled: val })}
          />

          <SettingsSelect
            label={tr("活动展示模式")}
            hint={tr("默认将推理与工具折叠或展开显示。")}
            value={settings.displayMode}
            options={displayModeChoices.map((c) => ({ value: c.value, label: tr(c.label) }))}
            disabled={saving || !settings.compactActivityEnabled}
            onValueChange={(val) => {
              const parsed = displayModeSchema.safeParse(val);
              if (parsed.success) onUpdate({ displayMode: parsed.data });
            }}
          />

          <SettingsSelect
            label={tr("配色方案")}
            hint={tr("活动记录边框与状态指示的主题色系。")}
            value={settings.palette}
            options={paletteChoices.map((c) => ({ value: c.value, label: tr(c.label) }))}
            disabled={saving || !settings.compactActivityEnabled}
            onValueChange={(val) => {
              const parsed = paletteModeSchema.safeParse(val);
              if (parsed.success) onUpdate({ palette: parsed.data });
            }}
          />
        </SettingsCard>
        <SettingsRow label={tr("推荐设置")}>
          <Text style={descriptionStyle}>
            {tr(
              "使用紧凑活动时，建议在 Paseo 设置中将工具调用详情设为“详细 (Detailed)”。Overview 模式会在插件收到数据前归并内容，导致细节无法恢复。",
            )}
          </Text>
        </SettingsRow>
      </SettingsSection>

      {/* 对话渲染增强 */}
      <SettingsSection title={tr("对话渲染与交互增强")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("Mermaid 交互图表")} [Host]`}
            hint={tr("在助手回答中自动检测并渲染流程图、时序图等，支持缩放和平移。")}
            value={settings.mermaidEnabled}
            disabled={saving}
            onValueChange={(val) => onUpdate({ mermaidEnabled: val })}
          />

          <SettingsSwitch
            label={`${tr("吸顶提问 (Sticky Questions)")} [Host]`}
            hint={tr("在长会话向上滚动时，将当前回答对应的用户提问固定在视口顶部。")}
            value={settings.stickyEnabled}
            disabled={saving}
            onValueChange={(val) => onUpdate({ stickyEnabled: val })}
          />

          <SettingsSwitch
            label={`${tr("只读消息保护")} [Host]`}
            hint={tr("在网页界面隐藏已发送消息的撤回/编辑操作，防止误触破坏会话历史。")}
            value={settings.readonlyMessagesEnabled}
            disabled={saving}
            onValueChange={(val) => onUpdate({ readonlyMessagesEnabled: val })}
          />
        </SettingsCard>

        {saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13, marginTop: 4 }}>
            {saveError}
          </Text>
        ) : null}
      </SettingsSection>
    </View>
  );
}
