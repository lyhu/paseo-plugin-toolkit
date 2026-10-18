import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { resolveLocale, t } from "../../../shared/chat-view/i18n";
import {
  enhancePromptRpc,
  notConfiguredResult,
  runEnhancement,
  unchangedResult,
} from "../../../shared/chat-view/enhance";
import type { ChatViewSettings } from "../../../shared/chat-view/settings";
import { collectEnvironmentProfile } from "./probe";
import { createProvider } from "./provider";

import type { ModelStore } from "../../models/storage";

export function registerEnhance(
  server: PluginServerContext,
  readSettings: () => Promise<ChatViewSettings>,
  models: ModelStore,
): void {
  server.handle(enhancePromptRpc, async (input, context) => {
    const settings = await readSettings();
    // Resolved once: every reason string this call may return is written in the caller's language.
    const locale = resolveLocale(input.locale);
    if (!settings.enhanceEnabled)
      return unchangedResult(input.raw, t(locale, "enhance.reason.disabled"));
    const { baseUrl, apiKey, model } = models.resolve(input.workspaceId);
    if (!baseUrl || !model) return notConfiguredResult(input.raw, locale);
    const profile = collectEnvironmentProfile(
      await resolveRoot(context, input.workspaceId, locale),
    );
    return runEnhancement({
      raw: input.raw,
      profile,
      locale,
      provider: createProvider({ baseUrl, apiKey, model }),
    });
  });
}

async function resolveRoot(
  context: PluginHandlerContext,
  workspaceId: string,
  locale: "zh-CN" | "en-US",
): Promise<string> {
  const workspace = await context.paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace) throw new Error(t(locale, "enhance.reason.workspaceUnavailable"));
  return workspace.workspaceDirectory;
}
