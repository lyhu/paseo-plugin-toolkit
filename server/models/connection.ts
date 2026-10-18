import { z } from "zod";
import type { ModelConnection } from "../../shared/models/contracts";
import { ProviderFailure } from "../../shared/models/failure";
import { LocalizedError } from "../../shared/chat-view/i18n";
import { createChatClient } from "./chat-client";

export { endpoint, validateBaseUrl } from "./chat-client";

function modelError(error: unknown): Error {
  if (!(error instanceof ProviderFailure))
    return error instanceof Error ? error : new Error(String(error));
  switch (error.kind) {
    case "http":
      return new LocalizedError("models.error.http", { status: error.status ?? "?" });
    case "timeout":
      return new LocalizedError("models.error.timeout", {
        seconds: Math.round(Number(error.detail) / 1000),
      });
    case "invalidCatalog":
      return new LocalizedError("models.error.invalidCatalog");
    case "invalidResponse":
      return new LocalizedError("models.error.invalidResponse");
    case "emptyResponse":
      return new LocalizedError("models.error.emptyResponse");
    case "truncatedOutput":
      return new LocalizedError("models.error.truncatedOutput");
    default:
      return new Error(error.message);
  }
}

export async function fetchModels(config: ModelConnection) {
  try {
    return { models: await createChatClient(config).listModels() };
  } catch (error) {
    throw modelError(error);
  }
}

export async function probeModel(config: ModelConnection) {
  const started = Date.now();
  let content: string;
  try {
    ({ content } = await createChatClient(config).complete(
      [
        { role: "system", content: 'Connection test. Reply only with JSON: {"ok":true}' },
        { role: "user", content: 'Return {"ok":true}.' },
      ],
      { maxTokens: 256, json: true },
    ));
  } catch (error) {
    throw modelError(error);
  }
  try {
    const text = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    z.object({ ok: z.literal(true) }).parse(JSON.parse(text));
  } catch {
    throw new LocalizedError("models.error.probeJson");
  }
  return { latencyMs: Date.now() - started };
}
