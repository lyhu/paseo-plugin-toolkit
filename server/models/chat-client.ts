import { z } from "zod";
import type { ModelConnection } from "../../shared/models/contracts";
import { ProviderFailure } from "../../shared/models/failure";
import { LocalizedError } from "../../shared/chat-view/i18n";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletion {
  content: string;
  finishReason?: string;
}

export interface CompleteOptions {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  /** Ask OpenAI-compatible services for a JSON object response. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface ChatClient {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<ChatCompletion>;
  listModels(options?: { timeoutMs?: number }): Promise<string[]>;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
});
const catalogSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1) })),
});

export function validateBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new LocalizedError("models.error.baseUrl");
}

export function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * One OpenAI-compatible transport: endpoint, auth, timeout, response envelope and error
 * redaction live here. Features keep their own prompts, retries and failure wording.
 */
export function createChatClient(config: ModelConnection): ChatClient {
  validateBaseUrl(config.baseUrl);
  const url = endpoint(config.baseUrl);
  const apiKey = config.apiKey.trim();
  const headers = {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };

  async function request(
    target: string,
    init: RequestInit,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(target, { ...init, headers, signal: controller.signal });
      // Provider error bodies can echo credentials or prompts; never return them through RPC.
      if (!response.ok)
        throw new ProviderFailure("http", "Model service request failed", response.status);
      try {
        return await response.json();
      } catch {
        throw new ProviderFailure("invalidResponse", "json");
      }
    } catch (error) {
      if (controller.signal.aborted)
        throw new ProviderFailure(signal?.aborted ? "aborted" : "timeout", String(timeoutMs));
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  return {
    async complete(messages, options = {}) {
      const payload = await request(
        url,
        {
          method: "POST",
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: false,
            ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
            ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
            ...(options.json ? { response_format: { type: "json_object" } } : {}),
          }),
        },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options.signal,
      );
      const parsed = completionSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderFailure("invalidResponse", "completion");
      const choice = parsed.data.choices[0];
      if (choice.finish_reason === "length") throw new ProviderFailure("truncatedOutput", "");
      const content = choice.message.content?.trim() ?? "";
      if (!content) throw new ProviderFailure("emptyResponse", "");
      return { content, finishReason: choice.finish_reason ?? undefined };
    },
    async listModels(options = {}) {
      const payload = await request(
        url.replace(/\/chat\/completions$/, "/models"),
        { method: "GET" },
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const parsed = catalogSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderFailure("invalidCatalog", "catalog");
      return [...new Set(parsed.data.data.map((item) => item.id))].sort((a, b) =>
        a.localeCompare(b),
      );
    },
  };
}
