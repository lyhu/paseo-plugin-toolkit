import { Platform } from "react-native";
import type { Document, Element, Window } from "../chat-view/dom";
import { createComposerAccess, type ComposerAccess } from "../chat-view/enhance/dom";

declare const document: Document;
declare const window: Window;

const DRAFT_PILL = '[data-testid="composer-import-agent-pill"]';
const COMPOSER_INPUT = "textarea[data-composer-input]";
const DECK_ENTRY_PREFIX = "workspace-deck-entry-";
const DECK_ENTRY_SELECTOR = `[data-testid^="${DECK_ENTRY_PREFIX}"]`;
const MAX_ANCESTOR_DEPTH = 8;

/**
 * Resolves the draft composer for this workspace. Prefer the composer next to the visible import
 * pill; fall back to the only visible composer when the pill is hidden (fullscreen composer).
 */
export function findDraftComposerInput(workspaceId: string): Element | undefined {
  const scope = findScope(workspaceId);
  const pill = visibleDraftPill(scope);
  if (pill) return composerNear(pill);
  return firstVisibleComposer(scope);
}

export function getDraftComposerAccess(workspaceId: string): ComposerAccess | undefined {
  return createComposerAccess(findDraftComposerInput(workspaceId));
}

function findScope(workspaceId: string): Element | undefined {
  if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
  if (!workspaceId) return undefined;
  const suffix = `:${workspaceId}`;
  const entries = document.body.querySelectorAll(DECK_ENTRY_SELECTOR);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const testId = entry?.getAttribute("data-testid") ?? "";
    if (testId.endsWith(suffix)) return entry;
  }
  // Older hosts may not tag workspace decks; the visible pill still identifies the draft.
  return document.body;
}

function visibleDraftPill(scope: Element | undefined): Element | undefined {
  if (!scope) return undefined;
  const pills = scope.querySelectorAll(DRAFT_PILL);
  for (let index = 0; index < pills.length; index += 1) {
    const pill = pills[index];
    if (pill && isVisible(pill)) return pill;
  }
  return undefined;
}

function composerNear(pill: Element): Element | undefined {
  let ancestor = pill.parentElement;
  for (let depth = 0; ancestor && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    const input = ancestor.querySelector(COMPOSER_INPUT);
    if (input && isVisible(input)) return input;
    ancestor = ancestor.parentElement;
  }
  return undefined;
}

function firstVisibleComposer(scope: Element | undefined): Element | undefined {
  if (!scope) return undefined;
  const inputs = scope.querySelectorAll(COMPOSER_INPUT);
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (input && isVisible(input)) return input;
  }
  return undefined;
}

function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}
