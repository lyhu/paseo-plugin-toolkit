import type { PluginClientContext } from "@getpaseo/plugin/client";
import { cancelTitle, queueClearTitle } from "../../shared/session-title/contracts";
import { getTitleComposer } from "../web";
import { tr } from "../i18n";

export async function prepareClear(
  client: PluginClientContext,
  agentId: string,
  signal: AbortSignal,
) {
  if (signal.aborted) return;
  const composer = getTitleComposer(agentId);
  if (!composer)
    throw new Error(tr("无法定位当前输入框，请使用 /session-title 命名后手动输入 /clear。"));
  const draft = composer.read();
  const job = await client.rpc(queueClearTitle, { agentId });
  let submitted = false;
  try {
    if (signal.aborted) return;
    if (composer.read() !== draft || !(submitted = await composer.submitClear(signal)))
      throw new Error(tr("未能提交 /clear，请移除附件并确认当前输入框后重试。"));
  } finally {
    if (!submitted) void client.rpc(cancelTitle, { agentId, jobId: job.id }).catch(() => {});
  }
}
