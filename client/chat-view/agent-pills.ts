import type { PaseoAgent } from "@getpaseo/client";
import type { PluginButtonRegistration } from "@getpaseo/plugin/client";

function isLive(agent: PaseoAgent): boolean {
  return !agent.archivedAt && Boolean(agent.workspaceId);
}

/**
 * Per-agent composer pills. A domain's switch is one boolean, but a composer pill exists per
 * conversation, so the pills cannot be described by a single attach/detach pair. This tracks the
 * agents the domain was told about and keeps one pill per live agent while the switch is on.
 */
export function createAgentPills(build: (agent: PaseoAgent) => PluginButtonRegistration) {
  const agents = new Map<string, PaseoAgent>();
  const pills = new Map<string, PluginButtonRegistration>();
  let enabled = false;
  function sync(agent: PaseoAgent) {
    if (!enabled || !isLive(agent)) {
      pills.get(agent.id)?.remove();
      pills.delete(agent.id);
      return;
    }
    if (!pills.has(agent.id)) pills.set(agent.id, build(agent));
  }
  return {
    setEnabled(next: boolean) {
      if (next === enabled) return;
      enabled = next;
      for (const agent of agents.values()) sync(agent);
    },
    registerAgent(agent: PaseoAgent) {
      const previous = agents.get(agent.id);
      if (previous?.workspaceId !== agent.workspaceId) {
        pills.get(agent.id)?.remove();
        pills.delete(agent.id);
      }
      agents.set(agent.id, agent);
      sync(agent);
    },
    unregisterAgent(agentId: string) {
      agents.delete(agentId);
      pills.get(agentId)?.remove();
      pills.delete(agentId);
    },
    /** Rebuild every pill, for contributions whose text depends on something that just changed. */
    refresh() {
      for (const pill of pills.values()) pill.remove();
      pills.clear();
      for (const agent of agents.values()) sync(agent);
    },
    /** Live agents in registration order; a DOM-injected button has no agent context of its own. */
    liveAgents(): PaseoAgent[] {
      return [...agents.values()].filter(isLive);
    },
    dispose() {
      for (const pill of pills.values()) pill.remove();
      pills.clear();
      agents.clear();
    },
  };
}
