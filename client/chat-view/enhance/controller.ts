import { Platform } from "react-native";
import { copyText } from "@getpaseo/plugin/client/react-native";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { currentLocale, tr } from "../locale";
import {
  enhancePromptRpc,
  MAX_ENHANCED_CHARS,
  type EnhanceResult,
} from "../../../shared/chat-view/enhance";
import { diagnoseComposer, getComposerAccess } from "./dom";
import { enhanceState } from "./state";

export interface EnhanceTarget {
  agentId: string;
  workspaceId: string;
}

const log = (stage: string, detail?: unknown) =>
  console.warn(`[Prompt enhance] ${stage}`, detail ?? "");

/** Distinguishes "no composer on this platform" from "the composer is empty": the fixes differ. */
interface ComposerRead {
  text: string;
  found: boolean;
}

function readComposer(): ComposerRead {
  const access = getComposerAccess();
  if (!access) {
    log("composer-bridge-unavailable", diagnoseComposer());
    return { text: "", found: false };
  }
  return { text: access.read().trim(), found: true };
}

/** Raises a message the user can act on, after logging the same detail for the console. */
export function requireComposerText(): string {
  const read = readComposer();
  if (!read.found)
    throw new Error(
      Platform.OS === "web" ? tr("enhance.noComposerWeb") : tr("enhance.noComposerNative"),
    );
  if (!read.text) throw new Error(tr("enhance.emptyPrompt"));
  return read.text;
}

/**
 * A failed enhancement must reach the user: the host surfaces a rejected press as a toast, so
 * outcomes that cannot be delivered throw with a readable reason instead of failing silently.
 * Returns a note when the result landed but was shortened, so the caller can say so.
 */
export async function runEnhance(
  client: PluginClientContext,
  target: EnhanceTarget,
  raw: string,
): Promise<string | null> {
  enhanceState.begin(target.agentId);
  log("request", { agentId: target.agentId, chars: raw.length });
  try {
    const result = await client.rpc(enhancePromptRpc, {
      raw,
      agentId: target.agentId,
      workspaceId: target.workspaceId,
      // Plugin-authored text in the result (reasons, probe messages) follows the caller's language.
      locale: currentLocale(),
    });
    log("result", {
      applied: result.applied,
      degraded: result.degraded,
      reason: result.degradedReason,
    });
    const note = deliver(target, raw, result);
    log("delivered", { agentId: target.agentId, truncated: note !== null });
    return note;
  } catch (error) {
    log("failed", error);
    throw error;
  } finally {
    enhanceState.end(target.agentId);
  }
}

/** Restores the pre-enhancement text. Returns false when there is nothing to restore. */
export function undoEnhance(agentId: string): boolean {
  const snapshot = enhanceState.snapshot(agentId);
  if (!snapshot) return false;
  const access = getComposerAccess();
  if (!access?.write(snapshot.original)) {
    log("undo-failed", { agentId });
    return false;
  }
  enhanceState.clear(agentId);
  log("undo", { agentId });
  return true;
}

/** Truncation is a shortened delivery, not a failure, so it is reported rather than thrown. */
function deliver(target: EnhanceTarget, original: string, result: EnhanceResult): string | null {
  if (result.degraded) throw new Error(result.degradedReason);
  if (!result.applied) throw new Error(result.degradedReason || tr("enhance.unchanged"));
  const access = getComposerAccess();
  if (access?.write(result.enhanced)) {
    enhanceState.record(target.agentId, { original, enhanced: result.enhanced, at: Date.now() });
    return result.truncated
      ? tr("enhance.truncatedNote", {
          summary: result.deltaSummary,
          limit: MAX_ENHANCED_CHARS,
        }).trim()
      : null;
  }
  // Native clients expose no composer draft API, so the result goes to the clipboard instead.
  void copyText(result.enhanced);
  log("clipboard-fallback", { agentId: target.agentId });
  throw new Error(tr("enhance.clipboardFallback"));
}
