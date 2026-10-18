import { t, type SupportedLocale } from "../i18n";
import { ProviderFailure } from "../../models/failure";

export { ProviderFailure };
export type { ProviderFailureKind } from "../../models/failure";

/** The one place a provider failure becomes a sentence. */
export function providerFailureMessage(locale: SupportedLocale, failure: ProviderFailure): string {
  switch (failure.kind) {
    case "http":
      return t(locale, "enhance.failure.http", {
        status: failure.status ?? "?",
        detail: failure.detail,
      });
    case "timeout":
      return t(locale, "enhance.failure.timeout", { ms: failure.detail });
    case "truncatedOutput":
      return t(locale, "enhance.failure.truncatedOutput");
    case "emptyResponse":
      return t(locale, "enhance.failure.emptyResponse");
    case "invalidResponse":
      return t(locale, "enhance.failure.invalidResponse");
    default:
      return t(locale, "enhance.reason.providerFailed", { detail: failure.message });
  }
}
