import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PaseoAgent } from "@getpaseo/client";
import { activitySettings, type ChatViewSettings } from "../../shared/chat-view/settings";
import { createActivityDomain } from "./activity";
import { createEnhanceDomain } from "./enhance";
import type { FeatureDomain } from "./feature";
import { createMermaidDomain } from "./mermaid";
import { setLocalePreference } from "./locale";
import { createReadonlyDomain } from "./readonly";
import { createStickyDomain } from "./sticky";

type SwitchKey =
  | "mermaidEnabled"
  | "compactActivityEnabled"
  | "stickyEnabled"
  | "enhanceEnabled"
  | "readonlyMessagesEnabled";

/**
 * Owns the host settings subscription and the domain fan-out, and nothing else: every domain
 * declares the switch it reads plus how to attach, detach and track agents, so adding a feature
 * means adding a domain to this list. The host requires the entry modules to stay registration
 * wiring, which is why this controller exists at all rather than being inlined into
 * `index.client.tsx`.
 */
export function createFeatureController(
  client: PluginClientContext,
  onSettingsChange: (values: ChatViewSettings) => void,
) {
  const domains: FeatureDomain<SwitchKey>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let generation = 0;
  function apply(values: ChatViewSettings) {
    if (stopped) return;
    generation += 1;
    onSettingsChange(values);
    // The single writer of the running language: every other module reads it from `client/locale`.
    setLocalePreference(values.language);
    for (const domain of domains) domain.setEnabled(values[domain.settingKey]);
  }
  domains.push(
    createMermaidDomain(client),
    createActivityDomain(client),
    createStickyDomain(client, apply),
    createEnhanceDomain(client),
    createReadonlyDomain(),
  );
  // Settings hooks update an open settings page immediately. Polling also covers clients viewing
  // archived conversations, where no composer is mounted to observe settings push updates.
  async function refresh() {
    const started = generation;
    try {
      const result = await client.rpc(settingsRpc(activitySettings.id).read, {});
      if (!stopped && generation === started && result.status === "ready") {
        const parsed = activitySettings.schema.safeParse(result.values);
        if (parsed.success) apply(parsed.data);
      }
    } catch {
      // Keep the current state during a disconnected host; the settings screen reports errors.
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          void refresh();
        }, 2000);
    }
  }
  void refresh();
  return {
    apply,
    registerAgent(agent: PaseoAgent) {
      if (stopped) return;
      for (const domain of domains) domain.registerAgent?.(agent);
    },
    unregisterAgent(agentId: string) {
      if (stopped) return;
      for (const domain of domains) domain.unregisterAgent?.(agentId);
    },
    cleanup() {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const domain of domains) domain.dispose();
    },
  };
}
