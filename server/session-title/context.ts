import type { HistoryMessage } from "./history";

const CONTEXT_LIMIT = 10000;

// Retain the original goal, recent refinements and an evenly spaced view of the middle.
function sample(messages: HistoryMessage[]): HistoryMessage[] {
  if (messages.length <= 16) return messages;
  const indices = new Set([0, 1]);
  for (let index = messages.length - 8; index < messages.length; index++) indices.add(index);
  for (let index = 0; index < 6; index++)
    indices.add(2 + Math.floor((index * (messages.length - 11)) / 5));
  return [...indices].sort((a, b) => a - b).map((index) => messages[index]!);
}

function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = "\n[…省略中间内容…]\n";
  const head = Math.ceil((limit - marker.length) * 0.65);
  return text.slice(0, head) + marker + text.slice(-(limit - marker.length - head));
}

/** Bounded evidence for naming, not a full archival summary. Never mutates the history. */
export function titleContext(messages: HistoryMessage[]) {
  const users = messages.filter((message) => message.role === "user");
  const full = messages.map(({ role, text, seq }) => ({ role, text, seq }));
  const messagesBySeq = new Map(messages.map((message) => [message.seq, message]));
  const build = (selected: typeof full, mode: "full" | "user-focused") => ({
    mode,
    totalMessages: messages.length,
    totalUserMessages: users.length,
    omittedMessages: messages.length - selected.length,
    truncatedMessages: selected.filter(
      (message) => message.text !== messagesBySeq.get(message.seq)?.text,
    ).length,
    messages: selected,
  });
  const fullContext = build(full, "full");
  if (users.length <= 20 && JSON.stringify(fullContext).length <= CONTEXT_LIMIT) return fullContext;

  const assistants = messages.filter((message) => message.role === "assistant");
  const selected = users.length
    ? [...sample(users), ...assistants.slice(-2)].sort((a, b) => a.seq - b.seq)
    : sample(assistants);
  let limit = 600;
  let context;
  do {
    context = build(
      selected.map(({ role, text, seq }) => ({
        role,
        seq,
        text: excerpt(text, role === "user" ? limit : Math.min(limit, 400)),
      })),
      "user-focused",
    );
    // Budget the serialized evidence too: quotes, newlines and control characters expand in JSON.
    limit = Math.floor(limit / 2);
  } while (JSON.stringify(context).length > CONTEXT_LIMIT);
  return context;
}
