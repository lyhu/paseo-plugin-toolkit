import type { PluginClientContext } from "@getpaseo/plugin/client";
import { cancelTitle, queueClearTitle } from "../../shared/session-title/contracts";
import { getFocusedComposer, getTitleComposer, type TitleComposer } from "../web";
import { tr } from "../i18n";

/**
 * The agent's composer, located beside its pill when the host renders both in one pane, and
 * otherwise through the plugin API: focusing the composer is what proves which agent it belongs
 * to when the pill sits outside the pane.
 */
async function locateComposer(
  client: PluginClientContext,
  agentId: string,
  signal: AbortSignal,
): Promise<TitleComposer | undefined> {
  const anchored = getTitleComposer(agentId);
  if (anchored) return anchored;
  if (signal.aborted) return undefined;
  // COMPAT(paseo-0.15): hosts before 0.16 expose no composer API, so the pill anchor stays the only path.
  if (typeof client.composers !== "function") return undefined;
  const [composer] = client.composers({ agentId });
  if (!composer) return undefined;
  try {
    await composer.focus();
  } catch {
    return undefined;
  }
  return signal.aborted ? undefined : getFocusedComposer();
}

export async function prepareClear(
  client: PluginClientContext,
  agentId: string,
  signal: AbortSignal,
) {
  if (signal.aborted) return;
  const composer = await locateComposer(client, agentId, signal);
  if (!composer)
    throw new Error(tr("无法定位当前输入框，请使用 /session-title 命名后手动输入 /clear。"));
  if (signal.aborted) return;
  const draft = composer.read();
  const job = await client.rpc(queueClearTitle, { agentId });
  let submitted = false;
  try {
    if (signal.aborted) return;
    if (composer.read() !== draft)
      throw new Error(tr("当前输入内容已变化，已取消归档新建，请重试。"));
    if (!(submitted = await composer.submitClear(signal)))
      throw new Error(tr("未能提交 /clear，请确认当前输入框后重试。"));
  } finally {
    if (!submitted) void client.rpc(cancelTitle, { agentId, jobId: job.id }).catch(() => {});
  }
}
