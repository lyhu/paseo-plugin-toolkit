import { t, type SupportedLocale } from "../i18n";
import { MAX_ENHANCED_CHARS, type EnhanceResult, type EnvironmentProfile } from "./contract";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  decideEnhancement,
  type EnhanceDecision,
} from "./decide";
import { providerFailureMessage, ProviderFailure } from "./failure";
import { normalizeRaw } from "./normalize";
import { derivePolicy } from "./policy";
import { degradedResult, parseEnhanceOutput, unchangedResult } from "./parse";
import { buildEnhanceMessages, type EnhanceMessage } from "./prompt";

/** The single seam the outside world plugs into: swap this and the core stays untouched. */
export interface EnhanceProvider {
  complete(messages: EnhanceMessage[]): Promise<string>;
}

export interface EnhanceRunInput {
  raw: string;
  profile: EnvironmentProfile;
  provider: EnhanceProvider;
  /** The reader's language; only the reasons depend on it. Defaults to Chinese. */
  locale?: SupportedLocale;
}

export async function runEnhancement(input: EnhanceRunInput): Promise<EnhanceResult> {
  const locale = input.locale ?? "zh-CN";
  const original = normalizeRaw(input.raw);
  const decision = decideEnhancement(original);
  const missing = decision.missing.map((dimension) => DIMENSION_LABELS[dimension]);
  if (!decision.enhance) return unchangedResult(original, describeSkip(locale, decision));
  const policy = derivePolicy(input.profile);
  let completion: string;
  try {
    const messages = buildEnhanceMessages({
      raw: original,
      missing,
      profile: input.profile,
      policy,
    });
    completion = await input.provider.complete(messages);
  } catch (error) {
    return degradedResult(original, describeFailure(locale, error), missing);
  }
  return parseEnhanceOutput(completion, original, missing, locale);
}

/** The pre-check's verdict, worded for the reader: which dimensions it found and which it missed. */
function describeSkip(locale: SupportedLocale, decision: EnhanceDecision): string {
  switch (decision.skip) {
    case "tooShort":
      return t(locale, "enhance.skip.tooShort");
    case "alreadyStructured":
      return t(locale, "enhance.skip.alreadyStructured");
    case "missingDimensions":
      return t(locale, "enhance.skip.missingDimensions", {
        items: decision.missing
          .map((dimension) => t(locale, DIMENSION_KEYS[dimension]))
          .join(locale === "zh-CN" ? "、" : ", "),
      });
    case "tooLong":
      return t(locale, "enhance.skip.tooLong", { limit: MAX_ENHANCED_CHARS });
    default:
      return t(locale, "enhance.unchanged");
  }
}

function describeFailure(locale: SupportedLocale, error: unknown): string {
  if (error instanceof ProviderFailure) return providerFailureMessage(locale, error);
  return t(locale, "enhance.reason.providerFailed", { detail: describeError(error) });
}

/** Missing credentials are a configuration problem, not a model failure; keep the raw text. */
export function notConfiguredResult(raw: string, locale: SupportedLocale): EnhanceResult {
  const original = normalizeRaw(raw);
  return degradedResult(original, t(locale, "enhance.reason.notConfigured"));
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
