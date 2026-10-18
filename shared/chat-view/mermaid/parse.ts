/**
 * A small Markdown subset for the prose around a diagram.
 *
 * Taking over a timeline item means taking over its text too, so this exists to
 * keep that text readable. It covers what agents actually write around a
 * diagram: headings, paragraphs, lists, tables, code and inline emphasis.
 * Anything else survives as plain text rather than as broken markup.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string };

export type Align = "left" | "center" | "right";

export type Block =
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "bullet"; items: Inline[][] }
  | { kind: "ordered"; items: Inline[][]; start: number }
  | { kind: "code"; language: string; text: string }
  | { kind: "quote"; content: Inline[] }
  | { kind: "table"; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const piece of text.split(INLINE)) {
    if (piece.length === 0) continue;
    if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 1) {
      out.push({ kind: "code", text: piece.slice(1, -1) });
    } else if (
      (piece.startsWith("**") && piece.endsWith("**")) ||
      (piece.startsWith("__") && piece.endsWith("__"))
    ) {
      out.push({ kind: "bold", text: piece.slice(2, -2) });
    } else if (
      (piece.startsWith("*") && piece.endsWith("*")) ||
      (piece.startsWith("_") && piece.endsWith("_"))
    ) {
      out.push({ kind: "italic", text: piece.slice(1, -1) });
    } else {
      out.push({ kind: "text", text: piece });
    }
  }
  return out;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const FENCE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/;
const CELL_ALIGN = /^(:?)(-+)(:?)$/;

/** Splits a table row into trimmed cells; `\|` hides a pipe from the split. */
function splitRow(line: string): string[] {
  const parts = line.replace(/\\\|/g, "\u0000").split("|");
  if (parts.length > 1 && parts[0].trim().length === 0) parts.shift();
  if (parts.length > 0 && (parts[parts.length - 1] as string).trim().length === 0) parts.pop();
  return parts.map((part) => part.split("\u0000").join("|").trim());
}

/** The second table line: cells of dashes with optional colons for alignment. */
function delimiterAligns(line: string): Align[] | null {
  if (!line.includes("|")) return null;
  const cells = splitRow(line);
  if (cells.length === 0) return null;
  const aligns: Align[] = [];
  for (const cell of cells) {
    const match = CELL_ALIGN.exec(cell);
    if (!match) return null;
    const lead = match[1] ?? "";
    const tail = match[3] ?? "";
    aligns.push(lead && tail ? "center" : tail ? "right" : "left");
  }
  return aligns;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    const text = paragraph.join(" ").trim();
    if (text.length > 0) blocks.push({ kind: "paragraph", content: parseInline(text) });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: "code", language: fence[2], text: body.join("\n") });
      continue;
    }

    if (line.trim().length === 0) {
      flush();
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, content: parseInline(heading[2]) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const items: Inline[][] = [parseInline(bullet[1])];
      while (index + 1 < lines.length) {
        const next = BULLET.exec(lines[index + 1]);
        if (!next) break;
        items.push(parseInline(next[1]));
        index += 1;
      }
      blocks.push({ kind: "bullet", items });
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      flush();
      const items: Inline[][] = [parseInline(ordered[2])];
      while (index + 1 < lines.length) {
        const next = ORDERED.exec(lines[index + 1]);
        if (!next) break;
        items.push(parseInline(next[2]));
        index += 1;
      }
      blocks.push({ kind: "ordered", items, start: Number(ordered[1]) });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      blocks.push({ kind: "quote", content: parseInline(quote[1]) });
      continue;
    }

    // A table can interrupt a paragraph, so this check runs before the line
    // joins one: header, then a delimiter row, then rows until a non-row line.
    const aligns =
      line.includes("|") && index + 1 < lines.length
        ? delimiterAligns(lines[index + 1] as string)
        : null;
    if (aligns) {
      flush();
      const header = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length) {
        const row = lines[index] as string;
        if (row.trim().length === 0 || !row.includes("|")) break;
        rows.push(splitRow(row).map(parseInline));
        index += 1;
      }
      // The line that broke the loop is not table material; rewind so the main
      // loop re-reads it as whatever it is.
      index -= 1;
      blocks.push({ kind: "table", align: aligns, header, rows });
      continue;
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}
