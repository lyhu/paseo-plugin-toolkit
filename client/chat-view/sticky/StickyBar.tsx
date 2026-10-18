import { useEffect, type RefObject } from "react";
import { Platform } from "react-native";
import { usePaseo } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import type { PaseoApi, PaseoAgentTimelineHandle } from "@getpaseo/client";
import { PromptHistory } from "../../../shared/chat-view/sticky/history";
import { createTimelinePager, type TimelinePage } from "../timeline-pager";
import { getStickyViewport, installStickyMessages } from "./dom";

function createSession(timeline: PaseoAgentTimelineHandle) {
  const history = new PromptHistory();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const pager = createTimelinePager(timeline, {
    apply(page: TimelinePage, reset: boolean) {
      if (reset) history.clear();
      for (const entry of page.entries) history.add(entry.item, entry.timestamp, entry.seqStart);
      return true;
    },
    onChange: emit,
  });
  const subscription = timeline.subscribe(({ event, ...update }) => {
    if (event.type === "replacement" || event.type === "subscription_restored") {
      pager.invalidate(event.type === "replacement" ? event.epoch : undefined);
      history.clear();
      pager.load(true);
      emit();
    } else if (event.type === "timeline" && "timestamp" in update && update.seq !== undefined) {
      if (pager.noteEpoch(update.epoch)) history.clear();
      history.add(event.item, update.timestamp, update.seq);
      // Only prompts change what the bar displays; don't repaint on every token.
      if (event.item.type === "user_message") emit();
    }
  });
  void subscription.ready.then(() => pager.load(true)).catch(() => {});
  let fetchMicrotaskPending = false;
  const scheduleFetchPage = () => {
    if (fetchMicrotaskPending) return;
    fetchMicrotaskPending = true;
    void Promise.resolve().then(() => {
      fetchMicrotaskPending = false;
      pager.load(false);
    });
  };
  return {
    refs: 0,
    latest() {
      return history.latest();
    },
    resolve(rowId: string, messageId: string | null) {
      const prompt = history.resolve(rowId, messageId);
      if (!prompt) scheduleFetchPage();
      return prompt;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      pager.stop();
      fetchMicrotaskPending = false;
      subscription();
      listeners.clear();
      history.clear();
    },
  };
}

const sessions = new WeakMap<PaseoApi, Map<string, ReturnType<typeof createSession>>>();
const viewports = new Map<unknown, { agentId: string; theme: PluginTheme; cleanup: () => void }>();

export function cleanupStickyMessages() {
  for (const viewport of viewports.values()) viewport.cleanup();
  viewports.clear();
}

export function useStickyMessage(
  anchor: RefObject<unknown>,
  agentId: string,
  theme: PluginTheme,
  enabled = true,
) {
  const paseo = usePaseo();
  useEffect(() => {
    if (Platform.OS !== "web" || !anchor.current) return;
    const viewport = getStickyViewport(anchor.current);
    if (!viewport) return;
    const existing = viewports.get(viewport);
    if (!enabled) {
      existing?.cleanup();
      viewports.delete(viewport);
      return;
    }
    if (
      existing?.agentId === agentId &&
      existing.theme.colors.surface2 === theme.colors.surface2 &&
      existing.theme.colors.foreground === theme.colors.foreground &&
      existing.theme.colors.foregroundMuted === theme.colors.foregroundMuted &&
      existing.theme.colors.border === theme.colors.border
    )
      return;
    existing?.cleanup();
    let agents = sessions.get(paseo);
    if (!agents) {
      agents = new Map();
      sessions.set(paseo, agents);
    }
    let session = agents.get(agentId);
    if (!session) {
      session = createSession(paseo.agents.ref(agentId).timeline);
      agents.set(agentId, session);
    }
    session.refs += 1;
    const uninstall = installStickyMessages(
      anchor.current,
      session.resolve,
      {
        background: theme.colors.surface2,
        foreground: theme.colors.foreground,
        muted: theme.colors.foregroundMuted,
        border: theme.colors.border,
      },
      session.subscribe,
      () => {
        cleanup();
        viewports.delete(viewport);
      },
      session.latest,
    );
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      uninstall();
      session.refs -= 1;
      if (session.refs === 0) {
        session.dispose();
        agents.delete(agentId);
      }
    };
    viewports.set(viewport, { agentId, theme, cleanup });
    // The viewport, not a virtualized answer row, owns the decoration and history.
  }, [anchor, agentId, paseo, theme, enabled]);
}
