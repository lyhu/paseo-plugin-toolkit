import { StyleSheet, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsSection } from "@getpaseo/plugin/client/ui";
import { ModelConfiguration } from "../../models/settings";
import { tr } from "../../i18n";
import { ScopeBadge } from "../scope-badge";
import { ThemeProvider } from "../../quick-questions/ui";

interface ModelsTabProps {
  theme: PluginSurfaceProps["theme"];
  host: PluginSurfaceProps["host"];
}

export function ModelsTab({ theme, host }: ModelsTabProps) {
  return (
    <ThemeProvider theme={theme}>
      <View style={{ gap: 20 }}>
        <SettingsSection title={tr("AI 共享模型服务")}>
          <View
            style={{
              padding: 14,
              borderRadius: 6,
              backgroundColor: theme.colors.surface1,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
              gap: 6,
              marginBottom: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: theme.colors.foreground }}>
                {tr("Host 默认模型与工作区覆盖")}
              </Text>
              <ScopeBadge scope="workspace" theme={theme} />
            </View>
            <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted, lineHeight: 18 }}>
              {tr(
                "会话智能命名和提示词增强共用此模型配置。支持 OpenAI、Claude 以及兼容端点。可为主机设置默认配置，并允许特定工作区单独覆盖。",
              )}
            </Text>
          </View>

          <ModelConfiguration hostId={host.id} />
        </SettingsSection>
      </View>
    </ThemeProvider>
  );
}
