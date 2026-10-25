import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { tr, useLocale } from "../i18n";
import { mountWorkbenchHeader } from "../web";
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
  WorkbenchModal,
} from "./components";
import { CreationPlans } from "./creation-plans";
import { MemoryLibrary, SkillsLibrary } from "./library";
import { ProjectPickerDialog, ProjectSelection } from "./project-picker";
import { mountHostReorder, moveHost, orderedHosts } from "./host-order";
import { ProjectPath } from "./project-path";
import { NativeActions } from "./native-actions";
import { useWorkbenchViewState } from "./view-state";
import { projectsInGroup, reorderIds } from "./groups";
import { mountGroupReorder } from "./reorder";
import type {
  SearchScope,
  WorkbenchModel,
  WorkbenchPage,
  WorkbenchProject,
  WorkbenchSearchResponse,
  WorkbenchSession,
  WorkbenchTab,
} from "./types";
import { FAVORITES_GROUP_NAME } from "../../shared/workbench/names";
const pages: [WorkbenchPage, string][] = [
  ["home", "工作台"],
  ["ai", "知行空间"],
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
  const headerRef = useRef<View>(null);
  useEffect(() => {
    if (props.layout.platform === "web") return mountWorkbenchHeader(headerRef.current);
  }, [props.layout.platform, props.layout.compact]);
  const [contentWidth, setContentWidth] = useState(1200);
  const stacked = props.layout.compact || contentWidth < 760;
  const columns = stacked ? 1 : contentWidth < 1000 ? 2 : 3;
  const cardWidth = `${(100 - (columns - 1) * 1.4) / columns}%` as `${number}%`;
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [projectSettings, setProjectSettings] = useState<string | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [{ tab, host, scenario, query, scope, filtersOpen, hostView }, updateView, viewReady] =
    useWorkbenchViewState(props.host.id);
  const setTab = (tab: string) => updateView({ tab });
  const setHost = (host: string) => updateView({ host });
  const setScenario = (scenario: "all" | "dev" | "ops" | "review") => updateView({ scenario });
  const setQuery = (query: string) => updateView({ query });
  const setScope = (scope: SearchScope) => updateView({ scope });
  const setFiltersOpen = (filtersOpen: boolean) => updateView({ filtersOpen });
  const setHostView = (hostView: "grid" | "list") => updateView({ hostView });
  const [search, setSearch] = useState<WorkbenchSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);
  const searchEpoch = useRef(0);
  const searchModel = useRef(model.search);
  searchModel.current = model.search;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [focusProject, setFocusProject] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [editingTask, setEditingTask] = useState<{ id: string; title: string } | null>(null);
  const hostListRef = useRef<View>(null);
  const [hostProjectLimits, setHostProjectLimits] = useState<Record<string, number>>({});
  const hosts = orderedHosts(model.hosts, model.preferences.hostOrder);
  const hostIds = hosts.map((item) => item.id);
  const reorderHost = useRef<(source: string, target: string, after: boolean) => void>(() => {});
  reorderHost.current = (source, target, after) => {
    const next = moveHost(hostIds, source, target, after);
    if (next.some((id, index) => id !== hostIds[index]))
      run(() => model.savePreferences({ hostOrder: next }));
  };
  const hostIdsKey = JSON.stringify(hostIds);
  useEffect(() => {
    if (props.layout.platform === "web" && model.editable && !pending)
      return mountHostReorder(
        hostListRef.current,
        hostView === "grid" && !props.layout.compact,
        theme.colors.accent,
        (source, target, after) => reorderHost.current(source, target, after),
      );
  }, [
    props.layout.platform,
    props.layout.compact,
    model.editable,
    pending,
    page,
    model.preferences.layout,
    hostView,
    hostIdsKey,
    theme.colors.accent,
  ]);
  const [projectPicker, setProjectPicker] = useState<{
    tabId?: string;
    initialSelected: string[];
    title: string;
    detail: string;
  } | null>(null);
  const [tabDraft, setTabDraft] = useState<WorkbenchTab | null>(null);
  const [themeHelp, setThemeHelp] = useState(false);
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
  useEffect(() => {
    if (viewReady && !model.loading && model.editable && tab !== "all" && !selectedTab)
      updateView({ tab: "all" });
  }, [viewReady, model.loading, model.editable, tab, selectedTab, updateView]);
  const groupBarRef = useRef<View>(null),
    groupProjectsRef = useRef<View>(null);
  const sortActions = useRef({
    group: (_source: string, _target: string, _after: boolean) => {},
    project: (_source: string, _target: string, _after: boolean) => {},
  });
  sortActions.current = {
    group(source, target, after) {
      const ids = model.preferences.tabs.map((item) => item.id),
        next = reorderIds(ids, source, target, after);
      if (next.some((id, index) => id !== ids[index]))
        run(() =>
          model.savePreferences({
            tabs: next.map((id) => model.preferences.tabs.find((item) => item.id === id)!),
          }),
        );
    },
    project(source, target, after) {
      if (!selectedTab) return;
      const ids = projectsInGroup(model.projects, model.preferences, selectedTab).map(
          (item) => item.id,
        ),
        next = reorderIds(ids, source, target, after);
      if (next.some((id, index) => id !== ids[index]))
        run(() =>
          model.savePreferences({
            tabs: model.preferences.tabs.map((item) =>
              item.id === selectedTab.id ? { ...item, projectOrder: next } : item,
            ),
          }),
        );
    },
  };
  const groupSortKey = JSON.stringify([
    model.preferences.tabs,
    model.preferences.favorites,
    model.projects.map((p) => p.id),
  ]);
  useEffect(() => {
    if (props.layout.platform !== "web" || !model.editable || pending) return;
    const group = mountGroupReorder(
      groupBarRef.current,
      "workbench-group:",
      true,
      theme.colors.accent,
      (...args) => sortActions.current.group(...args),
    );
    const project = selectedTab
      ? mountGroupReorder(
          groupProjectsRef.current,
          "workbench-group-project:",
          !stacked,
          theme.colors.accent,
          (...args) => sortActions.current.project(...args),
          "workbench-group-project-handle:",
        )
      : () => {};
    return () => {
      group();
      project();
    };
  }, [
    props.layout.platform,
    model.editable,
    pending,
    page,
    model.preferences.layout,
    tab,
    stacked,
    groupSortKey,
    theme.colors.accent,
  ]);
  function selectTab(id: string) {
    setTab(id);
    setHost("all");
    setScenario("all");
    setFiltersOpen(false);
    setProjectSettings(null);
  }
  function addProjects() {
    if (selectedTab?.kind === "manual") {
      setProjectPicker({
        tabId: selectedTab.id,
        initialSelected: selectedTab.projectIds ?? [],
        title: `${tr("添加项目")} · ${selectedTab.name}`,
        detail: tr("选择要放进这个分组的已有项目，只添加入口，不改变磁盘目录。"),
      });
    } else {
      const favorites =
        selectedTab?.kind === "favorites"
          ? selectedTab
          : model.preferences.tabs.find((item) => item.kind === "favorites");
      setProjectPicker({
        initialSelected: model.preferences.favorites,
        title: tr("添加已有项目"),
        detail:
          selectedTab?.kind === "host"
            ? `${tr("Host 分组按资源归属自动更新；本次选择将保存到")}${tr(FAVORITES_GROUP_NAME)}。`
            : `${tr("所选项目将保存到")}「${favorites?.name ?? tr(FAVORITES_GROUP_NAME)}」。`,
      });
    }
  }
  const projectsInTab = (group?: WorkbenchTab) =>
    projectsInGroup(model.projects, model.preferences, group);
  const projects = projectsInTab(selectedTab).filter(
    (project) =>
      (host === "all" || project.instances.some((i) => i.serverId === host)) &&
      (scenario === "all" || model.preferences.scenarioProjects?.[scenario]?.includes(project.id)),
  );
  const openSession = (s: WorkbenchSession) =>
    props.navigation?.openAgent({ serverId: s.serverId, agentId: s.id });
  const workspaceButtons = (project: WorkbenchProject | undefined) =>
    model.workspaces
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
      testID={`workbench-group-project:${project.id}`}
      style={{
        flexGrow: 1,
        flexBasis: props.layout.compact ? "100%" : cardWidth,
        maxWidth: props.layout.compact ? undefined : cardWidth,
        minWidth: 0,
      }}
    >
      <Card accent={project.system}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
          {selectedTab && !project.system && model.editable && (
            <View
              testID={`workbench-group-project-handle:${project.id}`}
              accessibilityLabel={`${tr("拖拽排序")} · ${project.name}`}
              style={{ paddingVertical: 10, paddingHorizontal: 2, flexShrink: 0 }}
            >
              <Icon name="GripVertical" size={16} color={theme.colors.foregroundMuted} />
            </View>
          )}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface2,
              flexShrink: 0,
            }}
          >
            {project.system ? (
              <Icon name="Sparkles" size={20} color={theme.colors.accent} />
            ) : (
              <Copy size={18} strong>
                {project.name.slice(0, 1).toUpperCase()}
              </Copy>
            )}
          </View>
          <View
            accessibilityLabel={project.system ? tr("知行空间") : project.name}
            style={{ flex: 1, minWidth: 0, gap: 2 }}
          >
            <Copy size={16} strong lines={1}>
              {project.system ? tr("知行空间") : project.name}
            </Copy>
            <Copy muted size={12} lines={1}>
              {project.system
                ? tr("系统默认项目 · 常驻工作空间")
                : `${projectWorkspaces(project).length} ${tr("个工作区")}`}
            </Copy>
          </View>
          {project.system ? (
            <Badge>DEFAULT</Badge>
          ) : (
            <>
              <Action
                quiet
                compact
                icon="Star"
                label={tr("切换收藏")}
                disabled={!model.editable || pending}
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
              />
              <NativeActions
                project={project}
                disabled={
                  !online(
                    model.hosts.find((h) => h.id === project.instances[0]?.serverId)?.status ??
                      "offline",
                  )
                }
                organize={() =>
                  setProjectSettings(projectSettings === project.id ? null : project.id)
                }
                onError={setError}
              />
            </>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
          <Icon name="Folder" size={14} color={theme.colors.foregroundMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <ProjectPath path={project.instances[0]?.path || model.ai.root || ""} />
          </View>
        </View>
        <Row>
          <Badge icon="Server">
            {model.hosts.find((h) => h.id === project.instances[0]?.serverId)?.name ??
              props.host.label}
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
          style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 10, gap: 4 }}
        >
          {project.system ? (
            <Action quiet selected onPress={() => setPage("ai")}>
              {tr("开始对话")} →
            </Action>
          ) : (
            <>
              {projectWorkspaces(project).map((workspace) => {
                const available = online(
                  model.hosts.find((h) => h.id === workspace.serverId)?.status ?? "offline",
                );
                return (
                  <View
                    key={`${workspace.serverId}:${workspace.id}`}
                    testID={`workbench-card-workspace:${workspace.serverId}:${workspace.id}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${workspace.name} · ${model.hosts.find((h) => h.id === workspace.serverId)?.name ?? workspace.serverId}`}
                      disabled={!props.navigation || !available}
                      onPress={() =>
                        props.navigation?.openWorkspace({
                          serverId: workspace.serverId,
                          workspaceId: workspace.id,
                        })
                      }
                      style={({ pressed }) => ({
                        flex: 1,
                        minWidth: 0,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 38,
                        paddingHorizontal: 8,
                        paddingVertical: 7,
                        borderRadius: 7,
                        backgroundColor: pressed ? theme.colors.surface2 : "transparent",
                        opacity: available ? 1 : 0.5,
                      })}
                    >
                      <Icon name="PanelsTopLeft" size={15} color={theme.colors.foregroundMuted} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Copy size={14} lines={1}>
                          {workspace.name}
                        </Copy>
                      </View>
                    </Pressable>
                    <NativeActions
                      project={project}
                      workspace={workspace}
                      disabled={!available}
                      organize={() => {}}
                      onError={setError}
                    />
                  </View>
                );
              })}
              {!projectWorkspaces(project).length && (
                <Copy muted size={12}>
                  {tr("此项目暂无工作空间")}
                </Copy>
              )}
            </>
          )}
        </View>
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
            {selectedTab && selectedTab.kind !== "host" && (
              <Action
                quiet
                disabled={!model.editable || pending}
                onPress={() =>
                  run(() =>
                    selectedTab.kind === "favorites"
                      ? model.savePreferences({
                          favorites: model.preferences.favorites.filter((id) => id !== project.id),
                        })
                      : model.savePreferences({
                          tabs: model.preferences.tabs.map((item) =>
                            item.id === selectedTab.id
                              ? {
                                  ...item,
                                  projectIds:
                                    item.projectIds?.filter((id) => id !== project.id) ?? [],
                                }
                              : item,
                          ),
                        }),
                  )
                }
              >
                {tr("移出分组")}
              </Action>
            )}
          </Row>
        )}
      </Card>
    </View>
  );
  const hostsView = (
    <View style={{ gap: 18 }}>
      <Section title="Host 与项目" detail={tr("按 Host 展示原生项目及其工作空间。")}>
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
      <View
        ref={hostListRef}
        style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}
      >
        {hosts.map((h) => {
          const hostProjects = model.nativeProjects
            .filter((project) => project.instances.some((instance) => instance.serverId === h.id))
            .sort(
              (a, b) =>
                (Date.parse(b.lastActivityAt ?? "") || 0) -
                (Date.parse(a.lastActivityAt ?? "") || 0),
            );
          const limit = hostProjectLimits[h.id] ?? 5;
          return (
            <View
              key={h.id}
              testID={`workbench-host-node:${h.id}`}
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
              <View
                testID={`workbench-host-handle:${h.id}`}
                accessibilityLabel={model.editable ? `${h.name} · ${tr("拖拽排序")}` : h.name}
                style={{
                  height: 80,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                  backgroundColor: theme.colors.surface2,
                  gap: 5,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {model.editable && (
                      <Icon name="GripVertical" size={14} color={theme.colors.foregroundMuted} />
                    )}
                    <Icon name="Server" size={18} color={theme.colors.foregroundMuted} />
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
                        lineHeight: 24,
                        fontWeight: "600",
                        color: theme.colors.foreground,
                      }}
                    >
                      {h.name}
                    </Text>
                  </View>
                  <View
                    style={{ flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 5 }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: online(h.status)
                          ? "#22c55e"
                          : theme.colors.foregroundMuted,
                      }}
                    />
                    <Copy muted size={12}>
                      {tr(online(h.status) ? "在线" : "离线")}
                    </Copy>
                  </View>
                </View>
                <Copy muted size={12} lines={1}>
                  {hostProjects.length} {tr("个项目")} ·{" "}
                  {model.workspaces.filter((w) => w.serverId === h.id).length} {tr("个工作区")}
                </Copy>
              </View>
              <View style={{ padding: 10, gap: 10 }}>
                {h.error && (
                  <Copy danger size={12}>
                    {h.error}
                  </Copy>
                )}
                {hostProjects.slice(0, limit).map((project) => {
                  const workspaces = model.workspaces.filter(
                    (workspace) =>
                      workspace.serverId === h.id &&
                      project.instances.some(
                        (instance) =>
                          instance.serverId === h.id && instance.projectId === workspace.projectId,
                      ),
                  );
                  return (
                    <View
                      key={project.id}
                      testID={`workbench-host-project:${h.id}:${project.id}`}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        overflow: "hidden",
                        minWidth: 0,
                      }}
                    >
                      <View style={{ padding: 12, gap: 3 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 7,
                            minWidth: 0,
                          }}
                        >
                          <Icon name="FolderOpen" size={15} color={theme.colors.foregroundMuted} />
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              color: theme.colors.foreground,
                              fontSize: 14,
                              fontWeight: "600",
                              lineHeight: 22,
                            }}
                          >
                            {project.name}
                          </Text>
                          {project.system && <Badge>DEFAULT</Badge>}
                        </View>
                        <View style={{ paddingLeft: 22, marginRight: -12, gap: 2 }}>
                          {project.instances
                            .filter((instance) => instance.serverId === h.id)
                            .map((instance) => (
                              <View key={instance.projectId} style={{ gap: 2 }}>
                                <ProjectPath path={instance.path} />
                                {instance.branch && (
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 5,
                                      minWidth: 0,
                                    }}
                                  >
                                    <Icon
                                      name="GitBranch"
                                      size={12}
                                      color={theme.colors.foregroundMuted}
                                    />
                                    <Text
                                      numberOfLines={1}
                                      ellipsizeMode="tail"
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        color: theme.colors.foregroundMuted,
                                        fontSize: 12,
                                        lineHeight: 19,
                                      }}
                                    >
                                      {instance.branch}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            ))}
                        </View>
                      </View>
                      {!!workspaces.length && (
                        <View
                          style={{
                            paddingVertical: 5,
                            paddingLeft: 21,
                            paddingRight: 8,
                            borderTopWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surface0,
                          }}
                        >
                          <View
                            style={{
                              borderLeftWidth: 1,
                              borderColor: theme.colors.border,
                              paddingLeft: 5,
                            }}
                          >
                            {workspaces.map((workspace) => (
                              <Pressable
                                key={workspace.id}
                                accessibilityRole="button"
                                accessibilityLabel={`${workspace.name} · ${h.name}`}
                                disabled={!props.navigation}
                                onPress={() =>
                                  props.navigation?.openWorkspace({
                                    serverId: h.id,
                                    workspaceId: workspace.id,
                                  })
                                }
                                style={({ pressed }) => ({
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 7,
                                  paddingHorizontal: 7,
                                  minHeight: 34,
                                  borderRadius: 6,
                                  backgroundColor: pressed ? theme.colors.surface2 : "transparent",
                                  opacity: online(h.status) ? 1 : 0.5,
                                })}
                              >
                                <Icon
                                  name="PanelsTopLeft"
                                  size={14}
                                  color={theme.colors.foregroundMuted}
                                />
                                <Text
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    color: theme.colors.foreground,
                                    fontSize: 13,
                                    lineHeight: 20,
                                  }}
                                >
                                  {workspace.name}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
                {hostProjects.length > limit && (
                  <Action
                    quiet
                    compact
                    label={`${h.name} · ${tr("更多项目")}`}
                    onPress={() =>
                      setHostProjectLimits((current) => ({ ...current, [h.id]: limit + 5 }))
                    }
                  >
                    {tr("更多")}（{hostProjects.length - limit}）…
                  </Action>
                )}
                {!hostProjects.length && <Empty>{tr("此 Host 暂无项目")}</Empty>}
              </View>
            </View>
          );
        })}
      </View>
      {!model.hosts.length && <Empty>{tr("尚未发现主机。请先连接 Paseo Host。")}</Empty>}
    </View>
  );
  const chat = (
    <View style={{ gap: 18 }}>
      <Card>
        <Copy strong size={18}>
          {tr("知行空间")}
        </Copy>
        <Copy muted>{tr("在原生对话中继续思考与行动；技能和记忆在右侧管理。")}</Copy>
        <Action icon="Sparkles" onPress={() => setPage("ai")}>
          {tr("打开知行空间")}
        </Action>
      </Card>
      <CreationPlans model={model} navigation={props.navigation} run={run} pending={pending} />
    </View>
  );
  const searchControls = (
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
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 12,
          rowGap: 6,
        }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, maxWidth: "100%" }}>
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
        {model.preferences.layout === "A" && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              marginLeft: "auto",
              maxWidth: "100%",
              gap: 4,
            }}
          >
            <Action quiet icon="Plus" onPress={() => setPage("ai")}>
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
      </View>
    </View>
  );
  const searchResults = (searching || search) && (
    <View style={{ gap: 10 }}>
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
  const searchPanel = (
    <View style={{ gap: 10 }}>
      {searchControls}
      {searchResults}
    </View>
  );
  const stickySearch = page === "home" && model.preferences.layout !== "C";
  const notices = (
    <>
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
    </>
  );
  return (
    <WorkbenchTheme.Provider value={theme}>
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <View
          ref={headerRef}
          style={{
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface1,
            paddingHorizontal: props.layout.compact ? 16 : 28,
            paddingVertical: 6,
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
                <Action compact quiet icon="Palette" onPress={() => setThemeHelp(!themeHelp)}>
                  {tr("外观")}
                </Action>
                <Action
                  compact
                  quiet
                  icon="RefreshCw"
                  label={tr("刷新")}
                  disabled={pending || model.loading}
                  onPress={() => run(model.refresh)}
                />
                <Action compact quiet icon="Sparkles" onPress={() => setPage("ai")}>
                  {tr("知行空间")}
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
                <Action compact quiet icon="Palette" onPress={() => setThemeHelp(!themeHelp)}>
                  {tr("外观")}
                </Action>
                <Action
                  compact
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
          stickyHeaderIndices={stickySearch ? [1] : undefined}
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
          {page === "home" ? (
            <View style={{ gap: 20 }}>
              {notices}
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
                      ? "GLOBAL / OVERVIEW"
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
                    [tr("项目实例"), model.nativeProjects.length, tr("原生项目目录")],
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
                      <View
                        style={{
                          backgroundColor: theme.colors.surface1,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 18,
                          gap: 3,
                        }}
                      >
                        <Copy muted size={13}>
                          {label}
                        </Copy>
                        <Copy size={26} strong>
                          {count}
                        </Copy>
                        <Copy muted size={12}>
                          {detail}
                        </Copy>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            notices
          )}
          {stickySearch && (
            <View
              style={{
                backgroundColor: theme.colors.surface0,
                paddingVertical: 8,
                gap: 20,
                zIndex: 1,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: model.preferences.layout === "A" ? 850 : undefined,
                  alignSelf: "center",
                }}
              >
                {searchControls}
              </View>
              {model.preferences.layout === "A" && (
                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      columnGap: 12,
                      rowGap: 6,
                      borderBottomWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <ScrollView
                      horizontal
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        minWidth: 0,
                        flexBasis: stacked ? "100%" : 0,
                      }}
                    >
                      <View
                        ref={groupBarRef}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                      >
                        <Action quiet selected={tab === "all"} onPress={() => selectTab("all")}>
                          {tr("全部项目")} ({projectsInTab().length + 1})
                        </Action>
                        {model.preferences.tabs.map((t) => (
                          <View
                            key={t.id}
                            testID={`workbench-group:${t.id}`}
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
                            <Action quiet selected={tab === t.id} onPress={() => selectTab(t.id)}>
                              {t.name} ({projectsInTab(t).length})
                            </Action>
                          </View>
                        ))}
                        <Action
                          quiet
                          compact
                          icon="Plus"
                          label={tr("新建分组")}
                          disabled={!model.editable}
                          onPress={() =>
                            setTabDraft({
                              id: `tab-${Date.now()}`,
                              name: "",
                              kind: "manual",
                              projectIds: [],
                            })
                          }
                        />
                        {selectedTab && (
                          <Action
                            quiet
                            compact
                            icon="Pencil"
                            label={tr("编辑分组")}
                            disabled={!model.editable}
                            onPress={() => setTabDraft(selectedTab)}
                          />
                        )}
                      </View>
                    </ScrollView>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexShrink: 0,
                        gap: 10,
                        marginLeft: "auto",
                      }}
                    >
                      <Action
                        compact
                        primary
                        icon="Plus"
                        disabled={!model.editable || pending}
                        onPress={addProjects}
                      >
                        {tr("添加项目")}
                      </Action>
                      <Action
                        compact
                        quiet
                        icon="SlidersHorizontal"
                        selected={filtersOpen}
                        onPress={() => setFiltersOpen(!filtersOpen)}
                      >
                        {tr("筛选")}
                      </Action>
                    </View>
                  </View>
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
                </View>
              )}
            </View>
          )}
          {page === "home" && (
            <View style={{ gap: 20 }}>
              {stickySearch && searchResults && (
                <View
                  style={{
                    width: "100%",
                    maxWidth: model.preferences.layout === "A" ? 850 : undefined,
                    alignSelf: "center",
                  }}
                >
                  {searchResults}
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
                              tr("知行空间")}
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
                  {tabDraft && (
                    <WorkbenchModal
                      wide
                      title={
                        model.preferences.tabs.some((item) => item.id === tabDraft.id)
                          ? tr("编辑分组")
                          : tr("新建分组")
                      }
                      onClose={() => {
                        if (!pending) setTabDraft(null);
                      }}
                    >
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
                        <ProjectSelection
                          projects={model.projects}
                          hosts={model.hosts}
                          selected={tabDraft.projectIds ?? []}
                          disabled={!model.editable || pending}
                          onChange={(projectIds) => setTabDraft({ ...tabDraft, projectIds })}
                        />
                      )}
                      {error && <Copy danger>{error}</Copy>}
                      <Row>
                        <Action
                          primary
                          disabled={
                            !model.editable ||
                            pending ||
                            !tabDraft.name.trim() ||
                            (tabDraft.kind === "host" && !tabDraft.hostId)
                          }
                          onPress={() =>
                            run(async () => {
                              await model.savePreferences({
                                tabs: model.preferences.tabs.some((t) => t.id === tabDraft.id)
                                  ? model.preferences.tabs.map((t) =>
                                      t.id === tabDraft.id
                                        ? { ...tabDraft, name: tabDraft.name.trim() }
                                        : t,
                                    )
                                  : [
                                      ...model.preferences.tabs,
                                      { ...tabDraft, name: tabDraft.name.trim() },
                                    ],
                              });
                              selectTab(tabDraft.id);
                              setTabDraft(null);
                            })
                          }
                        >
                          {tr("保存分组")}
                        </Action>
                        <Action disabled={pending} onPress={() => setTabDraft(null)}>
                          {tr("取消")}
                        </Action>
                        {model.preferences.tabs.some((t) => t.id === tabDraft.id) && (
                          <Action
                            disabled={!model.editable}
                            onPress={() =>
                              run(async () => {
                                await model.savePreferences({
                                  tabs: model.preferences.tabs.filter((t) => t.id !== tabDraft.id),
                                });
                                selectTab("all");
                                setTabDraft(null);
                              })
                            }
                          >
                            {tr("删除分组")}
                          </Action>
                        )}
                      </Row>
                    </WorkbenchModal>
                  )}
                  <View
                    ref={groupProjectsRef}
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}
                  >
                    {tab === "all" &&
                      host === "all" &&
                      scenario === "all" &&
                      projectCard(
                        model.projects.find((p) => p.system) ?? {
                          id: "personal-ai",
                          name: tr("知行空间"),
                          system: true,
                          instances: model.ai.root
                            ? [{ serverId: model.ai.serverId, projectId: "", path: model.ai.root }]
                            : [],
                          workspaceCount: model.ai.initialized ? 1 : 0,
                        },
                      )}
                    {projects.map(projectCard)}
                  </View>
                  {!projects.length && !(tab === "all" && host === "all" && scenario === "all") && (
                    <Empty>
                      <View style={{ alignItems: "center", gap: 12 }}>
                        <Copy muted>
                          {model.loading
                            ? tr("正在读取项目…")
                            : host !== "all" || scenario !== "all"
                              ? tr("当前筛选没有匹配项目。")
                              : tr("这个分组还没有项目。")}
                        </Copy>
                        {!model.loading &&
                          (host !== "all" || scenario !== "all" ? (
                            <Action
                              quiet
                              onPress={() => {
                                setHost("all");
                                setScenario("all");
                              }}
                            >
                              {tr("清除筛选")}
                            </Action>
                          ) : (
                            <Action primary disabled={!model.editable} onPress={addProjects}>
                              {tr("选择已有项目")}
                            </Action>
                          ))}
                      </View>
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
                          {tr(model.ai.initialized ? "AI 已经准备好" : "知行空间")}
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
                        {tr("打开知行空间")} →
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
            </View>
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
        {projectPicker && (
          <ProjectPickerDialog
            key={projectPicker.tabId ?? "favorites"}
            title={projectPicker.title}
            detail={projectPicker.detail}
            projects={model.projects}
            hosts={model.hosts}
            initialSelected={projectPicker.initialSelected}
            editable={model.editable}
            confirmLabel={projectPicker.tabId ? tr("加入分组") : tr("保存选择")}
            onClose={() => setProjectPicker(null)}
            onSave={async (projectIds) => {
              if (projectPicker.tabId) {
                const target = model.preferences.tabs.find(
                  (item) => item.id === projectPicker.tabId && item.kind === "manual",
                );
                if (!target) throw new Error(tr("分组已变化，请重新打开后再添加项目。"));
                await model.savePreferences({
                  tabs: model.preferences.tabs.map((item) =>
                    item.id === target.id ? { ...item, projectIds } : item,
                  ),
                });
                selectTab(target.id);
              } else {
                const target = model.preferences.tabs.find((item) => item.kind === "favorites") ?? {
                  id: "favorites",
                  name: tr(FAVORITES_GROUP_NAME),
                  kind: "favorites" as const,
                };
                await model.savePreferences({
                  favorites: projectIds,
                  ...(!model.preferences.tabs.some((item) => item.id === target.id)
                    ? { tabs: [...model.preferences.tabs, target] }
                    : {}),
                });
                selectTab(target.id);
              }
            }}
          />
        )}
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
                accessibilityLabel={[tr("项目视图"), tr("全域总览"), tr("专注视图")][index]}
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
                  text={`${layout} · ${tr((props.layout.compact ? ["搜索", "全域总览", "专注"] : ["搜索工作台", "全域总览", "专注空间"])[index])}`}
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
