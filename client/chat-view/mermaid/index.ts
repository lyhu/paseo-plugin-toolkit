import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { FeatureDomain } from "../feature";
import { registerMermaid } from "./registration";

/**
 * The Mermaid domain contributes host renderers and one transformer and holds no module-level
 * state, so its detach handle is the whole teardown.
 */
export function createMermaidDomain(client: PluginClientContext): FeatureDomain<"mermaidEnabled"> {
  let detach: (() => void) | undefined;
  return {
    settingKey: "mermaidEnabled",
    setEnabled(enabled) {
      if (enabled === (detach !== undefined)) return;
      if (detach) {
        detach();
        detach = undefined;
        return;
      }
      detach = registerMermaid(client);
    },
    dispose() {
      detach?.();
      detach = undefined;
    },
  };
}
