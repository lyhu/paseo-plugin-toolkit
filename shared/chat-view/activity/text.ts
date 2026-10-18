import type { JsonValue } from "@getpaseo/protocol/agent-types";

/** 文本预算（行数/字符数上限）、宽松 JSON 格式化，以及任意值转可读文本。 */

export function compactText(value: string, maxLength = 180): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export const PREVIEW_LINES = 20;

export const PREVIEW_CHARS = 4_000;

export const MAX_FORMAT_CHARS = 100_000;

export interface TextPreview {
  text: string;
  truncated: boolean;
  totalLines: number;
  totalChars: number;
}

export function previewText(
  text: string,
  maxLines = PREVIEW_LINES,
  maxChars = PREVIEW_CHARS,
): TextPreview {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const totalChars = text.length;

  if (totalLines <= maxLines && totalChars <= maxChars) {
    return { text, truncated: false, totalLines, totalChars };
  }

  const candidate = text.slice(0, maxChars + 1);
  const candidateLines = candidate.split("\n");
  let preview = candidateLines.slice(0, maxLines).join("\n").slice(0, maxChars);

  // Guard against splitting a UTF-16 surrogate pair
  const last = preview.charCodeAt(preview.length - 1);
  const next = text.charCodeAt(preview.length);
  if (
    preview.length < text.length &&
    last >= 0xd800 &&
    last <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff
  ) {
    preview = preview.slice(0, -1);
  }

  return {
    text: preview,
    truncated: preview.length < text.length,
    totalLines,
    totalChars,
  };
}

function looksLikeJson(source: string): boolean {
  return /^\s*[[{"]/.test(source.slice(0, 256));
}

export interface JsonFormat {
  text: string | null;
  limited: boolean;
}

/** Change whitespace only. Preserve large numbers, key order, duplicate keys and escapes. */

export function formatJson(source: string): JsonFormat {
  if (source.length > MAX_FORMAT_CHARS || !source.trim()) {
    return { text: null, limited: source.length > MAX_FORMAT_CHARS && looksLikeJson(source) };
  }
  try {
    JSON.parse(source);
  } catch {
    return { text: null, limited: false };
  }
  const tokens = source.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) ?? [];
  let depth = 0;
  const out: string[] = [];
  let length = 0;
  const push = (value: string) => {
    out.push(value);
    length += value.length;
  };
  const line = () => push("\n" + "  ".repeat(Math.min(depth, 40)));
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "{" || token === "[") {
      push(token);
      depth += 1;
      if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]") line();
    } else if (token === "}" || token === "]") {
      depth -= 1;
      if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[") line();
      push(token);
    } else if (token === ",") {
      push(token);
      line();
    } else if (token === ":") {
      push(": ");
    } else {
      push(token);
    }
    if (length > MAX_FORMAT_CHARS) return { text: null, limited: true };
  }
  return { text: out.join(""), limited: false };
}

export function prettyJson(source: string): string | null {
  return formatJson(source).text;
}

export function extractCodeInput(
  toolName: string,
  value: unknown,
): { code: string; language: string } | undefined {
  let decoded = value;
  if (typeof value === "string" && value.length <= 1_000_000) {
    try {
      decoded = JSON.parse(value);
    } catch {
      // may be literal JS
    }
  }
  const record =
    decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : undefined;
  const name = toolName
    .trim()
    .toLowerCase()
    .replace(/^(?:functions|tools)\./, "")
    .replace(/^mcp__.*?__/, "")
    .replace(/^mcp_/, "");

  const codeTool = ["exec", "mcpscript", "mcp_script", "run_script"].includes(name);
  if (codeTool) {
    const code =
      record?.code ??
      (typeof decoded === "string" && !decoded.slice(0, 256).trimStart().startsWith("{")
        ? decoded
        : undefined);
    if (typeof code === "string") {
      return { code, language: "javascript" };
    }
  }

  if (name === "evaluate_browser" || name === "browser_evaluate") {
    const code = record?.expression ?? record?.code;
    if (typeof code === "string") {
      return { code, language: "javascript" };
    }
  }

  return undefined;
}

export function toJsonValue(value: unknown): JsonValue {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : (JSON.parse(serialized) as JsonValue);
  } catch {
    return null;
  }
}

export function formatUnknownValue(value: unknown): string {
  if (typeof value === "string") {
    const formatted = prettyJson(value);
    return formatted ?? value;
  }
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) return String(value);
    const formatted = prettyJson(raw);
    return formatted ?? JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatError(error: unknown): string | undefined {
  if (error === null || error === undefined) return undefined;
  const text = typeof error === "string" ? error : formatUnknownValue(error);
  return compactText(text, 400);
}

export function formatReasoningText(text: string): string {
  if (!text) return "";
  const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/(\*\*[^*\s\n](?:[^*\n]*?[^*\s\n])?\*\*)\s*(?=\*\*)/g, "$1\n\n");
    })
    .join("");
}
