import { tr } from "./client/i18n";
import { subscribeLocale } from "./client/chat-view/locale";
import type { PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { registerQuickQuestions } from "./client/quick-questions/register";
import { registerChatView } from "./client/chat-view/register";
import { registerProjectTree } from "./client/project-tree/register";
import { registerSessionTitle } from "./client/session-title/register";
import { registerEditorHighlight } from "./client/editor-highlight/register";
import { ToolkitSettingsScreen } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  const removeProjectTree = registerProjectTree(client);
  const questions = registerQuickQuestions(client);
  const chat = registerChatView(client, (values) =>
    questions.setEnabled(values.quickQuestionsEnabled),
  );

  const SettingsComponent = (props: PluginSurfaceProps) => (
    <ToolkitSettingsScreen {...props} onSettingsChange={chat.apply} />
  );

  const addSettings = () =>
    client.addSettingsScreen({
      id: "toolkit-settings",
      title: tr("Toolkit 设置"),
      icon: "Settings",
      Component: SettingsComponent,
    });

  let removeSettings = addSettings();
  const unsubscribeLocale = subscribeLocale(() => {
    void removeSettings();
    removeSettings = addSettings();
  });

  const removeTitles = registerSessionTitle(client);
  const removeHighlight = registerEditorHighlight(client);

  return async () => {
    await removeHighlight();
    await removeTitles();
    unsubscribeLocale();
    await removeSettings();
    await removeProjectTree();
    await questions.dispose();
    await chat.dispose();
  };
}
