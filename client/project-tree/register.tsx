import {
  getPaseoClient,
  useHosts,
  type PluginClientContext,
  type PluginScreenProps,
  type PluginSidebarItemProps,
  type PluginHostSummary,
} from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  catalogCacheSchema,
  createCatalog,
  projectWorkspaces,
  projectAvailable,
  readHostCatalog,
  type CatalogWorkspace,
} from "./catalog";
import { mountProjectSidebar, renderProjectSidebar } from "../web";
import { loadDevicePreferences, readDevicePreference, writeDevicePreference } from "./device";
import { tr, useLocale } from "../i18n";
import { subscribeLocale } from "../chat-view/locale";
import {
  changeProjectTree,
  DEFAULT_PROJECT_TREE_VIEW_NAME,
  readProjectTree,
  readProjectTreeHistory,
  saveProjectTreeSnapshot,
  restoreProjectTreeSnapshot,
  undoProjectTree,
  projectTreeSettings,
  projectTreeViewName,
} from "../../shared/project-tree/contracts";
import {
  applyTreeCommand,
  memberKey,
  type TreeCommand,
  type TreeNodeAction,
} from "../../shared/project-tree/model";
import { visibleTreeRows } from "../../shared/project-tree/projection";
import { registerWorkbench } from "../workbench/register";
import { useWorkbenchModel } from "../workbench/data";
import { NodeActionsDialog } from "./node-actions";
import { mountProjectTreeMenu } from "./native-menu";

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
  let mode = "custom";
  let showHidden = false;
  const listeners = new Set<() => void>();
  const collapsed = new Set<string>();
  const sessionLimits = new Map<string, number>();
  const sessionVisibility = new Map<string, boolean>();
  let showSessionsByDefault = false;
  let viewName = DEFAULT_PROJECT_TREE_VIEW_NAME;
  let configuration: Promise<void> | null = null;
  function configureSource(id: string) {
    if (configuration && sourceId === id) return configuration;
    sourceId = id;
    epoch += 1;
    collapsed.clear();
    sessionVisibility.clear();
    sessionLimits.clear();
    configuration = (async () => {
      await loadDevicePreferences(
        ["cache", "view", "collapsed", "showHidden", "sessionProjects", "sessionVisibility"].map(
          preferenceKey,
        ),
      );
      if (stopped || sourceId !== id) return;
      mode = readDevicePreference(preferenceKey("view")) === "native" ? "native" : "custom";
      showHidden = readDevicePreference(preferenceKey("showHidden")) === "true";
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
      try {
        const saved: unknown = JSON.parse(
          readDevicePreference(preferenceKey("sessionProjects")) ?? "[]",
        );
        if (Array.isArray(saved))
          for (const id of saved) if (typeof id === "string") sessionVisibility.set(id, true);
        const overrides: unknown = JSON.parse(
          readDevicePreference(preferenceKey("sessionVisibility")) ?? "[]",
        );
        if (Array.isArray(overrides))
          for (const entry of overrides)
            if (
              Array.isArray(entry) &&
              typeof entry[0] === "string" &&
              typeof entry[1] === "boolean"
            )
              sessionVisibility.set(entry[0], entry[1]);
      } catch {
        /* Ignore stale device preferences. */
      }
      catalog.restore(cached);
      for (const listener of listeners) listener();
    })();
    return configuration;
  }
  function setMode(next: "custom" | "native") {
    mode = next;
    if (sourceId) writeDevicePreference(preferenceKey("view"), next);
    for (const listener of listeners) listener();
  }
  function setShowHidden(next: boolean) {
    showHidden = next;
    if (sourceId) writeDevicePreference(preferenceKey("showHidden"), String(next));
    for (const listener of listeners) listener();
  }
  const subscribeMode = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const cleanups = new Set<() => void>();
  let busy = false;
  let epoch = 0;
  let pollUsers = 0;
  let historyUsers = 0;
  let workbenchUsers = 0;
  let history = {
    canUndo: false,
    workbenchRevision: undefined as number | undefined,
    snapshots: [] as Array<{
      id: string;
      name: string;
      createdAt: string;
      preview?: {
        nodesChanged: number;
        workspacePlacementsChanged: boolean;
        tabsChanged?: boolean;
        favoritesChanged?: boolean;
        scenariosChanged?: boolean;
      };
    }>,
  };
  async function refreshHistory() {
    const result = await client.rpc(readProjectTreeHistory, {});
    history = {
      canUndo: result.canUndo,
      snapshots: result.snapshots,
      workbenchRevision: result.workbenchRevision,
    };
    for (const listener of listeners) listener();
  }
  async function changeHistory(action: "save" | "restore" | "undo", value = "") {
    if (busy || !catalog.read().editable) throw new Error("配置 Host 当前不可编辑。");
    busy = true;
    try {
      if (syncing) await syncing;
      const revision = catalog.read().tree.revision;
      const next =
        action === "save"
          ? await client.rpc(saveProjectTreeSnapshot, { revision, name: value })
          : action === "restore"
            ? await client.rpc(restoreProjectTreeSnapshot, {
                revision,
                snapshotId: value,
                workbenchRevision: history.workbenchRevision,
              })
            : await client.rpc(undoProjectTree, {
                revision,
                workbenchRevision: history.workbenchRevision,
              });
      catalog.organize(next);
      await refreshHistory();
    } catch (cause) {
      catalog.connection(false, cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      busy = false;
    }
  }
  let pollGeneration = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let liveHosts: readonly PluginHostSummary[] = [];
  let syncing: Promise<void> | null = null;
  function synchronize() {
    if (syncing) return syncing;
    const started = epoch;
    syncing = (async () => {
      const remote = await client.rpc(readProjectTree, {});
      if (stopped || !enabled || !pollUsers || started !== epoch) return;
      const projects = Object.values(catalog.read().catalogs).flatMap((entry) => entry.projects);
      const projected = applyTreeCommand(remote, { type: "discover", projects });
      const next =
        JSON.stringify(remote.nodes) === JSON.stringify(projected.nodes)
          ? remote
          : await client.rpc(changeProjectTree, {
              revision: remote.revision,
              command: { type: "discover", projects },
            });
      if (!stopped && enabled && pollUsers && started === epoch) {
        catalog.organize(next);
        await refreshHistory();
      }
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  }
  async function run(command: TreeCommand) {
    if (busy || !catalog.read().editable)
      throw new Error(tr("配置 Host 当前不可编辑，请等待恢复连接。"));
    busy = true;
    catalog.connection(false);
    try {
      if (syncing) await syncing;
      if (stopped || !enabled) throw new Error(tr("工作台已停用。"));
      const next = await client.rpc(changeProjectTree, {
        revision: catalog.read().tree.revision,
        command,
      });
      if (!stopped && enabled) {
        catalog.organize(next);
        catalog.connection(true);
        await refreshHistory();
      }
    } catch (error) {
      if (!stopped && enabled)
        catalog.connection(false, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      busy = false;
    }
  }
  async function createWorkspace(
    groupId: string,
    serverId: string,
    path: string,
    title: string,
    mergeId?: string,
  ) {
    if (!catalog.read().editable) throw new Error(tr("配置 Host 当前不可编辑，请等待恢复连接。"));
    const api = getPaseoClient(serverId);
    catalog.update(serverId, await readHostCatalog(api, serverId));
    await synchronize();
    if (stopped || !enabled || !catalog.read().editable)
      throw new Error(tr("工作台已停用或配置 Host 已断开。"));
    const known = new Set([
      ...Object.values(catalog.read().catalogs)
        .flatMap((entry) => entry.projects)
        .map(memberKey),
      ...catalog
        .read()
        .tree.nodes.flatMap((node) => (node.kind === "project" ? node.members.map(memberKey) : [])),
    ]);
    const projects = catalog.read().catalogs[serverId]?.projects ?? [];
    path = path.trim();
    const normalizedPath = path.replace(/\/+$/, "");
    const existing = projects
      .filter(
        (project) =>
          normalizedPath === project.root.replace(/\/+$/, "") ||
          normalizedPath.startsWith(`${project.root.replace(/\/+$/, "")}/`),
      )
      .sort((a, b) => b.root.length - a.root.length)[0];
    const workspace = await api.workspaces.create({
      ...(title ? { title } : {}),
      source: { kind: "directory", path, ...(existing ? { projectId: existing.projectId } : {}) },
    });
    const current = await workspace.refresh();
    if (!current) throw new Error(tr("工作区已创建，请刷新后检查归属。"));
    if (stopped || !enabled) return;
    catalog.update(serverId, await readHostCatalog(api, serverId));
    await synchronize();
    const member = { serverId, projectId: current.projectId };
    const group = catalog
      .read()
      .tree.nodes.find(
        (node) =>
          node.kind === "project" &&
          node.members.some((entry) => memberKey(entry) === memberKey(member)),
      );
    if (!known.has(memberKey(member)))
      await run({ type: "placeNewProject", targetId: groupId, member });
    else if (group && group.id !== groupId) {
      if (group.id !== mergeId)
        throw new Error(tr("工作区已创建，但实际项目归属发生变化；请通过项目节点的菜单确认合并。"));
      await run({ type: "merge", sourceId: group.id, targetId: groupId });
    }
  }
  function sessionDemand(serverId: string) {
    const limits = new Map<string, number>();
    if (!historyUsers || mode !== "custom") return limits;
    const snapshot = catalog.read();
    for (const node of snapshot.tree.nodes) {
      if (node.kind !== "project" || (node.hidden && !showHidden)) continue;
      let current: (typeof snapshot.tree.nodes)[number] | undefined = node;
      let closed = false;
      while (current) {
        if (collapsed.has(current.id) || (current.hidden && !showHidden)) {
          closed = true;
          break;
        }
        current = snapshot.tree.nodes.find((entry) => entry.id === current!.parentId);
      }
      if (closed) continue;
      for (const workspace of projectWorkspaces(snapshot, node.members, node.id)) {
        const visible =
          sessionVisibility.get(`${workspace.serverId}:${workspace.id}`) ??
          sessionVisibility.get(node.id) ??
          showSessionsByDefault;
        if (visible && workspace.serverId === serverId)
          limits.set(
            workspace.id,
            sessionLimits.get(JSON.stringify([serverId, workspace.id])) ?? 5,
          );
      }
    }
    return limits;
  }
  let polling = false;
  let refreshRequested = false;
  async function refreshCatalog() {
    if (stopped || !enabled || !pollUsers) return;
    if (polling) {
      refreshRequested = true;
      return;
    }
    polling = true;
    clearTimeout(pollTimer);
    const generation = pollGeneration;
    const active = () => !stopped && enabled && pollUsers > 0 && generation === pollGeneration;
    const results = await Promise.all(
      liveHosts
        .filter((host) => host.status === "online")
        .map(async (host) => {
          try {
            const limits = sessionDemand(host.serverId);
            const result = await readHostCatalog(getPaseoClient(host.serverId), host.serverId, {
              sessions: workbenchUsers > 0 || limits.size > 0,
              ...(workbenchUsers ? { maxSessionPages: 2 } : { sessionLimits: limits }),
              active: () =>
                active() &&
                liveHosts.some(
                  (entry) => entry.serverId === host.serverId && entry.status === "online",
                ),
            });
            return { serverId: host.serverId, result };
          } catch (error) {
            return { serverId: host.serverId, error };
          }
        }),
    );
    if (active())
      catalog.batch(() => {
        for (const entry of results) {
          if (entry.result) catalog.update(entry.serverId, entry.result);
          else catalog.error(entry.serverId, entry.error);
        }
      });
    if (active() && !busy) {
      try {
        await synchronize();
        if (active() && !busy) catalog.connection(true);
      } catch (error) {
        if (active())
          catalog.connection(false, error instanceof Error ? error.message : String(error));
      }
    }
    polling = false;
    if (!stopped && enabled && pollUsers) {
      const delay = refreshRequested || !active() ? 0 : 5000;
      refreshRequested = false;
      pollTimer = setTimeout(() => {
        void refreshCatalog();
      }, delay);
    }
  }
  function useCatalog(configurationHost: string, demand: boolean | "all" = false) {
    const hosts = useHosts();
    const signature = JSON.stringify(hosts);
    useEffect(() => {
      catalog.hosts(hosts);
      liveHosts = hosts;
      let alive = true;
      let acquired = false;
      void configureSource(configurationHost)
        .then(() => {
          if (!alive || stopped) return;
          acquired = true;
          pollUsers += 1;
          if (demand) historyUsers += 1;
          if (demand === "all") workbenchUsers += 1;
          if (pollUsers === 1) void refreshCatalog();
        })
        .catch((error: unknown) => {
          if (alive)
            catalog.connection(false, error instanceof Error ? error.message : String(error));
        });
      const stop = () => {
        alive = false;
        if (acquired) {
          pollUsers -= 1;
          if (demand) historyUsers -= 1;
          if (demand === "all") workbenchUsers -= 1;
          if (!pollUsers) {
            pollGeneration += 1;
            epoch += 1;
            clearTimeout(pollTimer);
          }
        }
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
    const selectedMode = useSyncExternalStore(
      subscribeMode,
      () => mode,
      () => mode,
    );
    const selectedHidden = useSyncExternalStore(
      subscribeMode,
      () => showHidden,
      () => showHidden,
    );
    const selectedSessionsDefault = useSyncExternalStore(
      subscribeMode,
      () => showSessionsByDefault,
      () => showSessionsByDefault,
    );
    const selectedViewName = useSyncExternalStore(
      subscribeMode,
      () => viewName,
      () => viewName,
    );
    const treeHistory = useSyncExternalStore(
      subscribeMode,
      () => history,
      () => history,
    );
    const mounted = useRef<ReturnType<typeof mountProjectSidebar> | null>(null);
    const render = (container: Parameters<typeof renderProjectSidebar>[0]) =>
      renderProjectSidebar(container, {
        snapshot,
        history: treeHistory,
        saveSnapshot: (name) => changeHistory("save", name),
        restoreSnapshot: (id) => changeHistory("restore", id),
        undo: () => changeHistory("undo"),
        theme: props.theme,
        collapsed,
        sessionLimits,
        sessionVisibility,
        loadSessions() {
          void refreshCatalog();
        },
        showSessionsByDefault: selectedSessionsDefault,
        viewName: selectedViewName,
        toggleSessions(id) {
          sessionVisibility.set(id, !(sessionVisibility.get(id) ?? showSessionsByDefault));
          writeDevicePreference(
            preferenceKey("sessionVisibility"),
            JSON.stringify([...sessionVisibility]),
          );
          mounted.current?.update(render);
          void refreshCatalog();
        },
        openSession(workspace, session) {
          props.openScreen({
            screenId: "project-tree",
            params: { serverId: workspace.serverId, agentId: session.id },
          });
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
        run,
        native() {
          setMode("native");
        },
        showHidden: selectedHidden,
        toggleHidden() {
          setShowHidden(!selectedHidden);
        },
        move(id, parentId, beforeId) {
          void run({ type: "move", id, parentId, ...(beforeId ? { beforeId } : {}) }).catch(
            () => {},
          );
        },
        moveWorkspace(workspace, targetId) {
          void run({
            type: "moveWorkspace",
            serverId: workspace.serverId,
            workspaceId: workspace.id,
            targetId,
          }).catch(() => {});
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
    useEffect(() => {
      if (props.layout.platform !== "web" || !snapshot.initialized) return;
      const mount = mountProjectSidebar(render);
      mounted.current = mount;
      const cleanup = () => {
        mount.dispose();
        mounted.current = null;
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      return cleanup;
    }, [props.layout.platform, snapshot.initialized]);
    useEffect(() => {
      mounted.current?.setEnabled(selectedMode === "custom");
      mounted.current?.update(render);
    });
    useEffect(() => {
      if (props.layout.platform !== "web" || !snapshot.initialized) return;
      const remove = mountProjectTreeMenu({
        title: selectedViewName,
        theme: props.theme,
        open: () => setMode("custom"),
      });
      const cleanup = () => {
        remove();
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      return cleanup;
    }, [props.layout.platform, props.theme, snapshot.initialized]);
    if (props.layout.platform === "web") return null;
    return (
      <SidebarRow
        icon="FolderTree"
        label={selectedViewName}
        onPress={() => {
          props.openScreen({ screenId: "project-tree" });
        }}
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
    const selectedViewName = useSyncExternalStore(
      subscribeMode,
      () => viewName,
      () => viewName,
    );
    const selectedHidden = useSyncExternalStore(
      subscribeMode,
      () => showHidden,
      () => showHidden,
    );
    const [error, setError] = useState("");
    const [snapshotName, setSnapshotName] = useState("");
    const treeHistory = useSyncExternalStore(
      subscribeMode,
      () => history,
      () => history,
    );
    const historyAction = (action: "save" | "restore" | "undo", value = "") => {
      void changeHistory(action, value).catch((cause) => setError(String(cause)));
    };
    const [closed, setClosed] = useState(() => new Set(collapsed));
    useEffect(() => {
      if (snapshot.initialized) setClosed(new Set(collapsed));
    }, [snapshot.initialized]);
    const [intent, setIntent] = useState<{
      nodeId?: string;
      action: TreeNodeAction;
      key: number;
    } | null>(null);
    const { serverId, workspaceId, agentId } = props.params;
    const open = (workspace: Pick<CatalogWorkspace, "serverId" | "id">) => {
      try {
        if (!props.navigation) throw new Error(tr("当前客户端不支持工作区导航，请更新 Paseo。"));
        props.navigation.openWorkspace({ serverId: workspace.serverId, workspaceId: workspace.id });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    useEffect(() => {
      if (serverId && agentId) {
        if (props.navigation) props.navigation.openAgent({ serverId, agentId });
        else setError(tr("当前客户端不支持工作区导航，请更新 Paseo。"));
      } else if (serverId && workspaceId) open({ serverId, id: workspaceId });
    }, [serverId, workspaceId, agentId]);
    const colors = props.theme.colors;
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
    const treeRows = visibleTreeRows(snapshot.tree, {
      showHidden: selectedHidden,
      collapsed: closed,
    });
    const renderNodes = () =>
      treeRows
        .filter(
          ({ node }) => node.kind === "folder" || projectAvailable(snapshot, node.members, node.id),
        )
        .map(({ node, depth, showContainer, hidden }) => (
          <View
            key={node.id}
            style={{ gap: 6, paddingLeft: depth * 12, opacity: hidden ? 0.6 : 1 }}
          >
            {showContainer && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 }}>
                <Pressable
                  style={{ flex: 1, flexDirection: "row", gap: 8 }}
                  onPress={() =>
                    setClosed((previous) => {
                      const next = new Set(previous);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      collapsed.clear();
                      for (const id of next) collapsed.add(id);
                      writeDevicePreference(preferenceKey("collapsed"), JSON.stringify([...next]));
                      return next;
                    })
                  }
                >
                  <Icon
                    name={closed.has(node.id) ? "ChevronRight" : "ChevronDown"}
                    size={16}
                    color={colors.foregroundMuted}
                  />
                  <Text style={{ color: colors.foreground, fontSize: 15 }}>
                    {node.name}
                    {node.hidden ? " · 隐藏" : ""}
                    {node.flattened ? " · 平铺" : ""}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${tr("项目操作")} · ${node.name}`}
                  onPress={() => setIntent({ nodeId: node.id, action: "menu", key: Date.now() })}
                >
                  <Icon name="MoreVertical" size={18} color={colors.foregroundMuted} />
                </Pressable>
              </View>
            )}
            {node.kind === "project" &&
              (!showContainer || !closed.has(node.id)) &&
              projectWorkspaces(snapshot, node.members, node.id).map((workspace) => {
                const host = snapshot.hosts.find((h) => h.serverId === workspace.serverId);
                return (
                  <Pressable
                    key={JSON.stringify([workspace.serverId, workspace.id])}
                    disabled={host?.status !== "online"}
                    onPress={() => open(workspace)}
                    style={{ padding: 10, opacity: host?.status === "online" ? 1 : 0.5 }}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 15 }}>{workspace.name}</Text>
                    <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
                      {host?.label ?? workspace.serverId}
                      {host?.status === "online" ? "" : " · 离线"}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        ));
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        contentContainerStyle={{ padding: props.layout.compact ? 16 : 24, gap: 12 }}
      >
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "600" }}>
          {selectedViewName}
        </Text>
        {props.layout.platform === "web" && (
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={() => setMode("custom")}>
              <Text style={{ color: colors.accent }}>{tr("自定义视图")}</Text>
            </Pressable>
            <Pressable onPress={() => setMode("native")}>
              <Text style={{ color: colors.accent }}>{tr("原生视图")}</Text>
            </Pressable>
          </View>
        )}
        {error ? <Text style={{ color: colors.foreground }}>{error}</Text> : null}
        <Pressable onPress={() => setShowHidden(!selectedHidden)}>
          <Text style={{ color: colors.accent }}>
            {selectedHidden ? "✓ " : ""}
            {tr("显示隐藏节点")}
          </Text>
        </Pressable>
        <Text style={{ color: colors.foregroundMuted }}>
          {tr("配置 Host")}: {props.host.label}
        </Text>
        <Text style={{ color: colors.foregroundMuted }}>
          {tr("所有客户端请选择同一配置 Host；仅在该 Host 启用工作台。")}
        </Text>
        {snapshot.organizationError ? (
          <Text style={{ color: colors.foregroundMuted }}>{snapshot.organizationError}</Text>
        ) : null}
        <Pressable onPress={() => setIntent({ action: "folder", key: Date.now() })}>
          <Text style={{ color: colors.accent }}>{tr("新建分类文件夹")}</Text>
        </Pressable>
        {intent && (
          <NodeActionsDialog
            key={intent.key}
            nodeId={intent.nodeId}
            initialAction={intent.action}
            snapshot={snapshot}
            theme={props.theme}
            run={run}
            createWorkspace={createWorkspace}
            onClose={() => setIntent((current) => (current?.key === intent.key ? null : current))}
          />
        )}
        {snapshot.hosts.map((host) =>
          snapshot.errors[host.serverId] ? (
            <Text key={host.serverId} style={{ color: colors.foregroundMuted }}>
              {host.label}: {snapshot.errors[host.serverId]}
            </Text>
          ) : null,
        )}
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 16 }}>视图快照</Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            保存树、标签页、收藏和场景配置，不撤销真实项目、工作区或会话。
          </Text>
          <TextInput
            accessibilityLabel="快照名称"
            value={snapshotName}
            onChangeText={setSnapshotName}
            placeholder="快照名称"
            placeholderTextColor={colors.foregroundMuted}
            style={{
              color: colors.foreground,
              borderColor: colors.border,
              borderWidth: 1,
              padding: 10,
            }}
          />
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable
              disabled={!snapshot.editable || !snapshotName.trim()}
              onPress={() => historyAction("save", snapshotName.trim())}
            >
              <Text style={{ color: colors.accent }}>保存快照</Text>
            </Pressable>
            <Pressable
              disabled={!snapshot.editable || !treeHistory.canUndo}
              onPress={() => historyAction("undo")}
            >
              <Text style={{ color: colors.accent, opacity: treeHistory.canUndo ? 1 : 0.5 }}>
                撤销上一次视图修改
              </Text>
            </Pressable>
          </View>
          {treeHistory.snapshots.map((item) => (
            <Pressable
              key={item.id}
              disabled={!snapshot.editable}
              onPress={() => historyAction("restore", item.id)}
            >
              <Text style={{ color: colors.accent }}>
                恢复 · {item.name}
                {item.preview
                  ? `（${item.preview.nodesChanged} 个节点变更${item.preview.tabsChanged ? "，标签页" : ""}${item.preview.favoritesChanged ? "，收藏" : ""}${item.preview.scenariosChanged ? "，场景" : ""}）`
                  : ""}
              </Text>
            </Pressable>
          ))}
        </View>
        {renderNodes()}
        {!snapshot.tree.nodes.length && (
          <Text style={{ color: colors.foregroundMuted }}>{tr("正在读取项目…")}</Text>
        )}
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
      if (
        values &&
        (values.showSessionsByDefault !== showSessionsByDefault || nextViewName !== viewName)
      ) {
        showSessionsByDefault = values.showSessionsByDefault;
        viewName = nextViewName;
        for (const listener of listeners) listener();
      }
      if (next !== enabled || (enabled && viewName !== registeredViewName)) {
        if (next !== enabled) epoch += 1;
        enabled = next;
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
    epoch += 1;
    clearTimeout(settingsTimer);
    localeCleanup();
    removeCache();
    for (const cleanup of cleanups) cleanup();
    for (const remove of registrations) await remove();
  };
}
