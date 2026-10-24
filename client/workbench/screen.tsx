import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { tr, useLocale } from "../i18n";
import {
  Action,
  Badge,
  Card,
  Copy,
  Empty,
  Field,
  Row,
  Section,
  WorkbenchTheme,
} from "./components";
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
const scenarios = [
  ["dev", "研发"],
  ["ops", "运维"],
  ["review", "检修"],
] as const;
export function WorkbenchScreen(
  props: PluginScreenProps & { model: WorkbenchModel; onPageChange?(page: WorkbenchPage): void },
) {
  useLocale();
  const { model, theme } = props;
  const [page, setCurrentPage] = useState<WorkbenchPage>(
    pages.some(([id]) => id === props.params.page) ? (props.params.page as WorkbenchPage) : "home",
  );
  const setPage = (next: WorkbenchPage) => {
    setCurrentPage(next);
    props.onPageChange?.(next);
  };
  useEffect(() => {
    setCurrentPage(
      pages.some(([id]) => id === props.params.page)
        ? (props.params.page as WorkbenchPage)
        : "home",
    );
  }, [props.params.page]);
  const [contentWidth, setContentWidth] = useState(1200);
  const stacked = props.layout.compact || contentWidth < 760;
  const columns = stacked ? 1 : contentWidth < 1000 ? 2 : 3;
  const cardWidth = `${(100 - (columns - 1) * 1.4) / columns}%` as `${number}%`;
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<string | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [host, setHost] = useState("all");
  const [scenario, setScenario] = useState("all");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [search, setSearch] = useState<WorkbenchSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);
  const searchEpoch = useRef(0);
  const searchModel = useRef(model.search);
  searchModel.current = model.search;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [session, setSession] = useState<WorkbenchSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("");
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");
  const [newSessionOpen, setNewSessionOpen] = useState(false);
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
  }, [query, scope, searchRequest]);
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
      (scenario === "all" ||
        model.preferences.scenarioProjects?.[scenario]?.includes(project.id)) &&
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
  const selectedProvider =
    model.ai.providers.find((item) => item.id === provider) ?? model.ai.providers[0];
  const visibleProviders = model.ai.providers.filter((item) =>
    `${item.label} ${item.id}`
      .toLocaleLowerCase()
      .includes(providerQuery.trim().toLocaleLowerCase()),
  );
  const openSession = (s: WorkbenchSession) =>
    props.navigation?.openAgent({ serverId: s.serverId, agentId: s.id });
  const workspaceButtons = (project: WorkbenchProject | undefined, serverId?: string) =>
    model.workspaces
      .filter((w) => !serverId || w.serverId === serverId)
      .filter((w) =>
        project?.workspaceRefs
          ? project.workspaceRefs.some((ref) => ref.serverId === w.serverId && ref.id === w.id)
          : project?.instances.some(
              (i) => i.serverId === w.serverId && i.projectId === w.projectId,
            ),
      )
      .map((w) => (
        <Action
          key={JSON.stringify([w.serverId, w.id])}
          disabled={!props.navigation}
          onPress={() =>
            props.navigation?.openWorkspace({ serverId: w.serverId, workspaceId: w.id })
          }
        >
          {w.name} · {model.hosts.find((host) => host.id === w.serverId)?.name ?? w.serverId}
        </Action>
      ));
  const projectWorkspaces = (project: WorkbenchProject) =>
    model.workspaces.filter((w) =>
      project.workspaceRefs
        ? project.workspaceRefs.some((ref) => ref.serverId === w.serverId && ref.id === w.id)
        : project.instances.some((i) => i.serverId === w.serverId && i.projectId === w.projectId),
    );
  const online = (status: string) => status === "online" || status === "connected";
  const projectCard = (project: WorkbenchProject) => (
    <View
      key={project.id}
      style={{
        flexGrow: 1,
        flexBasis: props.layout.compact ? "100%" : cardWidth,
        maxWidth: props.layout.compact ? undefined : cardWidth,
        minWidth: 0,
      }}
    >
      <Card accent={project.system}>
        <Row between>
          <View
            style={{ flexDirection: "row", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.surface2,
              }}
            >
              {project.system ? (
                <Icon name="Sparkles" size={21} color={theme.colors.accent} />
              ) : (
                <Copy size={20} strong>
                  {project.name.slice(0, 1).toUpperCase()}
                </Copy>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={project.system ? tr("个人 AI") : project.name}
              onPress={() =>
                project.system
                  ? setPage("ai")
                  : setExpandedProject(expandedProject === project.id ? null : project.id)
              }
              style={{ flex: 1, minWidth: 0, gap: 3 }}
            >
              <Copy size={16} strong lines={1}>
                {project.system ? tr("个人 AI") : project.name}
              </Copy>
              <Copy muted size={12}>
                {project.system
                  ? tr("系统默认项目 · 常驻工作空间")
                  : `${project.instances.length} ${tr("个实例")} · ${project.workspaceCount} ${tr("个工作区")}`}
              </Copy>
            </Pressable>
          </View>
          {project.system ? (
            <Badge>DEFAULT</Badge>
          ) : (
            <Action
              quiet
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
          )}
        </Row>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9, minWidth: 0 }}
        >
          <Icon name="Folder" size={14} color={theme.colors.foregroundMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Copy muted size={12} lines={1}>
              {project.instances[0]?.path || model.ai.root}
            </Copy>
          </View>
          {project.instances.length > 1 && <Badge>+{project.instances.length - 1}</Badge>}
        </View>
        <Row>
          <Badge icon="Server">
            {project.instances.length > 1
              ? `${project.instances.length} Hosts`
              : (model.hosts.find((h) => h.id === project.instances[0]?.serverId)?.name ??
                props.host.label)}
          </Badge>
          {project.system ? (
            <Badge>
              {model.skills.filter((skill) => skill.enabled).length} {tr("个启用技能")}
            </Badge>
          ) : (
            project.instances[0]?.branch && (
              <Badge icon="GitBranch">{project.instances[0].branch}</Badge>
            )
          )}
        </Row>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            paddingTop: 7,
            marginTop: 5,
          }}
        >
          <Row between>
            <Copy muted size={12}>
              {project.system
                ? `${aiSessions.length} ${tr("个会话")}`
                : `${project.workspaceCount} ${tr("个工作区")}`}
            </Copy>
            <Row>
              {!project.system && (
                <Action
                  quiet
                  label={`${project.name} · ${tr("项目设置")}`}
                  icon="Ellipsis"
                  onPress={() =>
                    setProjectSettings(projectSettings === project.id ? null : project.id)
                  }
                />
              )}
              <Action
                quiet
                selected
                onPress={() =>
                  project.system
                    ? setPage("ai")
                    : setExpandedProject(expandedProject === project.id ? null : project.id)
                }
              >
                {project.system ? tr("开始对话") : tr("进入项目")} →
              </Action>
            </Row>
          </Row>
        </View>
        {expandedProject === project.id && (
          <View
            style={{ gap: 8, borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12 }}
          >
            <Copy muted size={12}>
              {tr("选择工作空间，继续 Agent 和 Terminal")}
            </Copy>
            <Row>{workspaceButtons(project)}</Row>
            {!projectWorkspaces(project).length && (
              <Copy muted size={12}>
                {tr("此项目暂无工作空间")}
              </Copy>
            )}
          </View>
        )}
        {projectSettings === project.id && (
          <Row>
            <Copy muted size={12}>
              {tr("场景")}
            </Copy>
            {scenarios.map(([id, label]) => {
              const members = model.preferences.scenarioProjects?.[id] ?? [];
              return (
                <Action
                  quiet
                  key={id}
                  label={`${project.name} · ${tr(label)}`}
                  selected={members.includes(project.id)}
                  disabled={!model.editable}
                  onPress={() =>
                    run(() =>
                      model.savePreferences({
                        scenarioProjects: {
                          ...model.preferences.scenarioProjects,
                          [id]: members.includes(project.id)
                            ? members.filter((member) => member !== project.id)
                            : [...members, project.id],
                        },
                      }),
                    )
                  }
                >
                  {tr(label)}
                </Action>
              );
            })}
          </Row>
        )}
      </Card>
    </View>
  );
  const hostsView = (
    <View style={{ gap: 18 }}>
      <Section title="Host 与项目" detail={tr("同一项目可以分布在不同 Host，目录与会话分别保留。")}>
        <Row>
          <Action
            quiet
            icon="LayoutGrid"
            selected={hostView === "grid"}
            onPress={() => setHostView("grid")}
          >
            {tr("矩阵")}
          </Action>
          <Action
            quiet
            icon="List"
            selected={hostView === "list"}
            onPress={() => setHostView("list")}
          >
            {tr("列表")}
          </Action>
        </Row>
      </Section>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
        {model.hosts.map((h) => (
          <View
            key={h.id}
            style={{
              flexGrow: 1,
              minWidth: 0,
              flexBasis: hostView === "list" || props.layout.compact ? "100%" : 260,
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <View style={{ padding: 16, backgroundColor: theme.colors.surface2, gap: 5 }}>
              <Row between>
                <Row>
                  <Icon name="Server" size={18} color={theme.colors.foregroundMuted} />
                  <Copy strong size={15}>
                    {h.name}
                  </Copy>
                </Row>
                <Copy muted size={12}>
                  {online(h.status) ? `● ${tr("在线")}` : `○ ${tr("离线")}`}
                </Copy>
              </Row>
              <Copy muted size={12}>
                {model.projects.filter((p) => p.instances.some((i) => i.serverId === h.id)).length}{" "}
                {tr("个项目")} · {model.workspaces.filter((w) => w.serverId === h.id).length}{" "}
                {tr("个工作区")}
              </Copy>
              {h.error && (
                <Copy danger size={12}>
                  {h.error}
                </Copy>
              )}
            </View>
            <View style={{ padding: 10, gap: 10 }}>
              {model.projects
                .filter((p) => p.instances.some((i) => i.serverId === h.id))
                .map((project) => (
                  <Card key={project.id}>
                    <Row>
                      <Copy strong size={14}>
                        {project.name}
                      </Copy>
                      {project.system && <Badge>DEFAULT</Badge>}
                    </Row>
                    {project.instances
                      .filter((i) => i.serverId === h.id)
                      .map((instance) => (
                        <View key={instance.projectId} style={{ gap: 7 }}>
                          <Copy muted size={12}>
                            {instance.path}
                          </Copy>
                          {instance.branch && <Badge icon="GitBranch">{instance.branch}</Badge>}
                        </View>
                      ))}
                    <Row>{workspaceButtons(project, h.id)}</Row>
                  </Card>
                ))}
              {!model.projects.some((p) => p.instances.some((i) => i.serverId === h.id)) && (
                <Empty>{tr("此 Host 暂无项目")}</Empty>
              )}
            </View>
          </View>
        ))}
      </View>
      {!model.hosts.length && <Empty>{tr("尚未发现主机。请先连接 Paseo Host。")}</Empty>}
    </View>
  );
  const sessionRail = (
    <View
      style={{
        width: stacked ? "100%" : 200,
        gap: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Row between>
        <Copy strong>{tr("会话")}</Copy>
        <Action quiet icon="Plus" label={tr("新建会话")} onPress={() => setNewSessionOpen(true)} />
      </Row>
      {aiSessions.map((item) => (
        <Action
          key={JSON.stringify([item.serverId, item.id])}
          quiet
          icon="MessageSquare"
          selected={activeSession?.id === item.id && activeSession.serverId === item.serverId}
          onPress={() => {
            setSession(item);
            setNewSessionOpen(false);
          }}
        >
          {item.title}
        </Action>
      ))}
      {!aiSessions.length && (
        <Copy muted size={12}>
          {tr("还没有会话，从一个想法开始。")}
        </Copy>
      )}
    </View>
  );
  const contextRail = (
    <View style={{ width: stacked ? "100%" : 250, gap: 16 }}>
      <Card>
        <Section title="当前工作位置" />
        <Copy strong>{tr("个人 AI")}</Copy>
        <Copy muted>{tr("默认工作空间")}</Copy>
        <Copy muted size={12}>
          {model.ai.root}
        </Copy>
        <Copy strong>{tr("参考项目")}</Copy>
        <Copy muted size={12}>
          {tr("个人记忆始终可用；选择项目后会加入该项目已确认的记忆。")}
        </Copy>
        <ScrollView style={{ maxHeight: 180 }}>
          <View style={{ gap: 4 }}>
            <Action quiet selected={!focusProject} onPress={() => setFocusProject("")}>
              {tr("仅个人记忆")}
            </Action>
            {model.projects
              .filter((p) => !p.system)
              .map((p) => (
                <Action
                  quiet
                  key={p.id}
                  selected={focusProject === p.id}
                  onPress={() => setFocusProject(p.id)}
                >
                  {p.name}
                </Action>
              ))}
          </View>
        </ScrollView>
      </Card>
      <Card>
        <Row between>
          <Copy strong>{tr("已启用技能")}</Copy>
          <Action quiet onPress={() => setPage("skills")}>
            {tr("管理")}
          </Action>
        </Row>
        {model.skills
          .filter((skill) => skill.enabled)
          .map((skill) => (
            <Badge key={skill.id} icon="Blocks">
              {skill.name}
            </Badge>
          ))}
      </Card>
      <Card>
        <Copy strong>{tr("上下文")}</Copy>
        <Copy muted>
          {
            model.memories.filter(
              (m) =>
                m.enabled && m.confirmed && (m.scope === "personal" || m.scope === focusProject),
            ).length
          }{" "}
          {tr("条已确认记忆")} · {model.skills.filter((s) => s.enabled).length} {tr("个启用技能")}
        </Copy>
        <Row>
          <Action onPress={() => setPage("memory")}>{tr("管理记忆")}</Action>
          <Action onPress={() => setPage("skills")}>{tr("管理技能")}</Action>
        </Row>
      </Card>
    </View>
  );
  const chat = (
    <View style={{ gap: 18 }}>
      {page === "ai" && (
        <View style={{ gap: 6 }}>
          <Copy muted size={12} strong>
            PERSONAL AI / DEFAULT WORKSPACE
          </Copy>
          <Copy size={props.layout.compact ? 27 : 32} strong>
            {tr("你的 AI，有自己的工作空间。")}
          </Copy>
          <Copy muted>
            {tr("系统默认项目 · 默认工作空间")} ·{" "}
            {model.hosts.find((host) => host.id === model.ai.serverId)?.name ?? props.host.label}
          </Copy>
        </View>
      )}
      <View
        style={{
          flexDirection: page === "ai" && !stacked ? "row" : "column",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        {page === "ai" && sessionRail}
        <View style={{ flex: 1, width: "100%", minWidth: 0, gap: 18 }}>
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
              {page !== "ai" && (
                <Row between>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ScrollView horizontal>
                      <Row>
                        {aiSessions.map((s) => (
                          <Action
                            quiet
                            key={JSON.stringify([s.serverId, s.id])}
                            selected={
                              activeSession?.serverId === s.serverId && activeSession.id === s.id
                            }
                            onPress={() => {
                              setSession(s);
                              setNewSessionOpen(false);
                            }}
                          >
                            {s.title}
                          </Action>
                        ))}
                      </Row>
                    </ScrollView>
                  </View>
                  {activeSession && (
                    <Action onPress={() => setNewSessionOpen((open) => !open)}>
                      {newSessionOpen ? tr("收起新会话") : tr("新建会话")}
                    </Action>
                  )}
                </Row>
              )}
              {(!activeSession || newSessionOpen) && (
                <Card>
                  <Copy strong>{tr("新会话")}</Copy>
                  {selectedProvider && (
                    <Action
                      label={tr("选择模型")}
                      onPress={() => setProviderPickerOpen((open) => !open)}
                    >
                      {selectedProvider.label} {providerPickerOpen ? "▴" : "▾"}
                    </Action>
                  )}
                  {providerPickerOpen && (
                    <View style={{ gap: 10 }}>
                      <Field
                        label={tr("搜索模型")}
                        value={providerQuery}
                        onChangeText={setProviderQuery}
                        placeholder={tr("输入模型或提供商名称")}
                      />
                      <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
                        {visibleProviders.map((item) => (
                          <Action
                            key={item.id}
                            selected={selectedProvider?.id === item.id}
                            onPress={() => {
                              setProvider(item.id);
                              setProviderPickerOpen(false);
                              setProviderQuery("");
                            }}
                          >
                            {item.label}
                          </Action>
                        ))}
                        {!visibleProviders.length && <Copy muted>{tr("没有匹配的模型")}</Copy>}
                      </ScrollView>
                    </View>
                  )}
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
                          provider: selectedProvider!.id,
                          title: sessionTitle.trim() || tr("工作台对话"),
                        });
                        setSession(created);
                        setSessionTitle("");
                        setNewSessionOpen(false);
                        setProviderPickerOpen(false);
                        setProviderQuery("");
                      })
                    }
                  >
                    {tr("创建会话")}
                  </Action>
                </Card>
              )}
              {activeSession && (
                <Conversation
                  key={JSON.stringify([activeSession.serverId, activeSession.id])}
                  session={activeSession}
                  draft={drafts[JSON.stringify([activeSession.serverId, activeSession.id])] ?? ""}
                  setDraft={(value) => {
                    const key = JSON.stringify([activeSession.serverId, activeSession.id]);
                    setDrafts((current) => ({
                      ...current,
                      [key]: typeof value === "function" ? value(current[key] ?? "") : value,
                    }));
                  }}
                  model={model}
                  projectId={focusProject || undefined}
                  openNative={() => openSession(activeSession)}
                  run={run}
                />
              )}
            </>
          )}
          {model.plans
            .filter((plan) => !plan.sourceAgentId || plan.sourceAgentId === activeSession?.id)
            .map((plan) => (
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
                          instance.serverId === plan.serverId &&
                          instance.projectId === plan.projectId,
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
        {page === "ai" && contextRail}
      </View>
    </View>
  );
  const searchPanel = (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 12,
          backgroundColor: theme.colors.surface1,
          padding: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View style={{ paddingHorizontal: 10 }}>
          <Icon name="Search" size={20} color={theme.colors.foregroundMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Field
            accessibilityLabel={tr("全局搜索")}
            placeholder={tr("搜索项目、工作区、会话和记忆…")}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setSearchRequest((current) => current + 1)}
            style={{
              borderWidth: 0,
              backgroundColor: "transparent",
              minHeight: 44,
              paddingHorizontal: 0,
            }}
          />
        </View>
        <Action
          primary
          disabled={!query.trim()}
          onPress={() => setSearchRequest((current) => current + 1)}
        >
          {tr("搜索")} →
        </Action>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
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
          <Action quiet key={id} selected={scope === id} onPress={() => setScope(id)}>
            {tr(label)}
          </Action>
        ))}
      </View>
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
              <Copy muted size={12}>
                {tr(
                  {
                    project: "项目",
                    workspace: "工作区",
                    session: "会话",
                    host: "主机",
                    memory: "记忆",
                  }[result.kind],
                )}
                {result.serverId
                  ? ` · ${model.hosts.find((host) => host.id === result.serverId)?.name ?? result.serverId}`
                  : ""}
                {result.workspaceId ? ` · ${result.workspaceId}` : ""}
              </Copy>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
  return (
    <WorkbenchTheme.Provider value={theme}>
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <View
          style={{
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
            paddingHorizontal: props.layout.compact ? 16 : 28,
            paddingVertical: 12,
            gap: 8,
          }}
        >
          {props.layout.compact ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ScrollView horizontal style={{ flex: 1 }}>
                <Row>
                  {pages.map(([id, title]) => (
                    <Action quiet key={id} selected={page === id} onPress={() => setPage(id)}>
                      {tr(title)}
                    </Action>
                  ))}
                </Row>
              </ScrollView>
              <Action
                quiet
                icon="Ellipsis"
                label={tr("工作台菜单")}
                selected={mobileToolsOpen}
                onPress={() => setMobileToolsOpen(!mobileToolsOpen)}
              />
            </View>
          ) : (
            <Row between>
              <Row>
                <Copy muted size={13}>
                  {tr("个人空间")}
                </Copy>
                <Copy muted size={13}>
                  ›
                </Copy>
                <Copy strong size={13}>
                  {tr(pages.find(([id]) => id === page)?.[1] ?? "工作台")}
                </Copy>
              </Row>
              <Row>
                <Copy muted size={12}>
                  {model.hosts.filter((h) => online(h.status)).length} / {model.hosts.length}{" "}
                  {tr("在线")}
                </Copy>
                <Action quiet icon="Palette" onPress={() => setThemeHelp(!themeHelp)}>
                  {tr("外观")}
                </Action>
                <Action
                  quiet
                  icon="RefreshCw"
                  label={tr("刷新")}
                  disabled={pending || model.loading}
                  onPress={() => run(model.refresh)}
                />
                <Action primary icon="Sparkles" onPress={() => setPage("ai")}>
                  {tr("AI 工作空间")}
                </Action>
              </Row>
            </Row>
          )}
          {props.layout.compact && mobileToolsOpen && (
            <Row between>
              <Copy muted size={12}>
                {model.hosts.filter((h) => online(h.status)).length} / {model.hosts.length}{" "}
                {tr("在线")}
              </Copy>
              <Row>
                <Action quiet icon="Palette" onPress={() => setThemeHelp(!themeHelp)}>
                  {tr("外观")}
                </Action>
                <Action
                  quiet
                  icon="RefreshCw"
                  disabled={pending || model.loading}
                  onPress={() => run(model.refresh)}
                >
                  {tr("刷新")}
                </Action>
              </Row>
            </Row>
          )}
        </View>
        <ScrollView
          onLayout={(event) =>
            setContentWidth(event.nativeEvent.layout.width - (props.layout.compact ? 32 : 56))
          }
          style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
          contentContainerStyle={{
            padding: props.layout.compact ? 16 : 28,
            paddingBottom: 100,
            gap: 20,
            maxWidth: 1440,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {themeHelp && (
            <Card>
              <Copy>
                {tr(
                  "在 Paseo 设置 → 外观中选择 工作台 · 石墨白、深空蓝、松石绿或暖砂金。主题同时应用到完整应用界面。",
                )}
              </Copy>
            </Card>
          )}
          {(error || model.error) && (
            <Card>
              <Copy danger>{error || model.error}</Copy>
            </Card>
          )}
          {!model.editable && <Copy muted>{tr("配置主机不可用，当前为只读视图。")}</Copy>}
          {pending && <Copy muted>{tr("正在保存或执行…")}</Copy>}
          {page === "home" && (
            <>
              <View
                style={{
                  gap: 8,
                  paddingTop: 6,
                  paddingBottom: 4,
                  alignItems: model.preferences.layout === "A" ? "center" : "flex-start",
                }}
              >
                <Copy muted size={12} strong>
                  {model.preferences.layout === "A"
                    ? "YOUR PERSONAL COMMAND CENTER"
                    : model.preferences.layout === "B"
                      ? "OPERATIONS / OVERVIEW"
                      : "FOCUS / THINK / BUILD"}
                </Copy>
                <Copy size={props.layout.compact ? 27 : 32} strong>
                  {tr(
                    model.preferences.layout === "A"
                      ? "所有工作，在这里继续。"
                      : model.preferences.layout === "B"
                        ? "一眼，看见全局。"
                        : "专注于眼前，连接所有上下文。",
                  )}
                </Copy>
                <Copy muted>
                  {tr(
                    model.preferences.layout === "A"
                      ? "找到项目，连接不同 Host，也让 AI 帮你开始下一步。"
                      : model.preferences.layout === "B"
                        ? "按真实执行环境检查资源，保留跨 Host 的项目关联。"
                        : "保持项目在手边，让对话直接推动下一步。",
                  )}
                </Copy>
              </View>
              {model.preferences.layout === "B" && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                  {[
                    [
                      tr("在线 Host"),
                      `${model.hosts.filter((h) => online(h.status)).length} / ${model.hosts.length}`,
                      tr("当前连接状态"),
                    ],
                    [
                      tr("项目实例"),
                      model.projects.reduce((count, p) => count + p.instances.length, 0),
                      `${model.projects.length} ${tr("个项目")}`,
                    ],
                    [tr("工作区"), model.workspaces.length, tr("原生资源目录")],
                    [
                      tr("需要留意"),
                      model.hosts.filter((h) => !online(h.status)).length,
                      tr("离线 Host 的数据可能过期"),
                    ],
                  ].map(([label, count, detail]) => (
                    <View
                      key={label}
                      style={{ flex: 1, minWidth: props.layout.compact ? 135 : 180 }}
                    >
                      <Card>
                        <Copy muted size={13}>
                          {label}
                        </Copy>
                        <Copy size={30} strong>
                          {count}
                        </Copy>
                        <Copy muted size={12}>
                          {detail}
                        </Copy>
                      </Card>
                    </View>
                  ))}
                </View>
              )}
              {model.preferences.layout !== "C" && (
                <View
                  style={{
                    width: "100%",
                    maxWidth: model.preferences.layout === "A" ? 850 : undefined,
                    alignSelf: "center",
                    gap: 10,
                  }}
                >
                  {searchPanel}
                </View>
              )}
              {model.preferences.layout === "A" && (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  <Action
                    quiet
                    icon="Plus"
                    onPress={() => {
                      setPage("ai");
                      setDrafts((current) =>
                        activeSession
                          ? {
                              ...current,
                              [JSON.stringify([activeSession.serverId, activeSession.id])]:
                                current[
                                  JSON.stringify([activeSession.serverId, activeSession.id])
                                ] || tr("帮我准备一个新项目的创建方案"),
                            }
                          : current,
                      );
                    }}
                  >
                    {tr("让 AI 创建项目")}
                  </Action>
                  <Action
                    quiet
                    icon="History"
                    disabled={!model.sessions.length}
                    onPress={() => openSession(model.sessions[0])}
                  >
                    {tr("继续上次工作")}
                  </Action>
                  <Action
                    quiet
                    icon="Server"
                    onPress={() => run(() => model.savePreferences({ layout: "B" }))}
                  >
                    {tr("检查环境")}
                  </Action>
                </View>
              )}
              {model.preferences.layout === "B" ? (
                hostsView
              ) : model.preferences.layout === "C" ? (
                <View
                  style={{
                    flexDirection: stacked ? "column" : "row",
                    alignItems: "flex-start",
                    gap: 24,
                  }}
                >
                  <View
                    style={{
                      flex: stacked ? undefined : 1,
                      minWidth: 0,
                      width: stacked ? "100%" : undefined,
                    }}
                  >
                    <View style={{ gap: 18 }}>
                      {searchPanel}
                      <Card>
                        <Row between>
                          <Copy size={21} strong>
                            {model.projects.find((p) => p.id === focusProject)?.name ??
                              tr("个人 AI")}
                          </Copy>
                          <Badge>{tr("参考项目")}</Badge>
                        </Row>
                        <Copy muted>{tr("你的常驻助手 · 技能、记忆与工作入口")}</Copy>
                        <Copy muted size={12}>
                          {model.projects.find((p) => p.id === focusProject)?.instances[0]?.path ??
                            model.ai.root}
                        </Copy>
                        <Action
                          quiet
                          icon="ArrowLeftRight"
                          onPress={() => setFocusPickerOpen(!focusPickerOpen)}
                        >
                          {tr("切换引用项目")}
                        </Action>
                        {focusPickerOpen && (
                          <Row>
                            <Action
                              selected={!focusProject}
                              onPress={() => {
                                setFocusProject("");
                                setFocusPickerOpen(false);
                              }}
                            >
                              {tr("个人")}
                            </Action>
                            {model.projects
                              .filter((p) => !p.system)
                              .map((p) => (
                                <Action
                                  key={p.id}
                                  selected={focusProject === p.id}
                                  onPress={() => {
                                    setFocusProject(p.id);
                                    setFocusPickerOpen(false);
                                  }}
                                >
                                  {p.name}
                                </Action>
                              ))}
                          </Row>
                        )}
                        {focusProject && (
                          <Row>
                            {workspaceButtons(model.projects.find((p) => p.id === focusProject)!)}
                          </Row>
                        )}
                      </Card>
                      <Section title="这次想完成的事" />
                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Field
                              accessibilityLabel={tr("添加待办")}
                              placeholder={tr("添加这次想完成的事…")}
                              value={taskTitle}
                              onChangeText={setTaskTitle}
                            />
                          </View>
                          <Action
                            disabled={!taskTitle.trim() || !model.editable}
                            onPress={() =>
                              run(async () => {
                                await model.savePreferences({
                                  focusTasks: [
                                    ...model.preferences.focusTasks,
                                    {
                                      id: `task-${Date.now()}`,
                                      title: taskTitle.trim(),
                                      done: false,
                                    },
                                  ],
                                });
                                setTaskTitle("");
                              })
                            }
                          >
                            {tr("添加")}
                          </Action>
                        </View>
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
                          <View
                            key={task.id}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              paddingVertical: 9,
                              borderBottomWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                          >
                            <Action
                              quiet
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
                              quiet
                              disabled={!model.editable}
                              onPress={() => setEditingTask({ id: task.id, title: task.title })}
                            >
                              {tr("编辑")}
                            </Action>
                            <Action
                              quiet
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
                          </View>
                        ))}
                      </View>
                      <Section title="可用技能">
                        <Action quiet onPress={() => setPage("skills")}>
                          {tr("全部技能")} →
                        </Action>
                      </Section>
                      <Row>
                        {model.skills
                          .filter((skill) => skill.enabled)
                          .map((skill) => (
                            <Badge key={skill.id} icon="Blocks">
                              {skill.name}
                            </Badge>
                          ))}
                      </Row>
                    </View>
                  </View>
                  <View
                    style={{
                      flex: stacked ? undefined : 1.35,
                      minWidth: 0,
                      width: stacked ? "100%" : undefined,
                    }}
                  >
                    {chat}
                  </View>
                </View>
              ) : (
                <>
                  <Row>
                    <Action quiet selected={tab === "all"} onPress={() => setTab("all")}>
                      {tr("全部项目")}
                    </Action>
                    {model.preferences.tabs.map((t) => (
                      <Action quiet key={t.id} selected={tab === t.id} onPress={() => setTab(t.id)}>
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
                            !model.editable ||
                            !tabDraft.name.trim() ||
                            (tabDraft.kind === "host" && !tabDraft.hostId)
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
                            disabled={!model.editable}
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
                  <Row between>
                    <View style={{ gap: 3 }}>
                      <Copy size={19} strong>
                        {tr("我的项目空间")}
                      </Copy>
                      <Copy muted size={12}>
                        {projects.length +
                          (tab === "all" && host === "all" && scenario === "all" ? 1 : 0)}{" "}
                        {tr("个项目")} · {tr("按你的工作方式组织")}
                      </Copy>
                    </View>
                    <Action
                      quiet
                      icon="SlidersHorizontal"
                      selected={filtersOpen}
                      onPress={() => setFiltersOpen(!filtersOpen)}
                    >
                      {tr("筛选")}
                    </Action>
                  </Row>
                  {filtersOpen && (
                    <View style={{ gap: 8 }}>
                      {" "}
                      <Row>
                        <Copy muted size={12}>
                          Host
                        </Copy>
                        <Action quiet selected={host === "all"} onPress={() => setHost("all")}>
                          {tr("全部")}
                        </Action>
                        {model.hosts.map((h) => (
                          <Action
                            quiet
                            key={h.id}
                            selected={host === h.id}
                            onPress={() => setHost(h.id)}
                          >
                            {h.name}
                          </Action>
                        ))}
                      </Row>
                      <Row>
                        <Copy muted size={12}>
                          {tr("场景")}
                        </Copy>
                        <Action
                          quiet
                          selected={scenario === "all"}
                          onPress={() => setScenario("all")}
                        >
                          {tr("全部")}
                        </Action>
                        {scenarios.map(([id, label]) => (
                          <Action
                            quiet
                            key={id}
                            selected={scenario === id}
                            onPress={() => setScenario(id)}
                          >
                            {tr(label)}
                          </Action>
                        ))}
                      </Row>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                    {tab === "all" &&
                      host === "all" &&
                      scenario === "all" &&
                      projectCard(
                        model.projects.find((p) => p.system) ?? {
                          id: "personal-ai",
                          name: tr("个人 AI"),
                          system: true,
                          instances: model.ai.root
                            ? [{ serverId: model.ai.serverId, projectId: "", path: model.ai.root }]
                            : [],
                          workspaceCount: model.ai.initialized ? 1 : 0,
                        },
                      )}
                    {projects.map(projectCard)}
                  </View>
                  {!projects.length && (
                    <Empty>
                      {model.loading ? tr("正在读取项目…") : tr("这个分组还没有项目。")}
                    </Empty>
                  )}
                </>
              )}
              {model.preferences.layout !== "C" && (
                <View
                  style={{
                    flexDirection: props.layout.compact ? "column" : "row",
                    gap: 24,
                    marginTop: 4,
                  }}
                >
                  <View style={{ flex: 1.5, gap: 12, minWidth: 0 }}>
                    <Section title="接着上次的思路" />
                    {model.sessions.slice(0, 4).map((s) => (
                      <View
                        key={JSON.stringify([s.serverId, s.id])}
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Row between>
                          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Copy strong size={14} lines={1}>
                              {s.title}
                            </Copy>
                            <Copy muted size={12}>
                              {model.hosts.find((h) => h.id === s.serverId)?.name ?? s.serverId}
                            </Copy>
                          </View>
                          <Row>
                            <Action
                              quiet
                              disabled={!props.navigation}
                              onPress={() => openSession(s)}
                            >
                              {tr("继续")} →
                            </Action>
                            {model.indexSession && (
                              <Action
                                quiet
                                disabled={pending || !model.editable}
                                onPress={() => run(() => model.indexSession!(s))}
                              >
                                {tr("索引正文")}
                              </Action>
                            )}
                          </Row>
                        </Row>
                      </View>
                    ))}
                    {!model.sessions.length && <Copy muted>{tr("还没有最近会话")}</Copy>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Card>
                      <Row between>
                        <Copy strong size={18}>
                          {tr(model.ai.initialized ? "AI 已经准备好" : "你的 AI 工作空间")}
                        </Copy>
                        <Badge>{tr("系统工作空间")}</Badge>
                      </Row>
                      <Copy muted>{tr("技能、记忆和一个想法，开始下一步。")}</Copy>
                      <Copy muted size={12}>
                        {model.ai.root ?? tr("初始化后显示实际工作区路径")}
                      </Copy>
                      <Row>
                        <Badge>
                          {model.skills.filter((skill) => skill.enabled).length} {tr("个启用技能")}
                        </Badge>
                        <Badge>
                          {model.memories.filter((m) => m.enabled && m.confirmed).length}{" "}
                          {tr("条已确认记忆")}
                        </Badge>
                      </Row>
                      <Action quiet selected onPress={() => setPage("ai")}>
                        {tr("打开 AI 工作空间")} →
                      </Action>
                    </Card>
                  </View>
                </View>
              )}
              {model.indexStatus && <Copy muted>{model.indexStatus}</Copy>}
              <Row>
                {model.cancelIndex && (
                  <Action
                    disabled={!model.editable}
                    onPress={() => {
                      void model.cancelIndex!().catch((cause) => setError(String(cause)));
                    }}
                  >
                    {tr("停止索引")}
                  </Action>
                )}
                {model.clearSearchIndex && (
                  <Action
                    disabled={!model.editable || pending}
                    onPress={() => run(model.clearSearchIndex!)}
                  >
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
              compact={props.layout.compact}
              run={run}
              openMemory={(m) => m.session && openSession(m.session)}
            />
          )}
          {page === "skills" && (
            <SkillsLibrary
              model={model}
              run={run}
              compact={props.layout.compact}
              columns={columns}
            />
          )}
        </ScrollView>
        {page === "home" && (
          <View
            style={{
              position: "absolute",
              bottom: props.layout.compact ? 12 : 20,
              alignSelf: "center",
              flexDirection: "row",
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.foreground,
              padding: 5,
              borderRadius: 12,
              gap: 3,
              maxWidth: "96%",
            }}
          >
            {(["A", "B", "C"] as const).map((layout, index) => (
              <Pressable
                key={layout}
                accessibilityRole="button"
                accessibilityLabel={[tr("项目视图"), tr("主机视图"), tr("专注视图")][index]}
                accessibilityState={{ selected: model.preferences.layout === layout }}
                onPress={() => run(() => model.savePreferences({ layout }))}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingHorizontal: props.layout.compact ? 12 : 16,
                  paddingVertical: 11,
                  borderRadius: 8,
                  backgroundColor:
                    model.preferences.layout === layout ? theme.colors.surface0 : "transparent",
                }}
              >
                <Icon
                  name={["Search", "PanelsTopLeft", "Sparkles"][index]}
                  size={16}
                  color={
                    model.preferences.layout === layout
                      ? theme.colors.foreground
                      : theme.colors.surface0
                  }
                />
                <DockLabel
                  selected={model.preferences.layout === layout}
                  text={`${layout} · ${tr((props.layout.compact ? ["搜索", "运维", "专注"] : ["搜索工作台", "运维控制台", "专注空间"])[index])}`}
                  theme={theme}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </WorkbenchTheme.Provider>
  );
}

function DockLabel({
  selected,
  text,
  theme,
}: {
  selected: boolean;
  text: string;
  theme: PluginScreenProps["theme"];
}) {
  return (
    <Text
      style={{ fontSize: 13, color: selected ? theme.colors.foreground : theme.colors.surface0 }}
    >
      {text}
    </Text>
  );
}
