const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const FULL_WIDTH_SPACE = /\u3000/g;
const EXCESS_BLANK_LINES = /\n{3,}/g;

/**
 * Collapse cosmetic noise without rewriting wording. Trailing spaces are kept because two of
 * them are a hard line break in Markdown.
 */
export function normalizeRaw(raw: string): string {
  return raw
    .replace(ZERO_WIDTH, "")
    .replace(FULL_WIDTH_SPACE, " ")
    .replace(/\r\n?/g, "\n")
    .replace(EXCESS_BLANK_LINES, "\n\n")
    .trim();
}
