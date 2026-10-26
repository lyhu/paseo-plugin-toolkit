import type { PaseoAgent, PaseoApi } from "@getpaseo/client";

export function sessionTime(agent: PaseoAgent) {
  return agent.lastUserMessageAt ?? agent.createdAt;
}
export async function readWorkspaceSessions(
  paseo: PaseoApi,
  workspaceId: string,
  signal: AbortSignal,
) {
  const sessions = new Map<string, PaseoAgent>();
  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await paseo.agents.list({
      filter: { includeArchived: true, includeInternal: false },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
      signal,
    });
    signal.throwIfAborted();
    for (const { agent } of page.entries)
      if (agent.workspaceId === workspaceId && !agent.internal) sessions.set(agent.id, agent);
    const next = page.pageInfo.nextCursor;
    if (next && next === cursor) throw new Error("会话列表分页未前进，请重试。");
    cursor = next ?? undefined;
  } while (cursor);
  return [...sessions.values()].sort(
    (a, b) => Date.parse(sessionTime(b)) - Date.parse(sessionTime(a)) || a.id.localeCompare(b.id),
  );
}
