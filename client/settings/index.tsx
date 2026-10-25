import { useState, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { activitySettings, type ChatViewSettings } from "../../shared/chat-view/settings";
import { projectTreeSettings } from "../../shared/project-tree/contracts";
import { sessionTitleSettings, type TitleSettings } from "../../shared/session-title/contracts";
import { editorHighlightSettings } from "../../shared/editor-highlight/contracts";
import { resolveLocale } from "../../shared/chat-view/i18n";
import { TOOLKIT_VERSION } from "../../shared/version";
import { tr, useLocale } from "../i18n";
import { ThemeProvider } from "../quick-questions/ui";
import { ScopeBadge } from "./scope-badge";
import { SETTINGS_TABS, SettingsNav } from "./nav";
import type { SettingsTabId } from "./types";
import { OverviewTab } from "./tabs/overview-tab";
import { ChatTab } from "./tabs/chat-tab";
import { WorkbenchTab } from "./tabs/workbench-tab";
import { ModelsTab } from "./tabs/models-tab";
import { SmartTab } from "./tabs/smart-tab";
import { SystemTab } from "./tabs/system-tab";
import type { z } from "zod";

type TreeValues = z.infer<typeof projectTreeSettings.schema>;
type HighlightValues = z.infer<typeof editorHighlightSettings.schema>;

interface ToolkitSettingsScreenProps extends PluginSurfaceProps {
  initialTab?: SettingsTabId;
  onSettingsChange?: (values: ChatViewSettings) => void;
}

export function ToolkitSettingsScreen(props: ToolkitSettingsScreenProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(props.initialTab ?? "overview");

  const chat = useSettings(activitySettings);
  const projectTree = useSettings(projectTreeSettings);
  const sessionTitle = useSettings(sessionTitleSettings);
  const editorHighlight = useSettings(editorHighlightSettings);

  const isChatReady = chat.status === "ready";
  const isTreeReady = projectTree.status === "ready";
  const isTitleReady = sessionTitle.status === "ready";
  const isHighlightReady = editorHighlight.status === "ready";

  const locale = resolveLocale(isChatReady ? chat.values.language : "auto");

  // 更新 ChatViewSettings
  const handleUpdateChat = (next: Partial<ChatViewSettings>) => {
    if (!isChatReady) return;
    const merged = { ...chat.values, ...next };
    void chat.save(merged, chat.revision);
    props.onSettingsChange?.(merged);
  };

  // 更新 ProjectTreeSettings
  const handleUpdateTree = (next: Partial<TreeValues>) => {
    if (!isTreeReady) return;
    void projectTree.save({ ...projectTree.values, ...next }, projectTree.revision);
  };

  // 更新 SessionTitleSettings
  const handleUpdateTitle = (next: Partial<TitleSettings>) => {
    if (!isTitleReady) return;
    void sessionTitle.save({ ...sessionTitle.values, ...next }, sessionTitle.revision);
  };

  // 更新 EditorHighlightSettings
  const handleUpdateHighlight = (next: Partial<HighlightValues>) => {
    if (!isHighlightReady) return;
    void editorHighlight.save({ ...editorHighlight.values, ...next }, editorHighlight.revision);
  };

  // 模块启用状态映射
  const moduleStatus = useMemo(
    () => ({
      compact: isChatReady ? chat.values.compactActivityEnabled : false,
      mermaid: isChatReady ? chat.values.mermaidEnabled : false,
      sticky: isChatReady ? chat.values.stickyEnabled : false,
      readonly: isChatReady ? chat.values.readonlyMessagesEnabled : false,
      workbench: isTreeReady ? projectTree.values.enabled : false,
      naming: isTitleReady ? sessionTitle.values.enabled : false,
      models: true, // 共享模型基础设施
      highlight: isHighlightReady ? editorHighlight.values.automatic : false,
    }),
    [
      isChatReady,
      isTreeReady,
      isTitleReady,
      isHighlightReady,
      isChatReady ? chat.values : null,
      isTreeReady ? projectTree.values : null,
      isTitleReady ? sessionTitle.values : null,
      isHighlightReady ? editorHighlight.values : null,
    ],
  );

  const navStatus = useMemo(
    () => ({
      overview: true,
      chat: moduleStatus.compact || moduleStatus.mermaid || moduleStatus.sticky,
      workbench: moduleStatus.workbench,
      models: true,
      smart: moduleStatus.naming || (isChatReady ? chat.values.enhanceEnabled : false),
      system: moduleStatus.highlight || (isChatReady ? chat.values.quickQuestionsEnabled : false),
    }),
    [moduleStatus, isChatReady, isChatReady ? chat.values : null],
  );

  const activeMeta = useMemo(
    () => SETTINGS_TABS.find((t) => t.id === activeTab) ?? SETTINGS_TABS[0]!,
    [activeTab],
  );

  const isCompact = props.layout?.compact ?? false;

  return (
    <ThemeProvider theme={props.theme}>
      <View
        style={{
          flex: 1,
          backgroundColor: props.theme.colors.surface0,
        }}
      >
        {/* 顶部全局信息卡片 */}
        <View
          style={{
            paddingHorizontal: isCompact ? 12 : 16,
            paddingTop: 12,
            paddingBottom: 6,
          }}
        >
          <View
            style={{
              padding: isCompact ? 12 : 14,
              borderRadius: 8,
              backgroundColor: props.theme.colors.surface1,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: props.theme.colors.border,
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: props.theme.colors.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name="Layers"
                    size={18}
                    color={props.theme.colors.accent ?? props.theme.colors.foreground}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: props.theme.colors.foreground,
                    }}
                  >
                    Paseo Toolkit
                  </Text>
                  <Text style={{ fontSize: 12, color: props.theme.colors.foregroundMuted }}>
                    {tr("版本 v{0} · 适用 Paseo 0.13.x", { "0": TOOLKIT_VERSION })}
                  </Text>
                </View>
              </View>
              <ScopeBadge scope="host" theme={props.theme} />
            </View>
            <Text
              style={{
                fontSize: 13,
                color: props.theme.colors.foregroundMuted,
                lineHeight: 18,
              }}
            >
              {tr("当前连接主机：{0}。所有子模块配置均在此统一管理，保障全局体验一致。", {
                "0": props.host.label || props.host.id,
              })}
            </Text>
          </View>
        </View>

        {/* 主体区域：左侧导航 + 右侧设置内容 */}
        <View
          style={{
            flex: 1,
            flexDirection: isCompact ? "column" : "row",
          }}
        >
          <SettingsNav
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            compact={isCompact}
            theme={props.theme}
            moduleStatus={navStatus}
          />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              padding: isCompact ? 14 : 24,
              maxWidth: 880,
              gap: 20,
            }}
          >
            {/* 内容面板标题 */}
            <View style={{ gap: 4, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  color: props.theme.colors.foreground,
                }}
              >
                {tr(activeMeta.labelKey)}
              </Text>
              <Text style={{ fontSize: 13, color: props.theme.colors.foregroundMuted }}>
                {tr(activeMeta.descriptionKey)}
              </Text>
            </View>

            {/* 动态渲染对应 Tab */}
            {activeTab === "overview" ? (
              <OverviewTab
                theme={props.theme}
                host={props.host}
                locale={locale}
                chatSettings={
                  isChatReady
                    ? chat.values
                    : {
                        displayMode: "folded",
                        palette: "vivid",
                        quickQuestionsEnabled: true,
                        mermaidEnabled: false,
                        compactActivityEnabled: false,
                        stickyEnabled: true,
                        readonlyMessagesEnabled: true,
                        enhanceEnabled: false,
                        language: "auto",
                      }
                }
                saving={chat.saving}
                onSaveLanguage={(language) => handleUpdateChat({ language: language as any })}
                onNavigateTab={setActiveTab}
                moduleStatus={moduleStatus}
              />
            ) : null}

            {activeTab === "chat" && isChatReady ? (
              <ChatTab
                theme={props.theme}
                settings={chat.values}
                saving={chat.saving}
                saveError={chat.saveError ?? undefined}
                onUpdate={handleUpdateChat}
              />
            ) : null}

            {activeTab === "workbench" && isTreeReady ? (
              <WorkbenchTab
                theme={props.theme}
                enabled={projectTree.values.enabled}
                viewName={projectTree.values.viewName}
                saving={projectTree.saving}
                saveError={projectTree.saveError}
                onUpdate={handleUpdateTree}
              />
            ) : null}

            {activeTab === "models" ? (
              <ModelsTab theme={props.theme} host={props.host} />
            ) : null}

            {activeTab === "smart" && isTitleReady && isChatReady ? (
              <SmartTab
                theme={props.theme}
                sessionTitle={{
                  enabled: sessionTitle.values.enabled,
                  rounds: sessionTitle.values.rounds,
                  maxLength: sessionTitle.values.maxLength,
                  saving: sessionTitle.saving,
                  saveError: sessionTitle.saveError,
                }}
                chatSettings={{
                  enhanceEnabled: chat.values.enhanceEnabled,
                  saving: chat.saving,
                }}
                onUpdateSessionTitle={handleUpdateTitle}
                onUpdateChatSettings={handleUpdateChat}
                onNavigateTab={setActiveTab}
              />
            ) : null}

            {activeTab === "system" && isChatReady && isHighlightReady ? (
              <SystemTab
                theme={props.theme}
                host={props.host}
                chatSettings={{
                  quickQuestionsEnabled: chat.values.quickQuestionsEnabled,
                  saving: chat.saving,
                }}
                highlightSettings={{
                  automatic: editorHighlight.values.automatic,
                  saving: editorHighlight.saving,
                }}
                onUpdateChatSettings={handleUpdateChat}
                onUpdateHighlightSettings={handleUpdateHighlight}
              />
            ) : null}
          </ScrollView>
        </View>

        {/* 底部统一步伐与版本说明：固定在页面最底部 */}
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: props.theme.colors.border,
            paddingVertical: 10,
            paddingHorizontal: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: props.theme.colors.surface0,
          }}
        >
          <Text style={{ fontSize: 12, color: props.theme.colors.foregroundMuted }}>
            {tr("Toolkit 版本 v{0} · 全局统一配置控制台", { "0": TOOLKIT_VERSION })}
          </Text>
        </View>
      </View>
    </ThemeProvider>
  );
}
