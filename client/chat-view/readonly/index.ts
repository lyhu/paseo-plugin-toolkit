import type { FeatureDomain } from "../feature";
import { setupReadonlyStyles } from "./dom";

/**
 * Marks sent user messages read-only by hiding the host's rewind control. There is no per-row work
 * to undo: the stylesheet is the whole contribution, and removing it restores the native control,
 * which is why this domain carries no agent wiring and no React state.
 */
export function createReadonlyDomain(): FeatureDomain<"readonlyMessagesEnabled"> {
  let detach: (() => void) | undefined;
  return {
    settingKey: "readonlyMessagesEnabled",
    setEnabled(enabled) {
      if (enabled === (detach !== undefined)) return;
      if (detach) {
        detach();
        detach = undefined;
        return;
      }
      detach = setupReadonlyStyles();
    },
    dispose() {
      detach?.();
      detach = undefined;
    },
  };
}
