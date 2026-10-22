import type { PaseoApi, PaseoAgent } from "@getpaseo/client";

interface Listener {
  upsert(agent: PaseoAgent): void;
  remove(id: string): void;
}
const directories = new WeakMap<PaseoApi, ReturnType<typeof createDirectory>>();

function createDirectory(paseo: PaseoApi) {
  const listeners = new Set<Listener>();
  const agents = new Map<string, PaseoAgent>();
  const lifetime = new AbortController();
  let generation = 0;
  let changes: Map<string, PaseoAgent | null> | undefined;
  const upsert = (agent: PaseoAgent) => {
    agents.set(agent.id, agent);
    for (const listener of listeners) listener.upsert(agent);
  };
  const remove = (id: string) => {
    agents.delete(id);
    for (const listener of listeners) listener.remove(id);
  };
  const listing = paseo.agents.list({
    page: { limit: 200 },
    subscribe: {},
    signal: lifetime.signal,
  });
  void listing
    .then(({ subscription }) => {
      if (lifetime.signal.aborted) return;
      subscription.subscribe({
        snapshot(snapshot) {
          if (lifetime.signal.aborted) return;
          const current = ++generation;
          const overrides = new Map<string, PaseoAgent | null>();
          changes = overrides;
          const seen = new Set<string>();
          for (const { agent } of snapshot.entries) {
            seen.add(agent.id);
            upsert(agent);
          }
          const remaining = async () => {
            let cursor = snapshot.pageInfo.nextCursor;
            while (cursor && !lifetime.signal.aborted && current === generation) {
              const page = await paseo.agents.list({
                page: { limit: 200, cursor },
                signal: lifetime.signal,
              });
              if (lifetime.signal.aborted || current !== generation) return;
              for (const { agent } of page.entries) {
                seen.add(agent.id);
                if (!overrides.has(agent.id)) upsert(agent);
              }
              const next = page.pageInfo.nextCursor;
              if (next === cursor) throw new Error("Agent pagination did not advance");
              cursor = next;
            }
            if (lifetime.signal.aborted || current !== generation) return;
            for (const [id, agent] of overrides) {
              if (agent) seen.add(id);
              else seen.delete(id);
            }
            for (const id of agents.keys()) if (!seen.has(id)) remove(id);
            changes = undefined;
          };
          void remaining().catch((error) => {
            if (!lifetime.signal.aborted) console.error("[Toolkit] Agent directory failed", error);
          });
        },
        update(message) {
          if (lifetime.signal.aborted) return;
          if (message.type !== "agent_update") return;
          if (message.payload.kind === "upsert") {
            changes?.set(message.payload.agent.id, message.payload.agent);
            upsert(message.payload.agent);
          } else {
            changes?.set(message.payload.agentId, null);
            remove(message.payload.agentId);
          }
        },
        error(error) {
          if (!lifetime.signal.aborted) console.error("[Toolkit] Agent observation failed", error);
        },
      });
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("[Toolkit] Agent directory failed", error);
    });
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      for (const agent of agents.values()) listener.upsert(agent);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        listeners.delete(listener);
        if (listeners.size) return;
        lifetime.abort();
        generation++;
        agents.clear();
        changes?.clear();
        directories.delete(paseo);
        void listing.then(({ subscription }) => subscription.release()).catch(() => {});
      };
    },
  };
}

/** One owned directory per host connection, shared by the actual entry-point consumers. */
export function observeAgents(paseo: PaseoApi, listener: Listener) {
  let directory = directories.get(paseo);
  if (!directory) {
    directory = createDirectory(paseo);
    directories.set(paseo, directory);
  }
  return directory.subscribe(listener);
}
