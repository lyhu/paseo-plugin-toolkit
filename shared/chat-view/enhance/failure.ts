import { t, type SupportedLocale } from "../i18n";

/**
 * Why a completion request failed, as data rather than prose. The provider throws this without
 * knowing who is reading, and the text is rendered where the language is known — which is also
 * what lets the connection probe classify a failure without pattern-matching localized sentences.
 */
export type ProviderFailureKind = "http" | "timeout" | "truncatedOutput" | "emptyResponse";

export class ProviderFailure extends Error {
  readonly kind: ProviderFailureKind;
  /** The raw detail: the endpoint's own body, or the timeout in milliseconds as a string. */
  readonly detail: string;
  readonly status?: number;

  constructor(kind: ProviderFailureKind, detail: string, status?: number) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = "ProviderFailure";
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

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
  }
}
