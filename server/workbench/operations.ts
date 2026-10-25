import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { isAbsolute, win32 } from "node:path";
import { randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import {
  creationPayloadSchema,
  creationPlanSchema,
  type CreationPayload,
  type CreationPlan,
} from "../../shared/workbench/operations";
import { writePrivateJsonFile } from "../storage/revisioned-json";

export function createOperationStore(filename: string) {
  const plans: CreationPlan[] = existsSync(filename)
    ? creationPlanSchema.array().parse(JSON.parse(readFileSync(filename, "utf8")))
    : [];
  const persist = () => writePrivateJsonFile(filename, plans);
  for (const plan of plans)
    if (plan.status === "executing") {
      plan.status = "unknown";
      plan.error = "服务重启，执行结果尚未确认；请检查目标资源，不要重复创建";
      plan.revision++;
      persist();
    }
  const copy = (plan: CreationPlan) => structuredClone(plan);
  function get(id: string) {
    const plan = plans.find((item) => item.id === id);
    if (!plan) throw new Error("找不到创建计划");
    return plan;
  }
  function pending(id: string, revision: number) {
    const plan = get(id);
    if (plan.revision !== revision) throw new Error("计划已更新，请刷新后重试");
    if (plan.status !== "pending") throw new Error("该计划已处理，不能重复执行");
    return plan;
  }
  function change(plan: CreationPlan) {
    plan.revision++;
    plan.updatedAt = new Date().toISOString();
    persist();
    return copy(plan);
  }
  return {
    list: () => plans.map(copy),
    get: (id: string) => copy(get(id)),
    prepare(input: CreationPayload, sourceAgentId?: string) {
      const payload = creationPayloadSchema.parse(input);
      if (payload.path && !isAbsolute(payload.path) && !win32.isAbsolute(payload.path))
        throw new Error("目录必须使用目标主机的绝对路径");
      const now = new Date().toISOString();
      const plan: CreationPlan = {
        id: randomUUID(),
        revision: 0,
        payload,
        sourceAgentId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      plans.push(plan);
      persist();
      return copy(plan);
    },
    edit(id: string, revision: number, payload: CreationPayload) {
      const plan = pending(id, revision);
      const parsed = creationPayloadSchema.parse(payload);
      if (parsed.path && !isAbsolute(parsed.path) && !win32.isAbsolute(parsed.path))
        throw new Error("目录必须是绝对路径");
      plan.payload = parsed;
      return change(plan);
    },
    cancel(id: string, revision: number) {
      const plan = pending(id, revision);
      plan.status = "cancelled";
      return change(plan);
    },
    async execute(id: string, revision: number, paseo: PaseoApi) {
      const plan = pending(id, revision);
      plan.status = "executing";
      change(plan);
      let target: PaseoApi | undefined;
      let mutationStarted = false;
      let mutationFailed = false;
      try {
        const hosts = await paseo.hosts.list();
        target =
          plan.payload.serverId === hosts.self.serverId
            ? paseo
            : await paseo.hosts.client(plan.payload.serverId);
        const payload = plan.payload;
        let workspace;
        if (payload.kind === "session") {
          workspace = target.workspaces.ref(payload.workspaceId!);
          if (!(await workspace.refresh())) throw new Error("目标工作区不存在");
        } else {
          if (payload.kind === "project" && target === paseo && !existsSync(payload.path!)) {
            mkdirSync(payload.path!, { mode: 0o700 });
            plan.result = { serverId: payload.serverId, path: payload.path };
            change(plan);
          }
          mutationStarted = true;
          workspace = await target.workspaces.create({
            idempotencyKey: plan.id,
            source: { kind: "directory", path: payload.path!, projectId: payload.projectId },
            title: payload.name,
            onEvent(snapshot) {
              if (snapshot.phase === "failed") mutationFailed = true;
              if (snapshot.workspace && snapshot.phase !== "accepted") {
                plan.result = {
                  serverId: payload.serverId,
                  workspaceId: snapshot.workspace.id,
                  projectId: snapshot.workspace.projectId,
                  path: snapshot.workspace.workspaceDirectory ?? payload.path,
                };
                change(plan);
              }
            },
          });
          plan.result = {
            serverId: payload.serverId,
            workspaceId: workspace.id,
            projectId: workspace.projectId ?? undefined,
            path: workspace.directory ?? payload.path,
          };
          change(plan);
        }
        if (payload.provider) {
          mutationStarted = true;
          mutationFailed = false;
          const agent = await workspace.agents.create({
            idempotencyKey: `${plan.id}-agent`,
            config: { provider: payload.provider },
            title: payload.name,
            prompt: payload.prompt,
            onEvent(snapshot) {
              if (snapshot.phase === "failed") mutationFailed = true;
              if (snapshot.agent && snapshot.phase !== "accepted") {
                plan.result = {
                  ...plan.result,
                  serverId: payload.serverId,
                  workspaceId: workspace.id,
                  projectId: workspace.projectId ?? undefined,
                  agentId: snapshot.agent.id,
                };
                change(plan);
              }
            },
          });
          plan.result = {
            ...plan.result,
            serverId: payload.serverId,
            workspaceId: workspace.id,
            projectId: workspace.projectId ?? undefined,
            agentId: agent.id,
          };
        }
        plan.status = "completed";
      } catch (error) {
        plan.error = error instanceof Error ? error.message : String(error);
        plan.status = plan.result
          ? "partial"
          : mutationStarted && !mutationFailed
            ? "unknown"
            : "failed";
      } finally {
        if (target && target !== paseo) target.dispose();
      }
      return change(plan);
    },
  };
}
export type OperationStore = ReturnType<typeof createOperationStore>;
