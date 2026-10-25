import type { PaseoAgent, PaseoApi } from "@getpaseo/client";

export function sessionActionError(message: string) {
  return message
    .replace(/^Request failed:\s*/, "")
    .replace(/\s+requestType=plugin\.rpc\.invoke\.request(?:\s+code=[\w-]+)?$/, "");
}

export function sessionTime(agent: PaseoAgent) {
  return agent.lastUserMessageAt ?? agent.createdAt;
}
export function formatSessionTime(at: string, now: number, locale: string) {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return "—";
  const label = new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const age = now - date.getTime();
  if (age < 0 || age > 30 * 86400000) return label;
  const minutes = Math.floor(age / 60000);
  if (!minutes) return `${label} (${locale === "zh-CN" ? "刚刚" : "just now"})`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const elapsed = days
    ? `${days}d${hours % 24 ? `${hours % 24}h` : ""}`
    : hours
      ? `${hours}h${minutes % 60 ? `${minutes % 60}m` : ""}`
      : `${minutes}m`;
  return `${label} (${elapsed}${locale === "zh-CN" ? "前" : " ago"})`;
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
