import { useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { tr } from "../../i18n";
import {
  DEFAULT_PROJECT_TREE_VIEW_NAME,
  projectTreeViewName,
  projectTreeSettings,
} from "../../../shared/project-tree/contracts";
import type { z } from "zod";

type TreeValues = z.infer<typeof projectTreeSettings.schema>;

interface WorkbenchTabProps {
  theme: PluginSurfaceProps["theme"];
  enabled: boolean;
  viewName: string;
  saving: boolean;
  saveError?: string | null;
  onUpdate: (next: Partial<TreeValues>) => void;
}

export function WorkbenchTab({
  theme,
  enabled,
  viewName,
  saving,
  saveError,
  onUpdate,
}: WorkbenchTabProps) {
  const draft = useRef(viewName);

  const commit = () => {
    const next = projectTreeViewName(draft.current);
    draft.current = next;
    if (next !== viewName) onUpdate({ viewName: next });
  };

  return (
    <View style={{ gap: 20 }}>
      <SettingsSection title={tr("跨 Host 工作台总控")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("启用工作台视图")} [Host]`}
            hint={tr("提供跨 Host 工作台视图、多主机资源总览、技能与记忆知行空间。")}
            value={enabled}
            disabled={saving}
            onValueChange={(val) => onUpdate({ enabled: val })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={tr("工作台视图外观与命名")}>
        <SettingsCard>
          <SettingsRow
            label={`${tr("左侧导航视图名称")} [设备]`}
            hint={tr("左侧导航树显示的视图标题名称（留空恢复默认）。")}
          >
            <View style={{ gap: 6, width: "100%", maxWidth: 280 }}>
              <TextInput
                defaultValue={viewName}
                editable={!saving && enabled}
                maxLength={40}
                placeholder={DEFAULT_PROJECT_TREE_VIEW_NAME}
                placeholderTextColor={theme.colors.foregroundMuted}
                onChangeText={(text) => {
                  draft.current = text;
                }}
                onBlur={commit}
                onSubmitEditing={commit}
                style={{
                  color: theme.colors.foreground,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 14,
                  backgroundColor: enabled ? "transparent" : theme.colors.surface2,
                  opacity: enabled ? 1 : 0.6,
                }}
              />
            </View>
          </SettingsRow>
        </SettingsCard>

        {saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13, marginTop: 4 }}>
            {saveError}
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection title={tr("使用说明")}>
        <View
          style={{
            padding: 14,
            borderRadius: 6,
            backgroundColor: theme.colors.surface1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted, lineHeight: 20 }}>
            {tr(
              "• 建议仅在长期在线的稳定配置 Host 开启工作台，由其统筹保存分组排序与展示偏好。\n• 左侧导航支持通过「工作台视图｜原生视图」按键直接切换，点击工作区保留原生 Agent 与终端标签。\n• 视图选择跟随当前设备独立保存，分组内容在配置 Host 统一同步。",
            )}
          </Text>
        </View>
      </SettingsSection>
    </View>
  );
}
