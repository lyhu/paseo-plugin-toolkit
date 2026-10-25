import type { PluginClientContext } from "@getpaseo/plugin/client";
import { tr } from "../i18n";
import { subscribeLocale } from "../chat-view/locale";
import { EditorHighlightSettings } from "./settings";

export function registerEditorHighlight(client: PluginClientContext) {
  const register = () =>
    client.addSettingsScreen({
      id: "editor-highlight",
      title: tr("编辑器高亮"),
      icon: "CodeXml",
      Component: EditorHighlightSettings,
    });
  let remove = register();
  const unsubscribe = subscribeLocale(() => {
    void remove();
    remove = register();
  });
  return async () => {
    unsubscribe();
    await remove();
  };
}
