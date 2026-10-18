import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

/** 行级差异与增删统计：统一 diff、新旧整文两种输入都归到这里。 */

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface DiffLine {
  kind: "add" | "remove" | "context" | "meta";
  text: string;
}

export const MAX_DIFF_CHARS = 100_000;

export function diffStatsFromUnifiedDiff(unifiedDiff: string): DiffStats {
  let additions = 0;
  let deletions = 0;
  for (const line of unifiedDiff.replace(/\r/g, "").split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

function splitDiffLines(text: string): { lines: string[]; hasTrailingNewline: boolean } {
  const normalized = text.replace(/\r/g, "");
  if (!normalized) return { lines: [], hasTrailingNewline: false };
  const hasTrailingNewline = normalized.endsWith("\n");
  const rawLines = normalized.split("\n");
  if (hasTrailingNewline) rawLines.pop();
  return { lines: rawLines, hasTrailingNewline };
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText.length + newText.length > MAX_DIFF_CHARS) {
    return [
      ...(oldText
        ? [
            {
              kind: "remove" as const,
              text: `[Previous content: ${oldText.length.toLocaleString()} characters]`,
            },
          ]
        : []),
      ...(newText
        ? [
            {
              kind: "add" as const,
              text: `[Updated content: ${newText.length.toLocaleString()} characters]`,
            },
          ]
        : []),
    ];
  }

  const { lines: oldLines, hasTrailingNewline: oldHasNewline } = splitDiffLines(oldText);
  const { lines: newLines, hasTrailingNewline: newHasNewline } = splitDiffLines(newText);
  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) return newLines.map((text) => ({ kind: "add", text }));
  if (n === 0) return oldLines.map((text) => ({ kind: "remove", text }));

  // Trim common prefix
  let start = 0;
  while (start < m && start < n && oldLines[start] === newLines[start]) {
    start++;
  }

  // Trim common suffix
  let oldEnd = m - 1;
  let newEnd = n - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  // If all lines matched but newline termination changed, mark the last line as updated
  if (start >= m && start >= n && oldHasNewline !== newHasNewline) {
    const lastLine = oldLines[m - 1] ?? "";
    const prefix = oldLines.slice(0, m - 1).map((text) => ({ kind: "context" as const, text }));
    return [...prefix, { kind: "remove", text: lastLine }, { kind: "add", text: lastLine }];
  }

  const prefix: DiffLine[] = oldLines.slice(0, start).map((text) => ({ kind: "context", text }));
  const suffix: DiffLine[] = oldLines.slice(oldEnd + 1).map((text) => ({ kind: "context", text }));

  const trimmedOld = oldLines.slice(start, oldEnd + 1);
  const trimmedNew = newLines.slice(start, newEnd + 1);

  const tM = trimmedOld.length;
  const tN = trimmedNew.length;

  if (tM === 0 && tN === 0) return prefix.concat(suffix);

  // If the trimmed region is oversized, fall back to coarse replacement to protect memory
  if (tM * tN > 500_000 || tM + tN > 2500) {
    const fallback: DiffLine[] = [
      ...trimmedOld.map((text) => ({ kind: "remove" as const, text })),
      ...trimmedNew.map((text) => ({ kind: "add" as const, text })),
    ];
    return prefix.concat(fallback, suffix);
  }

  const dp: number[][] = Array.from({ length: tM + 1 }, () =>
    Array.from({ length: tN + 1 }, () => 0),
  );
  for (let i = 0; i < tM; i++) {
    for (let j = 0; j < tN; j++) {
      if (trimmedOld[i] === trimmedNew[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const middle: DiffLine[] = [];
  let i = tM;
  let j = tN;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && trimmedOld[i - 1] === trimmedNew[j - 1]) {
      middle.push({ kind: "context", text: trimmedOld[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middle.push({ kind: "add", text: trimmedNew[j - 1] });
      j--;
    } else if (i > 0) {
      middle.push({ kind: "remove", text: trimmedOld[i - 1] });
      i--;
    }
  }

  return prefix.concat(middle.reverse(), suffix);
}

function countLines(value: string): number {
  if (!value) return 0;
  const lines = value.replace(/\r/g, "").split("\n");
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

export function diffStatsFromStrings(oldString: string, newString: string): DiffStats {
  if (oldString.length + newString.length > MAX_DIFF_CHARS) {
    return { additions: countLines(newString), deletions: countLines(oldString) };
  }
  let additions = 0;
  let deletions = 0;
  for (const line of computeLineDiff(oldString, newString)) {
    if (line.kind === "add") additions += 1;
    else if (line.kind === "remove") deletions += 1;
  }
  return { additions, deletions };
}

export function diffStatsForDetail(detail: Extract<ToolCallDetail, { type: "edit" }>): DiffStats {
  if (detail.unifiedDiff !== undefined) return diffStatsFromUnifiedDiff(detail.unifiedDiff);
  return diffStatsFromStrings(detail.oldString ?? "", detail.newString ?? "");
}

export function diffLinesForDetail(detail: Extract<ToolCallDetail, { type: "edit" }>): DiffLine[] {
  const size =
    detail.unifiedDiff?.length ?? (detail.oldString?.length ?? 0) + (detail.newString?.length ?? 0);
  if (size > MAX_DIFF_CHARS) {
    return [
      ...(detail.oldString
        ? [
            {
              kind: "remove" as const,
              text: `[Previous content: ${detail.oldString.length.toLocaleString()} characters]`,
            },
          ]
        : []),
      ...(detail.newString
        ? [
            {
              kind: "add" as const,
              text: `[Updated content: ${detail.newString.length.toLocaleString()} characters]`,
            },
          ]
        : []),
    ];
  }

  if (detail.unifiedDiff !== undefined) {
    return detail.unifiedDiff
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, index, lines) => !(index === lines.length - 1 && line === ""))
      .map((line) => {
        if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) {
          return { kind: "meta", text: line };
        }
        if (line.startsWith("+")) return { kind: "add", text: line.slice(1) };
        if (line.startsWith("-")) return { kind: "remove", text: line.slice(1) };
        if (line.startsWith(" ")) return { kind: "context", text: line.slice(1) };
        return { kind: "context", text: line };
      });
  }

  return computeLineDiff(detail.oldString ?? "", detail.newString ?? "");
}
