import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { tr, useLocale } from "../i18n";
import { Action, Card, Copy, Empty, Field, Row, Section, WorkbenchTheme } from "./components";
import { Conversation } from "./chat";
import { MemoryLibrary, SkillsLibrary } from "./library";
import type {
  SearchScope,
  WorkbenchModel,
  WorkbenchPage,
  WorkbenchProject,
  WorkbenchSearchResponse,
  WorkbenchSession,
  WorkbenchTab,
} from "./types";
const pages: [WorkbenchPage, string][] = [
  ["home", "工作台"],
  ["ai", "AI"],
  ["hosts", "主机"],
  ["memory", "记忆"],
  ["skills", "技能"],
];
export function WorkbenchScreen(props: PluginScreenProps & { model: WorkbenchModel }) {
  useLocale();
  const { model, theme } = props;
  const [page, setPage] = useState<WorkbenchPage>(
    pages.some(([id]) => id === props.params.page) ? (props.params.page as WorkbenchPage) : "home",
  );
  const [tab, setTab] = useState("all");
  const [host, setHost] = useState("all");
  const [scenario, setScenario] = useState("all");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [search, setSearch] = useState<WorkbenchSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const searchEpoch = useRef(0);
  const searchModel = useRef(model.search);
  searchModel.current = model.search;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [session, setSession] = useState<WorkbenchSession | null>(null);
  const [provider, setProvider] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [focusProject, setFocusProject] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);
  const [hostView, setHostView] = useState<"grid" | "list">("grid");
  const [tabDraft, setTabDraft] = useState<WorkbenchTab | null>(null);
  const [themeHelp, setThemeHelp] = useState(false);
  const [planEdit, setPlanEdit] = useState<{
    id: string;
    title: string;
    serverId: string;
    path: string;
  } | null>(null);
  useEffect(() => {
    const epoch = ++searchEpoch.current;
    if (!query.trim()) {
      setSearch(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchModel
        .current(query, scope)
        .then((result) => {
          if (epoch === searchEpoch.current) setSearch(result);
        })
        .catch((cause) => {
          if (epoch === searchEpoch.current) setError(String(cause));
        })
        .finally(() => {
          if (epoch === searchEpoch.current) setSearching(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      searchEpoch.current++;
    };
  }, [query, scope]);
  function run(task: () => Promise<unknown>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    void task()
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  }
  const selectedTab = model.preferences.tabs.find((item) => item.id === tab);
  const projects = model.projects.filter(
    (project) =>
      !project.system &&
      (host === "all" || project.instances.some((i) => i.serverId === host)) &&
      (scenario === "all" || project.tags?.includes(scenario)) &&
      (!selectedTab ||
        (selectedTab.kind === "favorites"
          ? model.preferences.favorites.includes(project.id)
          : selectedTab.kind === "host"
            ? project.instances.some((i) => i.serverId === selectedTab.hostId)
            : selectedTab.projectIds?.includes(project.id))),
  );
  const aiSessions = model.sessions.filter(
    (s) => s.workspaceId === model.ai.workspaceId && s.serverId === model.ai.serverId,
  );
  const activeSession =
    session?.serverId === model.ai.serverId && session.workspaceId === model.ai.workspaceId
      ? session
      : aiSessions[0];
  const openSession = (s: WorkbenchSession) =>
    props.navigation?.openAgent({ serverId: s.serverId, agentId: s.id });
  const workspaceButtons = (project: WorkbenchProject | undefined) =>
    model.workspaces
      .filter((w) =>
        project?.instances.some((i) => i.serverId === w.serverId && i.projectId === w.projectId),
      )
      .map((w) => (
        <Action
          key={JSON.stringify([w.serverId, w.id])}
          disabled={!props.navigation}
          onPress={() =>
            props.navigation?.openWorkspace({ serverId: w.serverId, workspaceId: w.id })
          }
        >
          {w.name}
        </Action>
      ));
  const projectCard = (project: WorkbenchProject) => (
    <View
      key={project.id}
      style={{
        flexGrow: 1,
        flexBasis: props.layout.compact ? "100%" : 300,
        maxWidth: props.layout.compact ? undefined : 520,
      }}
    >
      <Card>
        <Row between>
          <Copy size={18} strong>
            {project.name}
          </Copy>
          <Action
            label={tr("切换收藏")}
            disabled={!model.editable}
            selected={model.preferences.favorites.includes(project.id)}
            onPress={() =>
              run(() =>
                model.savePreferences({
                  favorites: model.preferences.favorites.includes(project.id)
                    ? model.preferences.favorites.filter((id) => id !== project.id)
                    : [...model.preferences.favorites, project.id],
                }),
              )
            }
          >
            {model.preferences.favorites.includes(project.id) ? "★" : "☆"}
          </Action>
        </Row>
        <Copy muted size={12}>
          {project.instances.length} {tr("个实例")} · {project.workspaceCount} {tr("个工作区")}
        </Copy>
        {project.instances.map((i) => (
          <View key={JSON.stringify([i.serverId, i.projectId])} style={{ gap: 3 }}>
            <Copy strong>{model.hosts.find((h) => h.id === i.serverId)?.name ?? i.serverId}</Copy>
            <Copy muted size={12}>
              {i.path}
              {i.branch ? ` · ${i.branch}` : ""}
            </Copy>
          </View>
        ))}
        <Row>{workspaceButtons(project)}</Row>
      </Card>
    </View>
  );
  const hostsView = (
    <View style={{ gap: 18 }}>
      <Section title="主机" detail={tr("连接状态及此刻可读取的项目目录。离线数据可能过期。")}>
        <Row>
          <Action selected={hostView === "grid"} onPress={() => setHostView("grid")}>
            {tr("矩阵")}
          </Action>
          <Action selected={hostView === "list"} onPress={() => setHostView("list")}>
            {tr("列表")}
          </Action>
        </Row>
      </Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {model.hosts.map((h) => (
          <View
            key={h.id}
            style={{
              flexGrow: 1,
              flexBasis: hostView === "list" || props.layout.compact ? "100%" : 380,
            }}
          >
            <Card>
              <Row between>
                <Copy size={19} strong>
                  {h.name}
                </Copy>
                <Copy muted>{h.status}</Copy>
              </Row>
              {h.error && <Copy danger>{h.error}</Copy>}
              <Row>
                <Copy>
                  {
                    model.projects.filter((p) => p.instances.some((i) => i.serverId === h.id))
                      .length
                  }{" "}
                  {tr("个项目")}
                </Copy>
                <Copy>
                  {model.workspaces.filter((w) => w.serverId === h.id).length} {tr("个工作区")}
                </Copy>
                <Copy>
                  {model.sessions.filter((s) => s.serverId === h.id).length} {tr("个会话")}
                </Copy>
                <Action
                  onPress={() => {
                    setHost(h.id);
                    setPage("home");
                    run(() => model.savePreferences({ layout: "A" }));
                  }}
                >
                  {tr("查看项目")}
                </Action>
              </Row>
              {model.projects
                .filter((p) => !p.system && p.instances.some((i) => i.serverId === h.id))
                .slice(0, 6)
                .map((project) => (
                  <View key={project.id} style={{ gap: 4 }}>
                    <Copy strong>{project.name}</Copy>
                    {project.instances
                      .filter((i) => i.serverId === h.id)
                      .map((instance) => (
                        <Copy key={instance.projectId} muted size={12}>
                          {instance.path}
                          {instance.branch ? ` · ${instance.branch}` : ""}
                        </Copy>
                      ))}
                  </View>
                ))}
              <Row>
                {model.sessions
                  .filter((s) => s.serverId === h.id)
                  .slice(0, 3)
                  .map((s) => (
                    <Action
                      key={JSON.stringify([s.serverId, s.id])}
                      disabled={!props.navigation}
                      onPress={() => openSession(s)}
                    >
                      {s.title}
                    </Action>
                  ))}
              </Row>
            </Card>
          </View>
        ))}
      </View>
      {!model.hosts.length && <Empty>{tr("尚未发现主机。请先连接 Paseo Host。")}</Empty>}
    </View>
  );
  const chat = (
    <View style={{ gap: 18 }}>
      <Section title="AI 工作区" detail={model.ai.root || tr("初始化后显示实际工作区路径")} />
      <Card>
        <Copy strong>{tr("参考项目")}</Copy>
        <Copy muted size={12}>
          {tr("个人记忆始终可用；选择项目后会加入该项目已确认的记忆。")}
        </Copy>
        <Row>
          <Action selected={!focusProject} onPress={() => setFocusProject("")}>
            {tr("仅个人记忆")}
          </Action>
          {model.projects
            .filter((project) => !project.system)
            .map((project) => (
              <Action
                key={project.id}
                selected={focusProject === project.id}
                onPress={() => setFocusProject(project.id)}
              >
                {project.name}
              </Action>
            ))}
        </Row>
      </Card>
      {!model.ai.initialized ? (
        <Card>
          <Copy>{tr("创建独立的 AI 工作区，用于工作台对话、记忆和技能。")}</Copy>
          {model.ai.error && <Copy danger>{model.ai.error}</Copy>}
          <Action
            primary
            disabled={!model.editable || pending}
            onPress={() => run(model.initializeAI)}
          >
            {tr("初始化 AI 工作区")}
          </Action>
        </Card>
      ) : (
        <>
          <Row>
            {aiSessions.map((s) => (
              <Action
                key={JSON.stringify([s.serverId, s.id])}
                selected={activeSession?.serverId === s.serverId && activeSession.id === s.id}
                onPress={() => setSession(s)}
              >
                {s.title}
              </Action>
            ))}
          </Row>
          <Card>
            <Copy strong>{tr("新会话")}</Copy>
            <Row>
              {model.ai.providers.map((p) => (
                <Action
                  key={p.id}
                  selected={(provider || model.ai.providers[0]?.id) === p.id}
                  onPress={() => setProvider(p.id)}
                >
                  {p.label}
                </Action>
              ))}
            </Row>
            {!model.ai.providers.length && (
              <Copy muted>{tr("此 Host 尚未提供可用的模型提供商。")}</Copy>
            )}
            <Field
              label={tr("会话标题")}
              value={sessionTitle}
              onChangeText={setSessionTitle}
              placeholder={tr("工作台对话")}
            />
            <Action
              disabled={!model.editable || pending || !model.ai.providers.length}
              onPress={() =>
                run(async () => {
                  const created = await model.newSession({
                    provider: provider || model.ai.providers[0].id,
                    title: sessionTitle.trim() || tr("工作台对话"),
                  });
                  setSession(created);
                  setSessionTitle("");
                })
              }
            >
              {tr("创建会话")}
            </Action>
          </Card>
          {activeSession && (
            <Conversation
              key={JSON.stringify([activeSession.serverId, activeSession.id])}
              session={activeSession}
              model={model}
              projectId={focusProject || undefined}
              openNative={() => openSession(activeSession)}
              run={run}
            />
          )}
          <Card>
            <Copy strong>{tr("上下文")}</Copy>
            <Copy muted>
              {
                model.memories.filter(
                  (m) =>
                    m.enabled &&
                    m.confirmed &&
                    (m.scope === "personal" || m.scope === focusProject),
                ).length
              }{" "}
              {tr("条已确认记忆")} · {model.skills.filter((s) => s.enabled).length}{" "}
              {tr("个启用技能")}
            </Copy>
            <Row>
              <Action onPress={() => setPage("memory")}>{tr("管理记忆")}</Action>
              <Action onPress={() => setPage("skills")}>{tr("管理技能")}</Action>
            </Row>
          </Card>
        </>
      )}
      {model.plans.map((plan) => (
        <Card key={plan.id} accent>
          <Row between>
            <Copy strong>{plan.title}</Copy>
            <Copy muted>
              {plan.status} · v{plan.revision}
            </Copy>
          </Row>
          <Copy muted>
            {plan.kind} · {model.hosts.find((h) => h.id === plan.serverId)?.name ?? plan.serverId}
          </Copy>
          {plan.path && <Copy>{plan.path}</Copy>}
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
              disabled={!props.navigation}
              onPress={() => {
                if (plan.result?.agentId)
                  props.navigation?.openAgent({
                    serverId: plan.result.serverId,
                    agentId: plan.result.agentId,
                  });
                else if (plan.result?.workspaceId)
                  props.navigation?.openWorkspace({
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
  return (
    <WorkbenchTheme.Provider value={theme}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
        contentContainerStyle={{
          padding: props.layout.compact ? 16 : 32,
          gap: 24,
          maxWidth: 1440,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Row between>
          <View>
            <Copy size={25} strong>
              Workbench
            </Copy>
            <Copy muted size={12}>
              {tr("项目、主机和 AI 的共同入口")}
            </Copy>
          </View>
          <Row>
            <Action onPress={() => setThemeHelp(!themeHelp)}>{tr("外观")}</Action>
            <Action disabled={pending || model.loading} onPress={() => run(model.refresh)}>
              {model.loading ? tr("读取中…") : tr("刷新")}
            </Action>
          </Row>
        </Row>
        {themeHelp && (
          <Card>
            <Copy>
              {tr(
                "在 Paseo 设置 → 外观中选择 工作台 · 石墨白、深空蓝、松石绿或暖砂金。主题同时应用到完整应用界面。",
              )}
            </Copy>
          </Card>
        )}
        <Row>
          {pages.map(([id, title]) => (
            <Action key={id} selected={page === id} onPress={() => setPage(id)}>
              {tr(title)}
            </Action>
          ))}
        </Row>
        {(error || model.error) && (
          <Card>
            <Copy danger>{error || model.error}</Copy>
          </Card>
        )}
        {!model.editable && <Copy muted>{tr("配置主机不可用，当前为只读视图。")}</Copy>}
        {pending && <Copy muted>{tr("正在保存或执行…")}</Copy>}
        {page === "home" && (
          <>
            <Row between>
              <Section title="从这里继续" />
              <Row>
                {(["A", "B", "C"] as const).map((layout, i) => (
                  <Action
                    key={layout}
                    selected={model.preferences.layout === layout}
                    disabled={!model.editable}
                    onPress={() => run(() => model.savePreferences({ layout }))}
                  >
                    {[tr("项目视图"), tr("主机视图"), tr("专注视图")][i]}
                  </Action>
                ))}
              </Row>
            </Row>
            <Field
              accessibilityLabel={tr("全局搜索")}
              placeholder={tr("搜索项目、工作区、会话和记忆…")}
              value={query}
              onChangeText={setQuery}
            />
            <Row>
              {(
                [
                  ["all", "全部"],
                  ["project", "项目"],
                  ["workspace", "工作区"],
                  ["session", "会话"],
                  ["host", "主机"],
                  ["memory", "记忆"],
                ] as [SearchScope, string][]
              ).map(([id, label]) => (
                <Action key={id} selected={scope === id} onPress={() => setScope(id)}>
                  {tr(label)}
                </Action>
              ))}
            </Row>
            {searching && <Copy muted>{tr("搜索中…")}</Copy>}
            {search && (
              <Card>
                <Copy muted size={12}>
                  {search.coverage}
                </Copy>
                {!search.results.length && <Empty>{tr("没有找到匹配结果。")}</Empty>}
                {search.results.map((result) => (
                  <View key={`${result.kind}/${result.id}`} style={{ gap: 6 }}>
                    <Row between>
                      <Copy strong>
                        {result.title}
                        {result.stale ? ` · ${tr("缓存")}` : ""}
                      </Copy>
                      <Action
                        onPress={() => {
                          if (result.agentId)
                            props.navigation?.openAgent({
                              serverId: result.serverId,
                              agentId: result.agentId,
                            });
                          else if (result.workspaceId)
                            props.navigation?.openWorkspace({
                              serverId: result.serverId,
                              workspaceId: result.workspaceId,
                            });
                          else if (result.kind === "memory") setPage("memory");
                          else if (result.kind === "host") setPage("hosts");
                          else {
                            setQuery("");
                            setTab("all");
                            setHost(result.serverId ?? "all");
                            setFocusProject(result.kind === "project" ? result.id : "");
                            run(() => model.savePreferences({ layout: "C" }));
                          }
                        }}
                      >
                        {tr("打开")}
                      </Action>
                    </Row>
                    <Copy muted size={12}>
                      {result.detail}
                    </Copy>
                  </View>
                ))}
              </Card>
            )}
            {model.preferences.layout === "B" ? (
              hostsView
            ) : model.preferences.layout === "C" ? (
              <>
                <Card>
                  <Copy size={18} strong>
                    {tr("当前焦点")}
                  </Copy>
                  <Row>
                    <Action selected={!focusProject} onPress={() => setFocusProject("")}>
                      {tr("个人")}
                    </Action>
                    {model.projects
                      .filter((p) => !p.system)
                      .map((p) => (
                        <Action
                          key={p.id}
                          selected={focusProject === p.id}
                          onPress={() => setFocusProject(p.id)}
                        >
                          {p.name}
                        </Action>
                      ))}
                  </Row>
                  {focusProject && (
                    <Row>
                      {workspaceButtons(model.projects.find((p) => p.id === focusProject)!)}
                    </Row>
                  )}
                  <Field label={tr("添加待办")} value={taskTitle} onChangeText={setTaskTitle} />
                  <Action
                    disabled={!taskTitle.trim() || !model.editable}
                    onPress={() =>
                      run(async () => {
                        await model.savePreferences({
                          focusTasks: [
                            ...model.preferences.focusTasks,
                            { id: `task-${Date.now()}`, title: taskTitle.trim(), done: false },
                          ],
                        });
                        setTaskTitle("");
                      })
                    }
                  >
                    {tr("添加")}
                  </Action>
                  {editingTask && (
                    <Card accent>
                      <Field
                        label={tr("编辑待办")}
                        value={editingTask.title}
                        onChangeText={(title) => setEditingTask({ ...editingTask, title })}
                      />
                      <Row>
                        <Action
                          primary
                          disabled={!editingTask.title.trim() || !model.editable}
                          onPress={() =>
                            run(async () => {
                              await model.savePreferences({
                                focusTasks: model.preferences.focusTasks.map((task) =>
                                  task.id === editingTask.id
                                    ? { ...task, title: editingTask.title.trim() }
                                    : task,
                                ),
                              });
                              setEditingTask(null);
                            })
                          }
                        >
                          {tr("保存")}
                        </Action>
                        <Action onPress={() => setEditingTask(null)}>{tr("取消")}</Action>
                      </Row>
                    </Card>
                  )}
                  {model.preferences.focusTasks.map((task) => (
                    <Row key={task.id}>
                      <Action
                        selected={task.done}
                        disabled={!model.editable}
                        onPress={() =>
                          run(() =>
                            model.savePreferences({
                              focusTasks: model.preferences.focusTasks.map((t) =>
                                t.id === task.id ? { ...t, done: !t.done } : t,
                              ),
                            }),
                          )
                        }
                      >
                        {task.done ? "✓ " : "○ "}
                        {task.title}
                      </Action>
                      <Action
                        disabled={!model.editable}
                        onPress={() => setEditingTask({ id: task.id, title: task.title })}
                      >
                        {tr("编辑")}
                      </Action>
                      <Action
                        disabled={!model.editable}
                        onPress={() =>
                          run(() =>
                            model.savePreferences({
                              focusTasks: model.preferences.focusTasks.filter(
                                (t) => t.id !== task.id,
                              ),
                            }),
                          )
                        }
                      >
                        {tr("移除")}
                      </Action>
                    </Row>
                  ))}
                </Card>
                {chat}
              </>
            ) : (
              <>
                <Row>
                  <Action selected={tab === "all"} onPress={() => setTab("all")}>
                    {tr("全部项目")}
                  </Action>
                  {model.preferences.tabs.map((t) => (
                    <Action key={t.id} selected={tab === t.id} onPress={() => setTab(t.id)}>
                      {t.name}
                    </Action>
                  ))}
                  <Action
                    disabled={!model.editable}
                    onPress={() =>
                      setTabDraft({
                        id: `tab-${Date.now()}`,
                        name: "",
                        kind: "manual",
                        projectIds: [],
                      })
                    }
                  >
                    ＋ {tr("分组")}
                  </Action>
                  {selectedTab && (
                    <Action disabled={!model.editable} onPress={() => setTabDraft(selectedTab)}>
                      {tr("编辑分组")}
                    </Action>
                  )}
                </Row>
                {tabDraft && (
                  <Card accent>
                    <Field
                      label={tr("分组名称")}
                      value={tabDraft.name}
                      onChangeText={(name) => setTabDraft({ ...tabDraft, name })}
                    />
                    <Row>
                      {(["manual", "favorites", "host"] as const).map((kind, i) => (
                        <Action
                          key={kind}
                          selected={tabDraft.kind === kind}
                          onPress={() => setTabDraft({ ...tabDraft, kind })}
                        >
                          {[tr("自选项目"), tr("收藏"), tr("指定主机")][i]}
                        </Action>
                      ))}
                    </Row>
                    {tabDraft.kind === "host" && (
                      <Row>
                        {model.hosts.map((h) => (
                          <Action
                            key={h.id}
                            selected={tabDraft.hostId === h.id}
                            onPress={() => setTabDraft({ ...tabDraft, hostId: h.id })}
                          >
                            {h.name}
                          </Action>
                        ))}
                      </Row>
                    )}
                    {tabDraft.kind === "manual" && (
                      <Row>
                        {model.projects
                          .filter((p) => !p.system)
                          .map((p) => (
                            <Action
                              key={p.id}
                              selected={tabDraft.projectIds?.includes(p.id)}
                              onPress={() =>
                                setTabDraft({
                                  ...tabDraft,
                                  projectIds: tabDraft.projectIds?.includes(p.id)
                                    ? tabDraft.projectIds.filter((id) => id !== p.id)
                                    : [...(tabDraft.projectIds ?? []), p.id],
                                })
                              }
                            >
                              {p.name}
                            </Action>
                          ))}
                      </Row>
                    )}
                    <Row>
                      <Action
                        primary
                        disabled={
                          !tabDraft.name.trim() || (tabDraft.kind === "host" && !tabDraft.hostId)
                        }
                        onPress={() =>
                          run(async () => {
                            await model.savePreferences({
                              tabs: [
                                ...model.preferences.tabs.filter((t) => t.id !== tabDraft.id),
                                { ...tabDraft, name: tabDraft.name.trim() },
                              ],
                            });
                            setTab(tabDraft.id);
                            setTabDraft(null);
                          })
                        }
                      >
                        {tr("保存分组")}
                      </Action>
                      <Action onPress={() => setTabDraft(null)}>{tr("取消")}</Action>
                      {model.preferences.tabs.some((t) => t.id === tabDraft.id) && (
                        <Action
                          onPress={() =>
                            run(async () => {
                              await model.savePreferences({
                                tabs: model.preferences.tabs.filter((t) => t.id !== tabDraft.id),
                              });
                              setTab("all");
                              setTabDraft(null);
                            })
                          }
                        >
                          {tr("删除分组")}
                        </Action>
                      )}
                    </Row>
                  </Card>
                )}
                <Row>
                  <Copy muted size={12}>
                    Host
                  </Copy>
                  <Action selected={host === "all"} onPress={() => setHost("all")}>
                    {tr("全部")}
                  </Action>
                  {model.hosts.map((h) => (
                    <Action key={h.id} selected={host === h.id} onPress={() => setHost(h.id)}>
                      {h.name}
                    </Action>
                  ))}
                </Row>
                {model.projects.some((p) => p.tags?.length) && (
                  <Row>
                    <Copy muted size={12}>
                      {tr("场景")}
                    </Copy>
                    <Action selected={scenario === "all"} onPress={() => setScenario("all")}>
                      {tr("全部")}
                    </Action>
                    {[...new Set(model.projects.flatMap((p) => p.tags ?? []))].map((tag) => (
                      <Action
                        key={tag}
                        selected={scenario === tag}
                        onPress={() => setScenario(tag)}
                      >
                        {tag}
                      </Action>
                    ))}
                  </Row>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  {projects.map(projectCard)}
                </View>
                {!projects.length && (
                  <Empty>{model.loading ? tr("正在读取项目…") : tr("这个分组还没有项目。")}</Empty>
                )}
              </>
            )}
            <Section title="最近会话" />
            {model.sessions.slice(0, 8).map((s) => (
              <Card key={JSON.stringify([s.serverId, s.id])}>
                <Row between>
                  <View>
                    <Copy strong>{s.title}</Copy>
                    <Copy muted size={12}>
                      {model.hosts.find((h) => h.id === s.serverId)?.name ?? s.serverId}
                      {s.updatedAt ? ` · ${s.updatedAt}` : ""}
                    </Copy>
                  </View>
                  <Row>
                    <Action disabled={!props.navigation} onPress={() => openSession(s)}>
                      {tr("继续")}
                    </Action>
                    {model.indexSession && (
                      <Action disabled={pending} onPress={() => run(() => model.indexSession!(s))}>
                        {tr("索引正文")}
                      </Action>
                    )}
                  </Row>
                </Row>
              </Card>
            ))}
            {model.indexStatus && <Copy muted>{model.indexStatus}</Copy>}
            <Row>
              {model.cancelIndex && (
                <Action
                  onPress={() => {
                    void model.cancelIndex!().catch((cause) => setError(String(cause)));
                  }}
                >
                  {tr("停止索引")}
                </Action>
              )}
              {model.clearSearchIndex && (
                <Action onPress={() => run(model.clearSearchIndex!)}>
                  {tr("清除配置 Host 正文索引")}
                </Action>
              )}
            </Row>
          </>
        )}
        {page === "ai" && chat}
        {page === "hosts" && hostsView}
        {page === "memory" && (
          <MemoryLibrary
            model={model}
            run={run}
            openMemory={(m) => m.session && openSession(m.session)}
          />
        )}
        {page === "skills" && <SkillsLibrary model={model} run={run} />}
      </ScrollView>
    </WorkbenchTheme.Provider>
  );
}
