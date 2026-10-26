import { tr } from "./client/i18n";
import { subscribeLocale } from "./client/chat-view/locale";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { registerQuickQuestions } from "./client/quick-questions/register";
import { registerChatView } from "./client/chat-view/register";
import { ModelsScreen } from "./client/models/settings";
import { registerProjectTree } from "./client/project-tree/register";
import { registerSessionTitle } from "./client/session-title/register";
export default function contribute(client: PluginClientContext) {
  const removeProjectTree = registerProjectTree(client);
  const addModels = () =>
    client.addSettingsScreen({
      id: "models",
      title: tr("Toolkit 模型"),
      icon: "Bot",
      Component: ModelsScreen,
    });
  let removeModels = addModels();
  const unsubscribeLocale = subscribeLocale(() => {
    void removeModels();
    removeModels = addModels();
  });
  const questions = registerQuickQuestions(client);
  const removeChat = registerChatView(client, (values) =>
    questions.setEnabled(values.quickQuestionsEnabled),
  );
  const removeTitles = registerSessionTitle(client);
  return async () => {
    await removeTitles();
    await removeProjectTree();
    unsubscribeLocale();
    await questions.dispose();
    await removeChat();
    await removeModels();
  };
}
