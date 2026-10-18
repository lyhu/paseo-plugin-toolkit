import { Platform } from "react-native";
import type { Document, Element, Window, WindowConstructors } from "../dom";

// Prompt-enhancement DOM access: the composer bridge. The host SDK exposes no draft API, so the one
// stable attribute it renders is the only seam available.
declare const document: Document;
declare const window: Window;

const COMPOSER_INPUT = "textarea[data-composer-input]";

export interface ComposerAccess {
  read(): string;
  /** Fails when the host re-created the input between read and write. */
  write(text: string): boolean;
}

/**
 * Web-only bridge to the host composer. The host SDK exposes no draft API, so reading and
 * restoring the composer goes through the one stable attribute it renders: `data-composer-input`.
 */
export function getComposerAccess(): ComposerAccess | undefined {
  const input = findComposerInput();
  if (!input) return undefined;
  return {
    read: () => input.value ?? "",
    write: (text: string) => writeComposerValue(input, text),
  };
}

/** Why the composer bridge did or did not resolve; surfaced through the diagnose helper. */
export interface ComposerDiagnosis {
  platform: string;
  total: number;
  visible: number;
  filled: number;
}

export interface ComposerCandidate {
  value?: string;
  clientWidth: number;
  clientHeight: number;
}

/**
 * Picks the composer the user is actually typing in. A filled box wins; otherwise the first
 * visible one is taken. Archived conversations keep an empty composer mounted, and picking that
 * would silently read the wrong draft.
 */
export function pickComposerInput<T extends ComposerCandidate>(
  candidates: ArrayLike<T>,
): T | undefined {
  let empty: T | undefined;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.clientWidth <= 0 || candidate.clientHeight <= 0) continue;
    if ((candidate.value ?? "").trim().length > 0) return candidate;
    empty ??= candidate;
  }
  return empty;
}

export function summarizeComposer(candidates: ArrayLike<ComposerCandidate>) {
  let visible = 0;
  let filled = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.clientWidth <= 0 || candidate.clientHeight <= 0) continue;
    visible += 1;
    if ((candidate.value ?? "").trim().length > 0) filled += 1;
  }
  return { total: candidates.length, visible, filled };
}

export function diagnoseComposer(): ComposerDiagnosis {
  if (Platform.OS !== "web" || typeof document === "undefined")
    return { platform: Platform.OS ?? "unknown", total: 0, visible: 0, filled: 0 };
  return { platform: Platform.OS ?? "unknown", ...summarizeComposer(collect()) };
}

function collect(): ArrayLike<Element> {
  return document.body.querySelectorAll(COMPOSER_INPUT);
}

function findComposerInput(): Element | undefined {
  if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
  return pickComposerInput(collect());
}

function writeComposerValue(input: Element, text: string): boolean {
  const view = window as unknown as WindowConstructors;
  const descriptor =
    view.HTMLTextAreaElement &&
    Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, "value");
  // React tracks the previous value on the node, so only the native setter registers as an edit.
  if (!descriptor?.set || !view.Event) return false;
  (descriptor.set as (value: string) => void).call(input, text);
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
  input.focus();
  input.setSelectionRange(text.length, text.length);
  return true;
}
