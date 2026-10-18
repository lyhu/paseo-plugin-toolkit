import type { EnhanceMessage, EnhanceProvider } from "../../../shared/chat-view/enhance";
import { createChatClient } from "../../models/chat-client";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/** Below the host's fixed 60s plugin RPC timeout so a slow model surfaces as our own error. */
const DEFAULT_TIMEOUT_MS = 20_000;

export function createProvider(config: ProviderConfig): EnhanceProvider {
  const client = createChatClient(config);
  return {
    async complete(messages: EnhanceMessage[]): Promise<string> {
      const completion = await client.complete(messages, {
        timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        temperature: 0.3,
        // Sized for the 200-character body plus the two short sibling blocks. CJK costs
        // roughly 1.5 tokens per character, and a budget well past the target is what let a
        // runaway completion reach the parser before the ceiling could trim it.
        maxTokens: 600,
      });
      return completion.content;
    },
  };
}
