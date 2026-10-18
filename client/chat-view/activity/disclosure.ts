import { useMemo, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
import type { PaseoApi } from "@getpaseo/client";

function createDisclosure() {
  let expanded: boolean | undefined;
  const listeners = new Set<() => void>();
  return {
    snapshot: () => expanded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(value: boolean) {
      if (expanded === value) return;
      expanded = value;
      for (const listener of listeners) listener();
    },
  };
}
let disclosures = new WeakMap<PaseoApi, Map<string, ReturnType<typeof createDisclosure>>>();
export function cleanupActivityDisclosure() {
  disclosures = new WeakMap();
}

/** Retain explicit choices across virtualized row remounts, scoped to the host connection. */
export function useActivityDisclosure(agentId: string, rowId: string) {
  const paseo = usePaseo();
  const state = useMemo(() => {
    let rows = disclosures.get(paseo);
    if (!rows) {
      rows = new Map();
      disclosures.set(paseo, rows);
    }
    const key = JSON.stringify([agentId, rowId]);
    let row = rows.get(key);
    if (!row) {
      row = createDisclosure();
      rows.set(key, row);
    }
    return row;
  }, [paseo, agentId, rowId]);
  return [
    useSyncExternalStore(state.subscribe, state.snapshot, state.snapshot),
    state.set,
  ] as const;
}
