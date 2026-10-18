import type { ToolCallDetail, ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import { MAX_DIFF_CHARS, diffStatsForDetail, type DiffStats } from "./diff";
import { exaToolIcon, exaToolKind, exaToolLabel, exaToolSummary } from "./exa";
import { fileIconForPath, languageForFilePath } from "./file-kind";
import { githubToolIcon, githubToolKind, githubToolLabel, githubToolSummary } from "./github";
import { prettyToolName, resolvePaseoToolRow, type ToolCategory } from "./paseo-tools";
import { compactText } from "./text";

/** 时间线条目 → 标题、图标、分类、摘要；也负责子代理动作行与 MCP 信封解包。 */

export interface ToolCallPresentation {
  category: ToolCategory;
  icon: string;
  label: string;
  summary?: string;
  filePath?: string;
  fileIcon?: string;
  language?: string;
  diffStats?: DiffStats;
}

export interface SubAgentActionPresentation {
  icon: string;
  label: string;
  summaryIcon?: string;
}

export interface SubAgentAction {
  index: number;
  toolName: string;
  summary?: string;
}

const TOOL_ICON_NAMES: Record<string, string> = {
  bot: "Bot",
  brain: "Brain",
  eye: "Eye",
  mic_vocal: "MicVocal",
  pencil: "Pencil",
  paseo: "Sparkles",
  search: "Search",
  sparkles: "Sparkles",
  square_terminal: "SquareTerminal",
  wrench: "Wrench",
};

function iconNameFromProtocol(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return TOOL_ICON_NAMES[value] ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

export function paseoToolLabel(toolName: string): string | null {
  return resolvePaseoToolRow(toolName)?.row.label ?? null;
}

export function paseoToolIcon(toolName: string): string | null {
  return resolvePaseoToolRow(toolName)?.row.icon ?? null;
}

export function paseoToolCategory(toolName: string): ToolCategory | null {
  return resolvePaseoToolRow(toolName)?.row.category ?? null;
}

function summaryFieldValue(input: unknown, field: string): string | undefined {
  if (field === "prompt")
    return stringField(input, "prompt") ?? stringField(input, "initialPrompt");
  return stringField(input, field);
}

export function paseoToolSummary(toolName: string, input: unknown): string | undefined {
  const row = resolvePaseoToolRow(toolName)?.row;
  if (!row?.summary) return undefined;
  for (const group of row.summary) {
    const values = group.map((field) => summaryFieldValue(input, field));
    if (values.some((value) => value === undefined)) continue;
    const joined = values.join(" · ");
    return row.compactSummary ? compactText(joined) : joined;
  }
  return undefined;
}

function parseEmbeddedJson(value: string): unknown {
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

export function unwrapPaseoToolOutput(value: unknown): unknown {
  const record = isRecord(value) ? value : null;
  if (!record) return value;
  if (record.structuredContent !== undefined)
    return unwrapPaseoToolOutput(record.structuredContent);
  if (Array.isArray(record.content)) {
    const content = record.content.find((item) => isRecord(item) && item.type === "text");
    if (isRecord(content)) {
      const parsed = typeof content.text === "string" ? parseEmbeddedJson(content.text) : undefined;
      return parsed === undefined ? content.text : unwrapPaseoToolOutput(parsed);
    }
  }
  return value;
}

export function paseoToolResult(value: unknown): unknown {
  const unwrapped = unwrapPaseoToolOutput(value);
  const record = isRecord(unwrapped) ? unwrapped : null;
  return record?.ok === true && record.result !== undefined ? record.result : unwrapped;
}

function shellSummary(detail: Extract<ToolCallDetail, { type: "shell" }>): string | undefined {
  return compactText(detail.command);
}

function detailFilePath(detail: ToolCallDetail): string | undefined {
  if (detail.type === "read" || detail.type === "edit" || detail.type === "write") {
    return detail.filePath || undefined;
  }
  return undefined;
}

export function resolveToolCallPresentation(
  item: Pick<ToolCallTimelineItem, "name" | "detail">,
): ToolCallPresentation {
  const name = item.name.trim().toLowerCase();
  const detail = item.detail;
  const filePath = detailFilePath(detail);
  const commonFileFields = filePath
    ? {
        filePath,
        fileIcon: fileIconForPath(filePath),
        language: languageForFilePath(filePath),
      }
    : {};

  switch (detail.type) {
    case "shell":
      return {
        category: "shell",
        icon: "SquareTerminal",
        label: "Shell Command",
        summary: shellSummary(detail),
      };
    case "worktree_setup":
      return {
        category: "shell",
        icon: "GitBranch",
        label: "Worktree Setup",
        summary: compactText(detail.branchName || detail.worktreePath),
      };
    case "read":
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Eye",
        label: "Read File",
        summary: compactText(detail.filePath),
        ...commonFileFields,
      };
    case "edit": {
      const editSize =
        detail.unifiedDiff?.length ??
        (detail.oldString?.length ?? 0) + (detail.newString?.length ?? 0);
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Pencil",
        label: "Edit File",
        summary: compactText(detail.filePath),
        ...(editSize <= MAX_DIFF_CHARS ? { diffStats: diffStatsForDetail(detail) } : {}),
        ...commonFileFields,
      };
    }
    case "write":
      return {
        category: "file",
        icon: commonFileFields.fileIcon ?? "Pencil",
        label: "Write File",
        summary: compactText(detail.filePath),
        ...commonFileFields,
      };
    case "search":
      return {
        category: "search",
        icon: "Search",
        label: "Search",
        summary: compactText(detail.query),
      };
    case "fetch":
      return {
        category: "search",
        icon: "Globe",
        label: "Fetch URL",
        summary: compactText(detail.url),
      };
    case "sub_agent":
      return {
        category: "agent",
        icon: "Bot",
        label: "Agent Task",
        summary: detail.description
          ? compactText(detail.description)
          : compactText(detail.subAgentType ?? ""),
      };
    case "plain_text":
      return {
        category: "communication",
        icon: iconNameFromProtocol(detail.icon) ?? "Wrench",
        label: detail.label || prettyToolName(item.name),
        summary: detail.text ? compactText(detail.text) : undefined,
      };
    case "plan":
      return {
        category: "plan",
        icon: "ListChecks",
        label: "Plan",
      };
    case "unknown": {
      if (name === "thinking") {
        return { category: "plan", icon: "Brain", label: "Thinking" };
      }
      if (name === "task") {
        return { category: "agent", icon: "Bot", label: "Task", summary: compactText(item.name) };
      }
      if (name === "speak") {
        return { category: "communication", icon: "MicVocal", label: "Speak" };
      }
      const githubKind = githubToolKind(item.name);
      if (githubKind) {
        return {
          category:
            githubKind === "pull-request" || githubKind === "actions-run" ? "agent" : "search",
          icon: githubToolIcon(githubKind),
          label: githubToolLabel(githubKind),
          summary: githubToolSummary(githubKind, detail.input),
        };
      }
      const exaKind = exaToolKind(item.name);
      if (exaKind) {
        return {
          category: exaKind === "agent" ? "agent" : "search",
          icon: exaToolIcon(exaKind),
          label: exaToolLabel(exaKind),
          summary: exaToolSummary(exaKind, detail.input),
        };
      }
      const paseoLabel = paseoToolLabel(item.name);
      if (paseoLabel) {
        return {
          category: paseoToolCategory(item.name) ?? "unknown",
          icon: paseoToolIcon(item.name) ?? "Sparkles",
          label: `Paseo ${paseoLabel}`,
          summary: paseoToolSummary(item.name, detail.input),
        };
      }
      return {
        category: "unknown",
        icon: "Wrench",
        label: prettyToolName(item.name),
      };
    }
  }
}

export function resolveSubAgentActionPresentation(
  toolName: string,
  summary?: string,
): SubAgentActionPresentation {
  const normalized = toolName
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  if (
    normalized === "read" ||
    normalized.includes("read_file") ||
    normalized.includes("readfile")
  ) {
    return { icon: "FileText", label: "Read File", summaryIcon: fileIconForPath(summary) };
  }
  if (
    normalized === "glob" ||
    normalized === "find" ||
    normalized.includes("find_file") ||
    normalized.includes("list_file")
  ) {
    return { icon: "Search", label: "Find Files" };
  }
  if (normalized === "grep" || normalized === "search" || normalized.includes("search")) {
    return { icon: "Search", label: "Search" };
  }
  if (
    normalized === "bash" ||
    normalized === "sh" ||
    normalized === "run" ||
    normalized.includes("shell") ||
    normalized.includes("command")
  ) {
    return { icon: "SquareTerminal", label: "Shell Command" };
  }
  if (normalized === "edit" || normalized.includes("edit_file") || normalized.includes("patch")) {
    return { icon: "Pencil", label: "Edit File", summaryIcon: fileIconForPath(summary) };
  }
  if (
    normalized === "write" ||
    normalized.includes("write_file") ||
    normalized.includes("writefile")
  ) {
    return { icon: "Pencil", label: "Write File", summaryIcon: fileIconForPath(summary) };
  }
  if (
    normalized === "task" ||
    normalized.includes("sub_agent") ||
    normalized.includes("subagent")
  ) {
    return { icon: "Bot", label: "Agent Task" };
  }
  return { icon: "Wrench", label: toolName.trim() || "Tool" };
}

export function parseSubAgentActionLog(log: string): readonly SubAgentAction[] {
  const actions: SubAgentAction[] = [];
  for (const line of log.split(/\r?\n/)) {
    const match = line.trim().match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match?.[1]) continue;
    const toolName = match[1].trim();
    if (!toolName) continue;
    const summary = match[2]?.trim();
    actions.push({
      index: actions.length,
      toolName,
      ...(summary ? { summary } : {}),
    });
  }
  return actions;
}
