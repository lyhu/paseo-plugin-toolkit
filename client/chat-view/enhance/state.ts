/**
 * Cross-component state for the enhance flow: which agents are busy, and the original text each
 * agent's composer held before enhancement. Module-level on purpose — the composer button lives
 * in the DOM while the pill lives in React, and they must observe the same snapshot.
 */
export interface EnhanceSnapshot {
  original: string;
  enhanced: string;
  at: number;
}

const snapshots = new Map<string, EnhanceSnapshot>();
const busy = new Set<string>();
const listeners = new Set<() => void>();
let currentAgentId: string | undefined;

function emit() {
  for (const listener of listeners) listener();
}

export const enhanceState = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot(agentId: string): EnhanceSnapshot | undefined {
    return snapshots.get(agentId);
  },
  isBusy(agentId: string): boolean {
    return busy.has(agentId);
  },
  begin(agentId: string) {
    busy.add(agentId);
    currentAgentId = agentId;
    emit();
  },
  end(agentId: string) {
    busy.delete(agentId);
    emit();
  },
  record(agentId: string, snapshot: EnhanceSnapshot) {
    snapshots.set(agentId, snapshot);
    emit();
  },
  clear(agentId: string) {
    snapshots.delete(agentId);
    emit();
  },
  /** The DOM button cannot read the host's agent context, so it follows the last active agent. */
  markCurrent(agentId: string) {
    currentAgentId = agentId;
  },
  current(): string | undefined {
    return currentAgentId;
  },
};
