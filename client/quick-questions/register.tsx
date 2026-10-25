import { Platform } from "react-native";
import { tr } from "../i18n";
import type { PluginButtonContentProps, PluginClientContext } from "@getpaseo/plugin/client";
import { subscribeLocale } from "../chat-view/locale";
import { observeAgents } from "../agent-directory";
import { createAgentPills } from "../chat-view/agent-pills";
import { createDraftPill } from "./draft-pill";
import { QuickQuestionsPanel } from "./panel";
import { QuickQuestionsPopover } from "./popover";

export function registerQuickQuestions(client: PluginClientContext) {
  const draftPill = Platform.OS === "web" ? createDraftPill(client) : null;
  let enabled = false;
  let stopped = false;
  let unobserve: (() => void) | undefined;
  const addPanel = () =>
    client.addWorkspacePanel({
      id: "quick-questions",
      title: tr("快捷提问"),
      icon: "MessageSquareText",
      context: "workspace",
      Component: QuickQuestionsPanel,
    });
  const addCommand = () =>
    client.addCommandCenterItem({
      id: "quick-questions",
      title: tr("维护快捷提问"),
      icon: "MessageSquareText",
      context: "workspace",
      onSelect: ({ openPanel }) => openPanel("quick-questions"),
    });
  let removePanel = addPanel();
  let removeCommand = addCommand();
  const unsubscribeLocale = subscribeLocale(() => {
    void removePanel();
    void removeCommand();
    removePanel = addPanel();
    removeCommand = addCommand();
    pills.update({ title: tr("快捷提问"), label: tr("快捷提问") });
  });
  const Content = (props: PluginButtonContentProps) => (
    <QuickQuestionsPopover
      {...props}
      openMaintenance={() => {
        props.close();
        client.openPanel("quick-questions", { workspaceId: props.workspaceId });
      }}
    />
  );
  const pills = createAgentPills((agent) =>
    client.addComposerPill({
      id: `quick-questions-${agent.id}`,
      workspaceId: agent.workspaceId!,
      agentId: agent.id,
      button: {
        title: tr("快捷提问"),
        label: tr("快捷提问"),
        icon: "MessageSquareText",
        behavior: { kind: "popover", Content },
      },
    }),
  );
  async function dispose() {
    unsubscribeLocale();
    stopped = true;
    unobserve?.();
    unobserve = undefined;
    draftPill?.dispose();
    pills.dispose();
    await removePanel();
    await removeCommand();
  }
  return {
    setEnabled(next: boolean) {
      if (stopped || next === enabled) return;
      enabled = next;
      draftPill?.setEnabled(next);
      pills.setEnabled(next);
      if (next) {
        unobserve = observeAgents(client.paseo, {
          upsert: pills.registerAgent,
          remove: pills.unregisterAgent,
        });
      } else {
        unobserve?.();
        unobserve = undefined;
        pills.dispose();
      }
    },
    dispose,
  };
}
