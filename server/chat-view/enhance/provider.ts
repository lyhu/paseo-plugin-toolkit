import { endpoint } from "../../models/connection";
import {
  ProviderFailure,
  type EnhanceMessage,
  type EnhanceProvider,
} from "../../../shared/chat-view/enhance";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/** Below the host's fixed 60s plugin RPC timeout so a slow model surfaces as our own error. */
const DEFAULT_TIMEOUT_MS = 20_000;

export function createProvider(config: ProviderConfig): EnhanceProvider {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = endpoint(config.baseUrl);
  return {
    async complete(messages: EnhanceMessage[]): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0.3,
            // Sized for the 200-character body plus the two short sibling blocks. CJK costs
            // roughly 1.5 tokens per character, and a budget well past the target is what let a
            // runaway completion reach the parser before the ceiling could trim it.
            max_tokens: 600,
            stream: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok)
          throw new ProviderFailure("http", "Model service request failed", response.status);
        const payload = (await response.json()) as {
          choices?: { finish_reason?: string; message?: { content?: string } }[];
        };
        const choice = payload.choices?.[0];
        // A length-stopped completion is a half-written prompt, not a short one. Say so instead of
        // delivering the fragment as if it were the whole rewrite.
        if (choice?.finish_reason === "length") throw new ProviderFailure("truncatedOutput", "");
        const content = choice?.message?.content?.trim();
        if (!content) throw new ProviderFailure("emptyResponse", "");
        return content;
      } catch (error) {
        // The detail is the timeout itself: the reader is told how long it waited.
        if (controller.signal.aborted || isAbort(error))
          throw new ProviderFailure("timeout", String(timeoutMs));
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
}
