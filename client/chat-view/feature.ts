import type { ChatViewSettings } from "../../shared/chat-view/settings";
import type { PaseoAgent } from "@getpaseo/client";

/**
 * A feature domain's whole contract with the rest of the plugin: which host setting drives it, how
 * to attach or detach its contributions, and how to release module-level state on teardown. The
 * controller in `features.ts` holds no knowledge of any individual domain beyond these calls.
 */
export interface FeatureDomain<TKey extends keyof ChatViewSettings> {
  /** The host setting this domain reads; the controller uses it to index the settings object. */
  readonly settingKey: TKey;
  /** Attach or detach the domain's host contributions to match a switch value. Must be idempotent. */
  setEnabled(enabled: boolean): void;
  /**
   * Agent-scoped contributions (composer pills), for domains that carry them. The controller fans
   * agent updates out to every domain; domains without agent wiring simply omit these.
   */
  registerAgent?(agent: PaseoAgent): void;
  unregisterAgent?(agentId: string): void;
  /** Release everything the domain cannot reach from a detach handle. Called once, on teardown. */
  dispose(): void;
}
