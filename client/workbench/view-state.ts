import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  loadDevicePreferences,
  readDevicePreference,
  writeDevicePreference,
} from "../project-tree/device";

const schema = z.object({
  tab: z.string().default("all"),
  host: z.string().default("all"),
  scenario: z.enum(["all", "dev", "ops", "review"]).default("all"),
  query: z.string().default(""),
  scope: z.enum(["all", "project", "workspace", "session", "host", "memory"]).default("all"),
  filtersOpen: z.boolean().default(false),
  hostView: z.enum(["grid", "list"]).default("grid"),
});
type ViewState = z.infer<typeof schema>;
const defaults = schema.parse({});
function read(key: string): ViewState {
  try {
    const parsed = schema.safeParse(JSON.parse(readDevicePreference(key) ?? "{}"));
    return parsed.success ? parsed.data : defaults;
  } catch {
    return defaults;
  }
}

/** Browsing state belongs to this device and configuration Host, independently of shared groups. */
export function useWorkbenchViewState(hostId: string) {
  const key = `${hostId}.workbench.view`;
  const edits = useRef<Partial<ViewState>>({});
  const [snapshot, setSnapshot] = useState(() => ({ key, value: read(key), ready: false }));
  useEffect(() => {
    let active = true;
    edits.current = {};
    void loadDevicePreferences([key])
      .then(() => {
        if (active) setSnapshot({ key, value: { ...read(key), ...edits.current }, ready: true });
      })
      .catch(() => {
        // Keep the usable in-memory view without replacing preferences we could not read.
      });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (snapshot.key === key && snapshot.ready)
      writeDevicePreference(key, JSON.stringify(snapshot.value));
  }, [key, snapshot]);
  const update = useCallback(
    (patch: Partial<ViewState>) => {
      edits.current = { ...edits.current, ...patch };
      setSnapshot((current) => ({
        key,
        value: { ...(current.key === key ? current.value : defaults), ...patch },
        ready: current.key === key && current.ready,
      }));
    },
    [key],
  );
  return [
    snapshot.key === key ? snapshot.value : defaults,
    update,
    snapshot.key === key && snapshot.ready,
  ] as const;
}
