import { useSyncExternalStore } from "react";

/**
 * Latest-marker writes happen while rendering the row that owns them, so notifying subscribers
 * inline would update sibling components mid-render. Defer and coalesce instead: one microtask
 * wakes every subscriber once, no matter how many rows marked during the commit.
 */
function createMarkerNotifier() {
  const listeners = new Set<() => void>();
  let scheduled = false;
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    schedule() {
      if (scheduled) return;
      scheduled = true;
      // Deferred to a microtask: this module targets React Native too, where queueMicrotask and the
      // DOM lib are both unavailable.
      void Promise.resolve().then(() => {
        scheduled = false;
        for (const listener of listeners) listener();
      });
    },
  };
}

/** Both markers share one flush, so a commit that marks reasoning and a tool call costs one wake-up. */
const markerNotifier = createMarkerNotifier();

/**
 * Highest timestamp seen per agent, so a row can tell whether it is the newest activity of its
 * agent on screen.
 */
export function createLatestMarker() {
  const timestamps = new Map<string, number>();
  return {
    snapshot: (agentId: string) => timestamps.get(agentId) ?? 0,
    subscribe: markerNotifier.subscribe,
    /** Older timestamps never win: a replayed history must not move the marker backwards. */
    mark(agentId: string, timestamp: number) {
      if (timestamp <= (timestamps.get(agentId) ?? 0)) return;
      timestamps.set(agentId, timestamp);
      markerNotifier.schedule();
    },
  };
}

export type LatestMarker = ReturnType<typeof createLatestMarker>;

/** True while the row is active, and afterwards only for the row holding the newest timestamp. */
export function useIsLatestMarker(
  marker: LatestMarker,
  agentId: string,
  timestamp: Date,
  active: boolean,
): boolean {
  const itemTime = timestamp.getTime();
  if (active || itemTime > marker.snapshot(agentId)) marker.mark(agentId, itemTime);

  const latestTime = useSyncExternalStore(
    marker.subscribe,
    () => marker.snapshot(agentId),
    () => 0,
  );
  return active || (latestTime > 0 && itemTime >= latestTime);
}
