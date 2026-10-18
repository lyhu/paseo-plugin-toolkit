/**
 * Why a model request failed, as data rather than prose. The transport throws this without knowing
 * who is reading; each feature renders the sentence where the language is known.
 */
export type ProviderFailureKind =
  | "http"
  | "timeout"
  | "aborted"
  | "truncatedOutput"
  | "emptyResponse"
  | "invalidResponse"
  | "invalidCatalog";

export class ProviderFailure extends Error {
  readonly kind: ProviderFailureKind;
  /** The raw detail: the transport's own reason, or the timeout in milliseconds as a string. */
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
