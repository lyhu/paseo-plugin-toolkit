import { tr } from "../i18n";
import type { PaseoAgent } from "@getpaseo/client";
import type {
  PluginButtonContentProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { subscribeLocale } from "../chat-view/locale";
import { QuickQuestionsPanel } from "./panel";
import { QuickQuestionsPopover } from "./popover";

export function registerQuickQuestions(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const agents = new Map<string, PaseoAgent>();
  let enabled = false;
  let stopped = false;
  let generation = 0;
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
  const listing = client.paseo.agents.list({ page: { limit: 200 }, subscribe: {} });
  void listing
    .then((result) => {
      if (stopped) return result.subscription.release();
      result.subscription.subscribe({
        snapshot(snapshot) {
          generation += 1;
          const current = generation;
          agents.clear();
          for (const id of pills.keys()) remove(id);
          for (const entry of snapshot.entries) register(entry.agent);
          async function remaining() {
            let cursor = snapshot.pageInfo.nextCursor;
            while (cursor && !stopped && generation === current) {
              const page = await client.paseo.agents.list({ page: { limit: 200, cursor } });
              if (stopped || generation !== current) return;
              for (const entry of page.entries) register(entry.agent);
              cursor = page.pageInfo.nextCursor;
            }
          }
          void remaining().catch((error: unknown) =>
            console.error("[Toolkit] Agent directory failed", error),
          );
        },
        update(message) {
          if (message.type !== "agent_update") return;
          if (message.payload.kind === "upsert") register(message.payload.agent);
          else {
            agents.delete(message.payload.agentId);
            remove(message.payload.agentId);
          }
        },
        error(error) {
          console.error("[Toolkit] Agent observation failed", error);
        },
      });
    })
    .catch((error: unknown) => console.error("[Toolkit] Agent observation failed", error));
  async function dispose() {
    unsubscribeLocale();
    stopped = true;
    generation += 1;
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
    agents.clear();
    await removePanel();
    await removeCommand();
    await listing.then((result) => result.subscription.release()).catch(() => {});
  }
  return {
    setEnabled(next: boolean) {
      if (stopped || next === enabled) return;
      enabled = next;
      for (const agent of agents.values()) register(agent);
    },
    dispose,
  };
}
