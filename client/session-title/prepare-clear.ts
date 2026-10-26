import type { PluginClientContext } from "@getpaseo/plugin/client";
import { readTitle, startTitle, working } from "../../shared/session-title/contracts";
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
  let job = await client.rpc(startTitle, { agentId });
  const jobId = job.id;
  while (working(job)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (signal.aborted) return;
    const latest = (await client.rpc(readTitle, { agentId })).job;
    if (!latest || latest.id !== jobId)
      throw new Error(tr("命名任务已变化，未填入 /clear，请重试。"));
    job = latest;
  }
  if (signal.aborted) return;
  if (job.phase !== "done" || !job.result?.applied)
    throw new Error(tr(job.error ?? "命名未完成，未填入 /clear，请在智能命名中查看记录。"));
  if (composer.read() !== draft || !composer.write("/clear"))
    throw new Error(tr("命名已完成，但输入框已变化，请手动输入 /clear。"));
}
