import { z } from "zod";
import type { ModelConnection } from "../../shared/models/contracts";

export function validateBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("请使用不含凭据的 HTTP(S) API 地址。");
}

async function request(config: ModelConnection, operation: "models" | "test"): Promise<unknown> {
  validateBaseUrl(config.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const url = endpoint(config.baseUrl);
  const apiKey = config.apiKey.trim();
  try {
    const response = await fetch(
      operation === "models" ? url.replace(/\/chat\/completions$/, "/models") : url,
      {
        method: operation === "models" ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: controller.signal,
        ...(operation === "test"
          ? {
              body: JSON.stringify({
                model: config.model,
                stream: false,
                max_tokens: 256,
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: 'Connection test. Reply only with JSON: {"ok":true}' },
                  { role: "user", content: 'Return {"ok":true}.' },
                ],
              }),
            }
          : {}),
      },
    );
    if (!response.ok)
      throw new Error(`模型服务请求失败（HTTP ${response.status}），请检查地址、API Key 和模型。`);
    try {
      return await response.json();
    } catch {
      throw new Error("服务未返回 JSON，请检查 API 地址。");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("模型服务连接超时（20 秒），请重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchModels(config: ModelConnection) {
  const schema = z.object({ data: z.array(z.object({ id: z.string().trim().min(1) })) });
  const result = schema.safeParse(await request(config, "models"));
  if (!result.success) throw new Error("服务返回的模型列表格式不正确，可手动填写模型名称。");
  return {
    models: [...new Set(result.data.data.map((item) => item.id))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export async function probeModel(config: ModelConnection) {
  const started = Date.now();
  const schema = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  });
  const result = schema.safeParse(await request(config, "test"));
  if (!result.success) throw new Error("模型未返回有效文本，请检查模型配置。");
  try {
    const content = result.data.choices[0].message.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    z.object({ ok: z.literal(true) }).parse(JSON.parse(content));
  } catch {
    throw new Error("模型已连接，但未返回要求的 JSON 测试结果。请检查模型是否支持 JSON 输出。");
  }
  return { latencyMs: Date.now() - started };
}

export function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}
