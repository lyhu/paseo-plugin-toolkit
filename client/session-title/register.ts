import type { PluginClientContext } from "@getpaseo/plugin/client";
import { resumeTitles, startTitle } from "../../shared/session-title/contracts";
import { tr } from "../i18n";
import { subscribeLocale } from "../chat-view/locale";
import { SessionTitlePanel } from "./panel";
import { SessionTitleSettings } from "./settings";
import { registerTitlePills } from "./pills";

export function registerSessionTitle(client: PluginClientContext) {
  const pills = registerTitlePills(client);
  void client
    .rpc(resumeTitles, {})
    .catch(() => console.error("[Toolkit] Naming recovery could not reach this host"));
  const register = () => [
    client.addSettingsScreen({
      id: "session-title",
      title: tr("会话智能命名"),
      icon: "TextCursorInput",
      Component: SessionTitleSettings,
    }),
    client.addWorkspacePanel({
      id: "session-title",
      title: tr("会话列表"),
      icon: "MessagesSquare",
      context: "workspace",
      locations: ["explorer"],
      Component: SessionTitlePanel,
    }),
    client.addSlashCommand({
      name: "session-title",
      description: tr("后台全量总结并自动设置会话标题"),
      argumentHint: "",
      context: "agent",
      async onSubmit({ args, agent, rpc }) {
        if (args) throw new Error(tr("用法：/session-title（无需参数）"));
        try {
          await rpc(startTitle, { agentId: agent.id });
        } catch {
          console.error("[Toolkit] Session title request could not reach this host");
        }
      },
    }),
    client.addCommandCenterItem({
      id: "session-title",
      title: tr("会话列表"),
      icon: "MessagesSquare",
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel("session-title", { location: "explorer" });
      },
    }),
  ];
  let removals = register();
  const unsubscribe = subscribeLocale(() => {
    pills.refresh();
    for (const remove of removals) void remove();
    removals = register();
  });
  return async () => {
    unsubscribe();
    pills.dispose();
    for (const remove of removals) await remove();
  };
}
