/** MCP tool payloads arrive in several envelopes; this module is the one reader for them. */
export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** First non-empty string field; host payloads mix snake_case and camelCase. */
export function fieldString(record: JsonRecord | null, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record?.[key]);
    if (value) return value;
  }
  return undefined;
}

/** The final segment of a namespaced tool name such as `mcp__exa__web_search_exa`. */
export function toolLeaf(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .split(/__|[.:/]/)
      .at(-1) ?? ""
  );
}

/** Parse JSON that may be wrapped in prose or a code fence. */
export function parseEmbeddedJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    for (const match of value.matchAll(/\{|\[/g)) {
      const offset = match.index;
      if (offset === undefined) continue;
      try {
        return JSON.parse(value.slice(offset)) as unknown;
      } catch {
        continue;
      }
    }
    return undefined;
  }
}

function textParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  const record = asRecord(value);
  if (!record) return [];
  if (record.structuredContent !== undefined) {
    const structured = textParts(record.structuredContent);
    if (structured.length > 0) return structured;
  }
  if (typeof record.text === "string") return [record.text];
  if (Array.isArray(record.content)) return record.content.flatMap((part) => textParts(part));
  return [];
}

/** Text from a tool result, preserving content order and paragraph breaks. */
export function toolOutputText(value: unknown): string | undefined {
  const text = textParts(value).filter(Boolean).join("\n\n").trim();
  return text || undefined;
}

/** JSON carried by a tool result: structured content, a text block, or a JSON string. */
export function toolOutputValue(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return typeof value === "string" ? (parseEmbeddedJson(value) ?? value) : value;
  if (record.structuredContent !== undefined) return toolOutputValue(record.structuredContent);
  if (Array.isArray(record.content)) {
    const text = toolOutputText(record);
    if (text) return parseEmbeddedJson(text) ?? text;
  }
  return value;
}

/** Decode the first text block of an MCP envelope, leaving non-JSON text as text. */
export function unwrapToolOutput(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  if (record.structuredContent !== undefined) return unwrapToolOutput(record.structuredContent);
  if (Array.isArray(record.content)) {
    const content = record.content.find((item) => asRecord(item)?.type === "text");
    const text = asRecord(content)?.text;
    if (typeof text === "string") {
      const parsed = parseEmbeddedJson(text);
      return parsed === undefined ? text : unwrapToolOutput(parsed);
    }
  }
  return value;
}
