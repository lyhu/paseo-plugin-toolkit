import { t, type SupportedLocale } from "../i18n";
import { MAX_ENHANCED_CHARS, type EnhanceResult } from "./contract";
import { normalizeRaw } from "./normalize";

const ENHANCED_BLOCK = /<enhanced_prompt>([\s\S]*?)<\/enhanced_prompt>/i;
const DELTA_BLOCK = /<delta_summary>([\s\S]*?)<\/delta_summary>/i;
const OPEN_BLOCK = /<open_questions>([\s\S]*?)<\/open_questions>/i;
const NOTHING = /^(无|none|n\/a|无。|-)$/i;

/** A failed enhancement must still land something usable in the composer, never an exception. */
export function degradedResult(
  original: string,
  reason: string,
  missing: string[] = [],
): EnhanceResult {
  return {
    enhanced: original,
    deltaSummary: "",
    openQuestions: missing,
    applied: false,
    degraded: true,
    degradedReason: reason,
    truncated: false,
  };
}

/** The pre-check already decided the raw input is executable; keep it byte-identical. */
export function unchangedResult(original: string, reason: string): EnhanceResult {
  return {
    enhanced: original,
    deltaSummary: "",
    openQuestions: [],
    applied: false,
    degraded: false,
    degradedReason: reason,
    truncated: false,
  };
}

/**
 * `locale` only reaches the reason strings; the delivered text is the model's own. Callers that
 * have a language to show must pass it, or a failure reads as Chinese to an English reader.
 */
export function parseEnhanceOutput(
  raw: string,
  original: string,
  missing: string[],
  locale: SupportedLocale,
): EnhanceResult {
  const enhanced = ENHANCED_BLOCK.exec(raw)?.[1]?.trim() ?? "";
  if (!enhanced) return degradedResult(original, t(locale, "enhance.reason.noBody"), missing);
  const limit = MAX_ENHANCED_CHARS;
  const truncated = enhanced.length > limit;
  const body = truncated ? truncate(enhanced, limit) : enhanced;
  if (body === normalizeRaw(original))
    return unchangedResult(original, t(locale, "enhance.reason.equivalent"));
  return {
    enhanced: body,
    deltaSummary: DELTA_BLOCK.exec(raw)?.[1]?.trim() ?? "",
    openQuestions: parseOpenQuestions(OPEN_BLOCK.exec(raw)?.[1] ?? ""),
    applied: true,
    degraded: false,
    degradedReason: "",
    truncated,
  };
}

function parseOpenQuestions(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.replace(/^\s*[-*\d.、]+\s*/, "").trim())
    .filter((line) => line.length > 0 && !NOTHING.test(line));
}

function truncate(text: string, limit: number): string {
  const kept = text.slice(0, limit);
  const lastOpen = kept.lastIndexOf("<");
  return lastOpen > limit - 40 ? kept.slice(0, lastOpen) : kept;
}
