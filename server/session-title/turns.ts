import type { PaseoApi } from "@getpaseo/client";
import { readConversation } from "./history";

/** Only visible rows request counts. Bound provider history reads across connected clients. */
export function createSessionTurnCounter() {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async (paseo: PaseoApi, agentId: string, workspaceId: string) => {
    if (active < 2) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      const ref = paseo.agents.ref(agentId);
      const snapshot = await ref.refresh();
      if (!snapshot || snapshot.agent.workspaceId !== workspaceId || snapshot.agent.internal)
        return { count: null };
      const history = await readConversation(ref.timeline, new AbortController().signal);
      return { count: history.messages.filter((message) => message.role === "user").length };
    } catch {
      return { count: null };
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
