import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { initializePersonalAI } from "../../shared/workbench/ai";
import { Action, Copy, Empty, Field, Row, WorkbenchTheme } from "./components";
import { MemoryLibrary, SkillsLibrary } from "./library";
import { CreationPlans } from "./creation-plans";
import type { WorkbenchModel } from "./types";
import { tr, useLocale } from "../i18n";
import { openWorkbenchFile } from "../web";

export function useKnowledgeSpaceHeader(client: PluginClientContext, ai: WorkbenchModel["ai"]) {
  const locale = useLocale();
  useEffect(() => {
    if (!ai.initialized || !ai.workspaceId) return;
    const workspaceId = ai.workspaceId;
    const header = client.addHeaderButton({
      id: "knowledge-context",
      workspaceId,
      button: {
        title: tr("技能与记忆"),
        icon: "Brain",
        behavior: {
          kind: "action",
          onPress: () =>
            client.openPanel("knowledge-context", { workspaceId, location: "explorer" }),
        },
      },
    });
    return () => header.remove();
  }, [client, ai.initialized, ai.workspaceId, ai.serverId, locale]);
}

export function KnowledgeSpaceEntry(props: PluginScreenProps & { client: PluginClientContext }) {
  useLocale();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(true);
  const busy = useRef(false);
  const open = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (!props.navigation) throw new Error(tr("请更新 Paseo 后打开知行空间。"));
      const ai = await props.client.rpc(initializePersonalAI, {});
      if (!ai.serverId || !ai.workspaceId) throw new Error(tr("知行空间尚未准备好，请重试。"));
      if (active.current)
        props.navigation.openWorkspace({ serverId: ai.serverId, workspaceId: ai.workspaceId });
    } catch (cause) {
      if (active.current) setError(String(cause));
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  useEffect(() => {
    active.current = true;
    void open();
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <WorkbenchTheme.Provider value={props.theme}>
      <View
        style={{
          flex: 1,
          padding: props.layout.compact ? 16 : 24,
          gap: 16,
          backgroundColor: props.theme.colors.surface0,
        }}
      >
        <Copy strong size={22}>
          {tr("知行空间")}
        </Copy>
        <Copy muted>{tr("正在打开原生工作区…")}</Copy>
        {!!error && <Copy danger>{error}</Copy>}
        {!!error && (
          <Action
            disabled={pending}
            onPress={() => {
              void open();
            }}
          >
            {tr("重试")}
          </Action>
        )}
      </View>
    </WorkbenchTheme.Provider>
  );
}

export function KnowledgeContextPanel(
  props: PluginWorkspacePanelProps & { model: WorkbenchModel },
) {
  useLocale();
  const { model } = props;
  const [tab, setTab] = useState("skills");
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = (task: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    void task()
      .catch((cause) => setError(String(cause)))
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  };
  const belongs =
    model.ai.initialized &&
    props.host.id === model.ai.serverId &&
    props.workspaceId === model.ai.workspaceId;
  return (
    <WorkbenchTheme.Provider value={props.theme}>
      <ScrollView
        style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
        contentContainerStyle={{ padding: 14, gap: 14 }}
      >
        <Copy strong size={18}>
          {tr("知行上下文")}
        </Copy>
        {!belongs ? (
          <Empty>{tr("请在知行空间工作区中打开此面板。")}</Empty>
        ) : (
          <>
            <Copy muted size={12}>
              {tr("固定工作区，工作台内不提供删除或移除操作。")}
            </Copy>
            <Row between>
              <Copy strong size={13}>
                {tr("参考项目")}
              </Copy>
              <Action
                compact
                quiet
                disabled={!model.editable || pending}
                onPress={() => setReferenceOpen(!referenceOpen)}
              >
                {model.ai.referenceProject?.name ?? tr("仅个人记忆")}
              </Action>
            </Row>
            {referenceOpen && (
              <View style={{ gap: 8 }}>
                <Copy muted size={12}>
                  {tr("个人记忆始终可用；选择项目后会加入该项目已确认的记忆。")}
                </Copy>
                <Field value={query} onChangeText={setQuery} placeholder={tr("搜索项目")} />
                <ScrollView style={{ maxHeight: 180 }}>
                  <Action
                    compact
                    quiet
                    disabled={pending}
                    onPress={() =>
                      run(async () => {
                        await model.setAIReference();
                        setReferenceOpen(false);
                      })
                    }
                  >
                    {tr("仅个人记忆")}
                  </Action>
                  {model.projects
                    .filter(
                      (p) =>
                        !p.system &&
                        `${p.name} ${p.instances.map((i) => i.path).join(" ")}`
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                    )
                    .map((project) => (
                      <Action
                        key={project.id}
                        compact
                        quiet
                        disabled={pending}
                        onPress={() =>
                          run(async () => {
                            await model.setAIReference({
                              id: project.id,
                              name: project.name,
                              instances: project.instances.map(({ serverId, projectId, path }) => ({
                                serverId,
                                projectId,
                                path,
                              })),
                            });
                            setReferenceOpen(false);
                          })
                        }
                      >
                        {project.name}
                      </Action>
                    ))}
                </ScrollView>
              </View>
            )}
            <Copy muted size={12}>
              {tr("更新技能或记忆后，新建对话可完整应用最新上下文；已有对话可能保留先前内容。")}
            </Copy>
            <Row>
              <Action compact quiet selected={tab === "skills"} onPress={() => setTab("skills")}>
                {tr("技能")}
              </Action>
              <Action compact quiet selected={tab === "memory"} onPress={() => setTab("memory")}>
                {tr("记忆")}
              </Action>
              {!!model.plans.length && (
                <Action compact quiet selected={tab === "plans"} onPress={() => setTab("plans")}>
                  {tr("创建方案")}
                </Action>
              )}
            </Row>
            {!!(error || model.error) && <Copy danger>{error || model.error}</Copy>}
            {tab === "skills" && (
              <SkillsLibrary
                model={model}
                run={run}
                compact
                embedded
                columns={1}
                openSkill={
                  Platform.OS === "web"
                    ? (skill) =>
                        run(async () => {
                          if (
                            !(await openWorkbenchFile({
                              serverId: props.host.id,
                              workspaceId: props.workspaceId,
                              path: skill.path,
                            }))
                          )
                            throw new Error(tr("原生文件打开暂不可用，请从文件树打开。"));
                        })
                    : undefined
                }
              />
            )}
            {tab === "memory" && (
              <MemoryLibrary
                model={model}
                run={run}
                compact
                embedded
                openMemory={(memory) => {
                  if (memory.session)
                    props.navigation?.openAgent({
                      serverId: memory.session.serverId,
                      agentId: memory.session.id,
                    });
                }}
              />
            )}
            {tab === "plans" && (
              <CreationPlans
                model={model}
                navigation={props.navigation}
                run={run}
                pending={pending}
              />
            )}
          </>
        )}
      </ScrollView>
    </WorkbenchTheme.Provider>
  );
}
