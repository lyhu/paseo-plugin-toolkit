import { useState } from "react";
import { View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Action, Card, Copy, Field, Row } from "./components";
import type { WorkbenchModel } from "./types";
import { tr } from "../i18n";

export function CreationPlans({
  model,
  navigation,
  run,
  pending,
}: {
  model: WorkbenchModel;
  navigation?: PluginScreenProps["navigation"];
  run(task: () => Promise<unknown>): void;
  pending: boolean;
}) {
  const [planEdit, setPlanEdit] = useState<{
    id: string;
    title: string;
    serverId: string;
    path: string;
  } | null>(null);
  return (
    <View style={{ gap: 12 }}>
      {model.plans.map((plan) => (
        <Card key={plan.id} accent>
          <Row between>
            <Copy strong>{plan.title}</Copy>
            <Copy muted>
              {tr(
                (
                  {
                    pending: "待确认",
                    executing: "正在创建",
                    completed: "已完成",
                    cancelled: "已取消",
                    failed: "创建失败",
                    partial: "部分完成",
                    unknown: "结果待核实",
                  } as Record<string, string>
                )[plan.status] ?? plan.status,
              )}
            </Copy>
          </Row>
          <Copy muted>
            {tr(
              (
                {
                  project: "创建项目",
                  workspace: "创建工作区",
                  session: "创建会话",
                } as Record<string, string>
              )[plan.kind] ?? plan.kind,
            )}{" "}
            · {model.hosts.find((h) => h.id === plan.serverId)?.name ?? plan.serverId}
          </Copy>
          {plan.path && <Copy>{plan.path}</Copy>}
          {plan.projectId && (
            <Copy muted>
              {tr("项目")}:{" "}
              {model.projects.find((project) =>
                project.instances.some(
                  (instance) =>
                    instance.serverId === plan.serverId && instance.projectId === plan.projectId,
                ),
              )?.name ?? plan.projectId}
            </Copy>
          )}
          {plan.workspaceId && (
            <Copy muted>
              {tr("工作区")}:{" "}
              {model.workspaces.find(
                (workspace) =>
                  workspace.serverId === plan.serverId && workspace.id === plan.workspaceId,
              )?.name ?? plan.workspaceId}{" "}
              · {plan.workspaceId}
            </Copy>
          )}
          {plan.provider && <Copy muted>Provider: {plan.provider}</Copy>}
          {plan.steps?.map((step, index) => (
            <Copy key={index}>
              {index + 1}. {step}
            </Copy>
          ))}
          {plan.error && <Copy danger>{plan.error}</Copy>}
          {planEdit?.id === plan.id && (
            <View style={{ gap: 10 }}>
              <Field
                label={tr("标题")}
                value={planEdit.title}
                onChangeText={(title) => setPlanEdit({ ...planEdit, title })}
              />
              <Field
                label={tr("路径")}
                value={planEdit.path}
                onChangeText={(path) => setPlanEdit({ ...planEdit, path })}
              />
              <Row>
                {model.hosts.map((h) => (
                  <Action
                    key={h.id}
                    selected={planEdit.serverId === h.id}
                    onPress={() => setPlanEdit({ ...planEdit, serverId: h.id })}
                  >
                    {h.name}
                  </Action>
                ))}
              </Row>
              <Action
                disabled={pending}
                onPress={() =>
                  run(async () => {
                    await model.editPlan?.(plan, planEdit);
                    setPlanEdit(null);
                  })
                }
              >
                {tr("保存修改")}
              </Action>
              <Action onPress={() => setPlanEdit(null)}>{tr("取消修改")}</Action>
            </View>
          )}
          {plan.status === "pending" && (
            <Row>
              <Action
                primary
                disabled={!model.editable || pending}
                onPress={() => run(() => model.executePlan(plan.id, plan.revision))}
              >
                {tr("确认并执行")}
              </Action>
              {model.editPlan && (
                <Action
                  disabled={!model.editable || pending}
                  onPress={() =>
                    setPlanEdit({
                      id: plan.id,
                      title: plan.title,
                      path: plan.path ?? "",
                      serverId: plan.serverId,
                    })
                  }
                >
                  {tr("修改")}
                </Action>
              )}
              <Action
                disabled={!model.editable || pending}
                onPress={() => run(() => model.cancelPlan(plan.id, plan.revision))}
              >
                {tr("取消方案")}
              </Action>
            </Row>
          )}
          {plan.result && (
            <Action
              disabled={!navigation}
              onPress={() => {
                if (plan.result?.agentId)
                  navigation?.openAgent({
                    serverId: plan.result.serverId,
                    agentId: plan.result.agentId,
                  });
                else if (plan.result?.workspaceId)
                  navigation?.openWorkspace({
                    serverId: plan.result.serverId,
                    workspaceId: plan.result.workspaceId,
                  });
              }}
            >
              {tr("打开结果")}
            </Action>
          )}
        </Card>
      ))}
    </View>
  );
}
