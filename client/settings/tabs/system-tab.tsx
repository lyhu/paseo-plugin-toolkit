import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  applyHighlight,
  readHighlight,
  restoreHighlight,
  editorHighlightSettings,
} from "../../../shared/editor-highlight/contracts";
import type { ChatViewSettings } from "../../../shared/chat-view/settings";
import { tr } from "../../i18n";
import type { z } from "zod";

type HighlightValues = z.infer<typeof editorHighlightSettings.schema>;

interface SystemTabProps {
  theme: PluginSurfaceProps["theme"];
  host: PluginSurfaceProps["host"];
  chatSettings: {
    quickQuestionsEnabled: boolean;
    saving: boolean;
  };
  highlightSettings: {
    automatic: boolean;
    saving: boolean;
  };
  onUpdateChatSettings: (next: Partial<ChatViewSettings>) => void;
  onUpdateHighlightSettings: (next: Partial<HighlightValues>) => void;
}

const statusTextMap: Record<string, string> = {
  unsupported: "当前 Host 不是 macOS，无法修改本机 Paseo 应用。",
  missing: "当前 Host 未找到 /Applications/Paseo.app。",
  ready: "检测到 Paseo 安装包，可应用编辑器高亮补丁。",
  applied: "高亮补丁已应用。请重新加载 Paseo 界面后打开文件。",
  restored: "已恢复原始前端资源。请重新加载 Paseo 界面。",
  error: "高亮补丁操作失败，请检查控制台或日志。",
};

export function SystemTab({
  theme,
  host,
  chatSettings,
  highlightSettings,
  onUpdateChatSettings,
  onUpdateHighlightSettings,
}: SystemTabProps) {
  const read = useRpc(readHighlight);
  const apply = useRpc(applyHighlight);
  const restore = useRpc(restoreHighlight);
  const cache = useQueryClient();
  const queryKey = ["toolkit", "editor-highlight", host.id];
  const query = useQuery({ queryKey, queryFn: () => read({}) });

  const mutation = useMutation({
    mutationFn: (action: "apply" | "restore") => (action === "apply" ? apply({}) : restore({})),
    onSuccess: (state) => cache.setQueryData(queryKey, state),
  });

  const state = query.data;
  const unavailable = state?.status === "unsupported" || state?.status === "missing";
  const busy = mutation.isPending || query.isFetching;

  return (
    <View style={{ gap: 20 }}>
      {/* 快捷提问库 */}
      <SettingsSection title={tr("快捷提问库 (Quick Questions)")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("启用快捷提问浮层与话术库")} [Host]`}
            hint={tr("在输入框提供工作区话术浮层、手动维护常用提问、历史总结推荐。")}
            value={chatSettings.quickQuestionsEnabled}
            disabled={chatSettings.saving}
            onValueChange={(val) => onUpdateChatSettings({ quickQuestionsEnabled: val })}
          />
        </SettingsCard>
      </SettingsSection>

      {/* 编辑器高亮补丁 */}
      <SettingsSection title={tr("macOS 编辑器语法高亮增强")}>
        <SettingsCard>
          <SettingsSwitch
            label={`${tr("加载时自动检测并修补")} [macOS]`}
            hint={tr("补充 .env、TOML、Shell、SQL、Dockerfile 等文件的语法着色。升级 Paseo 后重载 Toolkit 即可自动重新修补。")}
            value={highlightSettings.automatic}
            disabled={highlightSettings.saving || unavailable}
            onValueChange={(val) => onUpdateHighlightSettings({ automatic: val })}
          />
        </SettingsCard>

        {/* 状态指示条 */}
        <View
          style={{
            padding: 12,
            borderRadius: 6,
            backgroundColor: theme.colors.surface1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontWeight: "500", color: theme.colors.foreground }}>
              {tr("环境检测状态")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: state?.status === "applied" ? "#10b981" : theme.colors.foregroundMuted,
              }}
            >
              {state?.status ? tr(statusTextMap[state.status] ?? state.status) : tr("检测中…")}
            </Text>
          </View>

          {/* 操作按键组 */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              disabled={busy || unavailable || state?.status === "applied"}
              onPress={() => mutation.mutate("apply")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor:
                  busy || unavailable || state?.status === "applied"
                    ? theme.colors.surface2
                    : theme.colors.accent ?? "#3b82f6",
                opacity: busy || unavailable || state?.status === "applied" ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                  color:
                    busy || unavailable || state?.status === "applied"
                      ? theme.colors.foregroundMuted
                      : "#ffffff",
                }}
              >
                {mutation.isPending && mutation.variables === "apply"
                  ? tr("正在修补…")
                  : tr("立即应用高亮补丁")}
              </Text>
            </Pressable>

            <Pressable
              disabled={busy || unavailable || !state?.backupPath}
              onPress={() => mutation.mutate("restore")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: theme.colors.surface2,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                opacity: busy || unavailable || !state?.backupPath ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "500", color: theme.colors.foreground }}>
                {mutation.isPending && mutation.variables === "restore"
                  ? tr("正在恢复…")
                  : tr("恢复原始安装包")}
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, lineHeight: 18, marginTop: 4 }}>
          {tr(
            "提示：此补丁直接作用于当前 Host 的 /Applications/Paseo.app；远程 Host 无法修改你本地电脑上的应用。应用后请重新加载 Paseo 界面生效。",
          )}
        </Text>
      </SettingsSection>
    </View>
  );
}
