import {
  getPaseoClient,
  useHosts,
  type PluginClientContext,
  type PluginScreenProps,
  type PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { SidebarRow, Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { catalogCacheSchema, createCatalog, readHostCatalog } from "./catalog";
import { mountProjectSidebar, renderProjectSidebar, type WorkspaceMenuExtra } from "../web";
import { loadDevicePreferences, readDevicePreference, writeDevicePreference } from "./device";
import { tr, useLocale } from "../i18n";
import { subscribeLocale } from "../chat-view/locale";
import {
  changeProjectTree,
  DEFAULT_PROJECT_TREE_VIEW_NAME,
  readProjectTree,
  projectTreeSettings,
  projectTreeViewName,
} from "../../shared/project-tree/contracts";
import { createWorkbenchSync } from "./sync";
import { registerWorkbench } from "../workbench/register";
import { useWorkbenchModel } from "../workbench/data";
import { projectsInGroup, toggleFavoriteGroup } from "../workbench/groups";
import type { WorkbenchProject } from "../workbench/types";
import { groupSidebarSnapshot } from "./group-projection";
import { mountSidebarViewSwitcher } from "./view-switcher";
import { useKnowledgeSpaceHeader } from "../workbench/knowledge-space";
import { FAVORITES_GROUP_NAME } from "../../shared/workbench/names";

/** Lucide star, matching the workbench project card's favorite affordance. */
const STAR_GLYPH =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";

export function registerProjectTree(client: PluginClientContext) {
  const catalog = createCatalog();
  let sourceId: string | null = null;
  const preferenceKey = (key: string) => `${sourceId}.${key}`;
  let cachedTree = catalog.read().tree;
  let cachedCatalogs = catalog.read().catalogs;
  let cacheScheduled = false;
  const removeCache = catalog.subscribe(() => {
    const snapshot = catalog.read();
    if (
      !sourceId ||
      !snapshot.initialized ||
      (snapshot.tree === cachedTree && snapshot.catalogs === cachedCatalogs) ||
      cacheScheduled
    )
      return;
    cacheScheduled = true;
    queueMicrotask(() => {
      cacheScheduled = false;
      if (stopped || !sourceId) return;
      const { tree, catalogs } = catalog.read();
      if (tree === cachedTree && catalogs === cachedCatalogs) return;
      writeDevicePreference(preferenceKey("cache"), JSON.stringify({ tree, catalogs }));
      cachedTree = tree;
      cachedCatalogs = catalogs;
    });
  });
  let mode: "custom" | "native" = "custom";
  const listeners = new Set<() => void>();
  const collapsed = new Set<string>();
  let viewName = DEFAULT_PROJECT_TREE_VIEW_NAME;
  let configuration: Promise<void> | null = null;
  function configureSource(id: string) {
    if (configuration && sourceId === id) return configuration;
    sourceId = id;
    sync.reset();
    collapsed.clear();
    configuration = (async () => {
      await loadDevicePreferences(["cache", "navigationView", "collapsed"].map(preferenceKey));
      if (stopped || sourceId !== id) return;
      mode =
        readDevicePreference(preferenceKey("navigationView")) === "native" ? "native" : "custom";
      let cached: ReturnType<typeof catalogCacheSchema.parse> | undefined;
      try {
        cached = catalogCacheSchema.parse(
          JSON.parse(readDevicePreference(preferenceKey("cache")) ?? "null"),
        );
      } catch {
        /* A fresh device has no catalog yet. */
      }
      try {
        const saved: unknown = JSON.parse(readDevicePreference(preferenceKey("collapsed")) ?? "[]");
        if (Array.isArray(saved))
          for (const key of saved) if (typeof key === "string") collapsed.add(key);
      } catch {
        /* Ignore stale device preferences. */
      }
      catalog.restore(cached);
      for (const listener of listeners) listener();
    })();
    return configuration;
  }
  function selectNavigation(view: "workbench" | "native") {
    mode = view === "native" ? "native" : "custom";
    if (sourceId) writeDevicePreference(preferenceKey("navigationView"), view);
    for (const listener of listeners) listener();
  }
  const subscribeMode = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const cleanups = new Set<() => void>();
  const sync = createWorkbenchSync(catalog, {
    readTree: () => client.rpc(readProjectTree, {}),
    changeTree: (revision, command) => client.rpc(changeProjectTree, { revision, command }),
    readHost: (serverId, demand) => readHostCatalog(getPaseoClient(serverId), serverId, demand),
    sessionDemand: () => new Map(),
  });
  const refreshCatalog = () => sync.refresh();
  function useCatalog(configurationHost: string, demand: boolean | "all" = false) {
    const hosts = useHosts();
    const signature = JSON.stringify(hosts);
    useEffect(() => {
      sync.hosts(hosts);
      let alive = true;
      let release: (() => void) | undefined;
      void configureSource(configurationHost)
        .then(() => {
          if (!alive || stopped) return;
          release = sync.acquire(demand);
        })
        .catch((error: unknown) => {
          if (alive)
            catalog.connection(false, error instanceof Error ? error.message : String(error));
        });
      const stop = () => {
        alive = false;
        release?.();
        cleanups.delete(stop);
      };
      cleanups.add(stop);
      return stop;
      // Host summaries are immutable values; avoid restarting demand for a new array identity.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, configurationHost, demand]);
    return useSyncExternalStore(catalog.subscribe, catalog.read, catalog.read);
  }
  function Sidebar(props: PluginSidebarItemProps) {
    useLocale();
    const snapshot = useCatalog(props.host.id, props.layout.platform === "web");
    const model = useWorkbenchModel(client, props, snapshot, refreshCatalog);
    useKnowledgeSpaceHeader(client, model.ai);
    const latestModel = useRef(model);
    latestModel.current = model;
    const displayBusy = useRef(false);
    const [displayPending, setDisplayPending] = useState(false),
      [displayError, setDisplayError] = useState("");
    const selectedMode = useSyncExternalStore(
      subscribeMode,
      () => mode,
      () => mode,
    );
    const projected = groupSidebarSnapshot(snapshot, model.preferences, model.projects);
    const mounted = useRef<ReturnType<typeof mountProjectSidebar> | null>(null);
    const selector = useRef<ReturnType<typeof mountSidebarViewSwitcher> | null>(null);
    const selectorOptions = {
      view: selectedMode === "native" ? ("native" as const) : ("workbench" as const),
      theme: props.theme,
      select: selectNavigation,
    };
    const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
      renderProjectSidebar(container, {
        snapshot: { ...projected, organizationError: displayError || projected.organizationError },
        theme: props.theme,
        readOnly: true,
        knowledgeSpace: {
          open: () => props.openScreen({ screenId: "workbench", params: { page: "ai" } }),
        },
        collapsed,
        workspaceMenuExtras(workspace) {
          const extras: WorkspaceMenuExtra[] = [];
          const current = latestModel.current;
          const project = current.projects.find((candidate) =>
            candidate.instances.some(
              (instance) =>
                instance.serverId === workspace.serverId &&
                instance.projectId === workspace.projectId,
            ),
          );
          if (project && !project.system) {
            const favorited = current.preferences.favorites.includes(project.id);
            extras.push({
              key: "favorite-project",
              label: tr(favorited ? "取消收藏" : "收藏项目"),
              glyph: STAR_GLYPH,
              disabled: !current.editable,
              action: () => {
                void toggleFavoriteProject(project.id, favorited);
              },
            });
          }
          return extras;
        },
        viewName: tr("工作台视图"),
        projectSourceId: (id) => projected.projectSources.get(id) ?? id,
        groupDisplay(id) {
          const groupId = projected.groupIds.get(id),
            group = model.preferences.tabs.find((tab) => tab.id === groupId);
          if (!group) return;
          return {
            workspacesOnly: !!group.workspacesOnly,
            disabled: !model.editable || displayPending,
            toggle() {
              if (displayBusy.current) return;
              const current = latestModel.current,
                selected = current.preferences.tabs.find((tab) => tab.id === groupId);
              if (!selected) return;
              displayBusy.current = true;
              setDisplayPending(true);
              setDisplayError("");
              void current
                .savePreferences({
                  tabs: current.preferences.tabs.map((tab) =>
                    tab.id === groupId ? { ...tab, workspacesOnly: !selected.workspacesOnly } : tab,
                  ),
                })
                .catch((error) => setDisplayError(String(error)))
                .finally(() => {
                  displayBusy.current = false;
                  setDisplayPending(false);
                });
            },
          };
        },
        toggle(id) {
          if (collapsed.has(id)) collapsed.delete(id);
          else collapsed.add(id);
          writeDevicePreference(preferenceKey("collapsed"), JSON.stringify([...collapsed]));
          mounted.current?.update(render);
        },
        open(workspace) {
          props.openScreen({
            screenId: "project-tree",
            params: { serverId: workspace.serverId, workspaceId: workspace.id },
          });
        },
        native() {
          selectNavigation("native");
        },
        renameWorkspace(workspace) {
          props.openScreen({
            screenId: "project-tree",
            params: {
              serverId: workspace.serverId,
              renameWorkspaceId: workspace.id,
              name: workspace.name,
              intent: String(Date.now()),
            },
          });
        },
      });
    async function toggleFavoriteProject(projectId: string, favorited: boolean) {
      const current = latestModel.current;
      if (!current.editable) return;
      setDisplayError("");
      const update = toggleFavoriteGroup(
        current.preferences,
        projectId,
        favorited,
        tr(FAVORITES_GROUP_NAME),
      );
      try {
        await current.savePreferences(update);
      } catch (error) {
        setDisplayError(String(error));
        return;
      }
      if (!favorited) {
        const favoritesTab = update.tabs.find((tab) => tab.kind === "favorites");
        const groupId = favoritesTab && JSON.stringify(["workbench-group", favoritesTab.id]);
        if (groupId && collapsed.delete(groupId)) {
          writeDevicePreference(preferenceKey("collapsed"), JSON.stringify([...collapsed]));
          mounted.current?.update(render);
        }
      }
    }
    useEffect(() => {
      if (props.layout.platform !== "web" || !snapshot.initialized) return;
      const mount = mountProjectSidebar(render),
        bar = mountSidebarViewSwitcher(selectorOptions);
      mounted.current = mount;
      selector.current = bar;
      const cleanup = () => {
        mount.dispose();
        bar.dispose();
        mounted.current = null;
        selector.current = null;
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      return cleanup;
    }, [props.layout.platform, snapshot.initialized]);
    useEffect(() => {
      mounted.current?.setEnabled(selectedMode === "custom");
      mounted.current?.update(render);
      selector.current?.update(selectorOptions);
    });
    if (props.layout.platform === "web") return null;
    return (
      <SidebarRow
        icon="FolderTree"
        label={tr(selectedMode === "native" ? "原生视图" : "工作台视图")}
        onPress={() => props.openScreen({ screenId: "project-tree" })}
      />
    );
  }
  function WorkspaceRename({
    serverId,
    workspaceId,
    name,
    theme,
  }: {
    serverId: string;
    workspaceId: string;
    name: string;
    theme: PluginScreenProps["theme"];
  }) {
    const [title, setTitle] = useState(name);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const colors = theme.colors;
    const close = () => client.openScreen({ screenId: "project-tree" });
    const save = async () => {
      if (!title.trim() || pending) return;
      setPending(true);
      setError("");
      try {
        const api = getPaseoClient(serverId);
        await api.workspaces.ref(workspaceId).setTitle(title.trim());
        catalog.update(serverId, await readHostCatalog(api, serverId));
        close();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPending(false);
      }
    };
    return (
      <View style={{ padding: 24, gap: 16, backgroundColor: colors.surface0, flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 20 }}>{tr("重命名 workspace")}</Text>
        <TextInput
          accessibilityLabel={tr("工作区名称")}
          value={title}
          onChangeText={setTitle}
          editable={!pending}
          onSubmitEditing={() => {
            void save();
          }}
          style={{
            color: colors.foreground,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 6,
            padding: 10,
          }}
        />
        {error ? <Text style={{ color: colors.foreground }}>{error}</Text> : null}
        <View style={{ flexDirection: "row", gap: 20 }}>
          <Pressable
            disabled={pending || !title.trim()}
            onPress={() => {
              void save();
            }}
          >
            <Text style={{ color: colors.accent }}>{tr("保存名称")}</Text>
          </Pressable>
          <Pressable disabled={pending} onPress={close}>
            <Text style={{ color: colors.foregroundMuted }}>{tr("取消")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  function Screen(props: PluginScreenProps) {
    useLocale();
    const snapshot = useCatalog(props.host.id);
    const model = useWorkbenchModel(client, props, snapshot, refreshCatalog);
    const selectedMode = useSyncExternalStore(
      subscribeMode,
      () => mode,
      () => mode,
    );
    const [menuGroup, setMenuGroup] = useState<string | null>(null);
    const [displayPending, setDisplayPending] = useState(false);
    const [closed, setClosed] = useState(new Set<string>());
    const [error, setError] = useState("");
    const { serverId, workspaceId, agentId } = props.params;
    useEffect(() => {
      try {
        if (serverId && agentId) props.navigation?.openAgent({ serverId, agentId });
        else if (serverId && workspaceId)
          props.navigation?.openWorkspace({ serverId, workspaceId });
      } catch (cause) {
        setError(String(cause));
      }
    }, [serverId, workspaceId, agentId]);
    if (serverId && props.params.renameWorkspaceId)
      return (
        <WorkspaceRename
          key={props.params.intent}
          serverId={serverId}
          workspaceId={props.params.renameWorkspaceId}
          name={props.params.name ?? ""}
          theme={props.theme}
        />
      );
    const colors = props.theme.colors;
    const renderWorkspaces = (project: WorkbenchProject, key: string) =>
      model.workspaces
        .filter((workspace) =>
          project.workspaceRefs
            ? project.workspaceRefs.some(
                (ref) => ref.serverId === workspace.serverId && ref.id === workspace.id,
              )
            : project.instances.some(
                (instance) =>
                  instance.serverId === workspace.serverId &&
                  instance.projectId === workspace.projectId,
              ),
        )
        .map((workspace) => (
          <Pressable
            key={JSON.stringify([key, workspace.serverId, workspace.id])}
            disabled={
              !props.navigation ||
              !model.hosts.some(
                (host) =>
                  host.id === workspace.serverId &&
                  (host.status === "online" || host.status === "connected"),
              )
            }
            onPress={() =>
              props.navigation?.openWorkspace({
                serverId: workspace.serverId,
                workspaceId: workspace.id,
              })
            }
            style={{ padding: 10 }}
          >
            <Text style={{ color: colors.foreground }}>{workspace.name}</Text>
            <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
              {model.hosts.find((host) => host.id === workspace.serverId)?.name}
            </Text>
          </Pressable>
        ));
    const renderProject = (project: WorkbenchProject, key: string) => (
      <View key={key} style={{ gap: 6 }}>
        <Pressable
          onPress={() =>
            setClosed((previous) => {
              const next = new Set(previous);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        >
          <Text style={{ color: colors.foreground, fontSize: 16 }}>
            {closed.has(key) ? "›" : "⌄"} {project.name}
          </Text>
        </Pressable>
        {!closed.has(key) && renderWorkspaces(project, key)}
      </View>
    );
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(
            [
              ["workbench", "工作台视图"],
              ["native", "原生视图"],
            ] as const
          ).map(([view, name]) => (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityLabel={tr(name)}
              onPress={() => selectNavigation(view)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                backgroundColor:
                  (view === "native") === (selectedMode === "native")
                    ? colors.surface2
                    : colors.surface1,
              }}
            >
              <Text style={{ color: colors.foreground }}>{tr(name)}</Text>
            </Pressable>
          ))}
        </View>
        {selectedMode === "custom" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("知行空间")}
            onPress={() => client.openScreen({ screenId: "workbench", params: { page: "ai" } })}
            style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface1 }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{tr("知行空间")}</Text>
          </Pressable>
        )}
        {error && <Text style={{ color: colors.statusDanger }}>{error}</Text>}
        {selectedMode === "native"
          ? model.nativeProjects.map((project) => renderProject(project, project.id))
          : model.preferences.tabs
              .filter((group) => group.id !== "all")
              .map((group) => {
                const key = JSON.stringify(["workbench-group", group.id]);
                const members = projectsInGroup(model.projects, model.preferences, group);
                return (
                  <View key={key} style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() =>
                          setClosed((previous) => {
                            const next = new Set(previous);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      >
                        <Text style={{ color: colors.foreground, fontSize: 17 }}>
                          {closed.has(key) ? "›" : "⌄"} {group.name} ({members.length})
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`${tr("分组操作")} · ${group.name}`}
                        onPress={() => setMenuGroup(menuGroup === group.id ? null : group.id)}
                      >
                        <Icon name="MoreHorizontal" size={18} color={colors.foregroundMuted} />
                      </Pressable>
                    </View>
                    {menuGroup === group.id && (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!group.workspacesOnly }}
                        disabled={displayPending || !model.editable}
                        style={{ padding: 10, backgroundColor: colors.surface1 }}
                        onPress={() => {
                          setDisplayPending(true);
                          setError("");
                          setMenuGroup(null);
                          void model
                            .savePreferences({
                              tabs: model.preferences.tabs.map((tab) =>
                                tab.id === group.id
                                  ? { ...tab, workspacesOnly: !group.workspacesOnly }
                                  : tab,
                              ),
                            })
                            .catch((error) => setError(String(error)))
                            .finally(() => setDisplayPending(false));
                        }}
                      >
                        <Text style={{ color: colors.foreground }}>
                          {group.workspacesOnly ? "✓ " : ""}
                          {tr("只显示工作空间")}
                        </Text>
                      </Pressable>
                    )}
                    {!closed.has(key) && (
                      <View style={{ paddingLeft: 14, gap: 10 }}>
                        {members.map((project) =>
                          group.workspacesOnly ? (
                            <View key={project.id}>
                              {renderWorkspaces(project, JSON.stringify([group.id, project.id]))}
                            </View>
                          ) : (
                            renderProject(project, JSON.stringify([group.id, project.id]))
                          ),
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
      </ScrollView>
    );
  }
  const register = () => [
    registerWorkbench(client, (props) =>
      useWorkbenchModel(client, props, useCatalog(props.host.id, "all"), refreshCatalog),
    ),
    client.addScreen({ id: "project-tree", title: viewName, Component: Screen }),
    client.addSidebarHeaderItem({
      id: "project-tree",
      title: viewName,
      Component: Sidebar,
    }),
  ];
  let registrations: Array<() => void | Promise<void>> = [];
  let enabled = false;
  let registeredViewName = viewName;
  let stopped = false;
  let settingsTimer: ReturnType<typeof setTimeout> | undefined;
  async function refreshSettings() {
    try {
      const settings = await client.rpc(settingsRpc(projectTreeSettings.id).read, {});
      if (stopped) return;
      const values =
        settings.status === "ready" ? projectTreeSettings.schema.parse(settings.values) : null;
      const next = values?.enabled ?? false;
      const nextViewName = projectTreeViewName(values?.viewName);
      if (values && nextViewName !== viewName) {
        viewName = nextViewName;
        for (const listener of listeners) listener();
      }
      if (next !== enabled || (enabled && viewName !== registeredViewName)) {
        enabled = next;
        sync.setEnabled(next);
        for (const remove of registrations) await remove();
        registrations = !stopped && enabled ? register() : [];
        registeredViewName = viewName;
      }
    } catch {
      /* Keep the last view while its configuration Host reconnects. */
    } finally {
      if (!stopped)
        settingsTimer = setTimeout(() => {
          void refreshSettings();
        }, 2000);
    }
  }
  void refreshSettings();
  const localeCleanup = subscribeLocale(() => {
    for (const remove of registrations) void remove();
    registrations = enabled ? register() : [];
  });
  return async () => {
    stopped = true;
    sync.dispose();
    clearTimeout(settingsTimer);
    localeCleanup();
    removeCache();
    for (const cleanup of cleanups) cleanup();
    for (const remove of registrations) await remove();
  };
}
