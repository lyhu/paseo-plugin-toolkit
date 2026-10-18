import type { PaseoAgentTimelineHandle } from "@getpaseo/client";

export type TimelinePage = Awaited<ReturnType<PaseoAgentTimelineHandle["refetch"]>>;

const PAGE_SIZE = 200;

export interface TimelinePagerHandlers {
  /**
   * Applies one read page. `reset` is true when the session epoch changed, so anything applied
   * earlier in this window is stale and must be dropped. Returns whether the applied data changed.
   */
  apply(page: TimelinePage, reset: boolean): boolean;
  /** Runs when a page changed what the caller holds. */
  onChange(): void;
}

export interface TimelinePager {
  /** Reads the newest window (tail) or the page before the stored cursor, coalescing concurrent calls. */
  load(tail?: boolean): void;
  /** Forgets the window and discards pages that are already in flight: a session was replaced. */
  invalidate(epoch?: string): void;
  /** Records the epoch reported by a streamed item; true means the session behind it changed. */
  noteEpoch(epoch: string | undefined): boolean;
  stop(): void;
  resume(): void;
}

/**
 * Paginates a projected agent timeline. Both the activity groups and the sticky prompt bar read the
 * same handle the same way, and both need the same epoch and generation guards against stale pages,
 * so the window bookkeeping lives here instead of in each reader.
 */
export function createTimelinePager(
  timeline: PaseoAgentTimelineHandle,
  handlers: TimelinePagerHandlers,
): TimelinePager {
  let cursor: TimelinePage["startCursor"] | null = null;
  let older = true;
  let epoch: string | undefined;
  let generation = 0;
  let fetching = false;
  let stopped = false;
  let pendingTail = false;
  let pendingOlder = false;

  const load = async (tail = false): Promise<void> => {
    if (stopped) return;
    if (fetching) {
      pendingTail ||= tail;
      if (!tail) pendingOlder = true;
      return;
    }
    if (!tail && !older) return;
    fetching = true;
    const currentGeneration = generation;
    const pageCursor = tail ? null : cursor;
    try {
      const page = await timeline.refetch({
        direction: pageCursor ? "before" : "tail",
        ...(pageCursor ? { cursor: pageCursor } : {}),
        projection: "projected",
        limit: PAGE_SIZE,
      });
      // A replaced session makes an in-flight page stale; a failed page never applies. Data that
      // merely scrolled out of the viewport stays valid and is kept.
      if (stopped || generation !== currentGeneration || page.error) return;
      const reset = epoch !== undefined && epoch !== page.epoch;
      epoch = page.epoch;
      if (reset) {
        cursor = null;
        older = true;
      }
      if (handlers.apply(page, reset)) handlers.onChange();
      // A tail read only advances the cursor while the window is empty: after paginating backwards
      // it must keep reporting the oldest loaded cursor, or older pages become unreachable.
      if (!cursor || !tail) {
        cursor = page.startCursor;
        older = page.hasOlder && cursor !== null;
      }
    } catch {
      // Keep what is already applied: detail cards stay usable while disconnected.
    } finally {
      fetching = false;
      if (pendingTail && !stopped) {
        pendingTail = false;
        void load(true);
      } else if (pendingOlder && !stopped && older) {
        pendingOlder = false;
        void load(false);
      }
    }
  };

  return {
    load(tail) {
      void load(tail);
    },
    invalidate(nextEpoch) {
      generation++;
      epoch = nextEpoch;
      cursor = null;
      older = true;
    },
    noteEpoch(nextEpoch) {
      if (nextEpoch === undefined) return false;
      if (epoch === undefined || epoch === nextEpoch) {
        epoch = nextEpoch;
        return false;
      }
      generation++;
      epoch = nextEpoch;
      cursor = null;
      older = true;
      return true;
    },
    stop() {
      stopped = true;
    },
    resume() {
      stopped = false;
    },
  };
}
