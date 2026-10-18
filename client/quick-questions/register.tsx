import { Platform } from "react-native";
import { tr } from "../i18n";
import type { PaseoAgent } from "@getpaseo/client";
import type {
  PluginButtonContentProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { subscribeLocale } from "../chat-view/locale";
import { observeAgents } from "../agent-directory";
import { createDraftPill } from "./draft-pill";
import { QuickQuestionsPanel } from "./panel";
import { QuickQuestionsPopover } from "./popover";

export function registerQuickQuestions(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const agents = new Map<string, PaseoAgent>();
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
    for (const { registration } of pills.values())
      registration.update({ title: tr("快捷提问"), label: tr("快捷提问") });
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
  function remove(agentId: string) {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  }
  function register(agent: PaseoAgent) {
    if (stopped) return;
    agents.set(agent.id, agent);
    if (!enabled || !agent.workspaceId || agent.archivedAt) {
      remove(agent.id);
      return;
    }
    if (pills.get(agent.id)?.workspaceId === agent.workspaceId) return;
    remove(agent.id);
    const registration = client.addComposerPill({
      id: `quick-questions-${agent.id}`,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: tr("快捷提问"),
        label: tr("快捷提问"),
        icon: "MessageSquareText",
        behavior: { kind: "popover", Content },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration });
  }
  async function dispose() {
    unsubscribeLocale();
    stopped = true;
    unobserve?.();
    unobserve = undefined;
    draftPill?.dispose();
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
    agents.clear();
    await removePanel();
    await removeCommand();
  }
  return {
    setEnabled(next: boolean) {
      if (stopped || next === enabled) return;
      enabled = next;
      draftPill?.setEnabled(next);
      if (next) {
        unobserve = observeAgents(client.paseo, {
          upsert: register,
          remove(id) {
            agents.delete(id);
            remove(id);
          },
        });
      } else {
        unobserve?.();
        unobserve = undefined;
        for (const id of pills.keys()) remove(id);
        agents.clear();
      }
    },
    dispose,
  };
}
