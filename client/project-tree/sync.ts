import type { PluginHostSummary } from "@getpaseo/plugin/client";
import { applyTreeCommand, type Tree, type TreeCommand } from "../../shared/project-tree/model";
import type { createCatalog, HostCatalog } from "./catalog";
import { tr } from "../i18n";

/** Owns demand, request validity and read/write coordination for one configuration Host. */
export function createWorkbenchSync(
  catalog: ReturnType<typeof createCatalog>,
  adapter: {
    readTree(): Promise<Tree>;
    changeTree(revision: number, command: TreeCommand): Promise<Tree>;
    readHost(
      serverId: string,
      demand: {
        sessions: boolean;
        sessionLimits?: ReadonlyMap<string, number>;
        maxSessionPages?: number;
        active(): boolean;
      },
    ): Promise<HostCatalog>;
    sessionDemand(serverId: string): ReadonlyMap<string, number>;
  },
) {
  let enabled = false;
  let stopped = false;
  let users = 0;
  let historyUsers = 0;
  let workbenchUsers = 0;
  let generation = 0;
  let busy = false;
  let requested = false;
  let polling: Promise<void> | undefined;
  let syncing: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = (started = generation) =>
    !stopped && enabled && users > 0 && started === generation;
  const invalidate = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
  };
  async function synchronize() {
    if (!active() || busy) return;
    const started = generation;
    syncing = (async () => {
      const remote = await adapter.readTree();
      if (!active(started)) return;
      const projects = Object.values(catalog.read().catalogs).flatMap((entry) => entry.projects);
      const projected = applyTreeCommand(remote, { type: "discover", projects });
      const next =
        JSON.stringify(remote.nodes) === JSON.stringify(projected.nodes)
          ? remote
          : await adapter.changeTree(remote.revision, { type: "discover", projects });
      if (active(started)) catalog.organize(next);
    })();
    try {
      await syncing;
    } finally {
      syncing = undefined;
    }
  }
  function refresh(): Promise<void> {
    if (!active()) return Promise.resolve();
    requested = true;
    clearTimeout(timer);
    if (polling) return polling;
    polling = (async () => {
      while (requested && active()) {
        requested = false;
        const started = generation;
        const hostActive = (serverId: string) =>
          active(started) &&
          catalog
            .read()
            .hosts.some((host) => host.serverId === serverId && host.status === "online");
        const results = await Promise.all(
          catalog
            .read()
            .hosts.filter((host) => host.status === "online")
            .map(async (host) => {
              try {
                const limits = historyUsers
                  ? adapter.sessionDemand(host.serverId)
                  : new Map<string, number>();
                const result = await adapter.readHost(host.serverId, {
                  sessions: workbenchUsers > 0 || limits.size > 0,
                  ...(workbenchUsers ? { maxSessionPages: 2 } : { sessionLimits: limits }),
                  active: () => hostActive(host.serverId),
                });
                return { serverId: host.serverId, result };
              } catch (error) {
                return { serverId: host.serverId, error };
              }
            }),
        );
        if (active(started))
          catalog.batch(() => {
            for (const entry of results) {
              if (!hostActive(entry.serverId)) continue;
              if (entry.result) catalog.update(entry.serverId, entry.result);
              else catalog.error(entry.serverId, entry.error);
            }
          });
        if (active(started) && !busy) {
          try {
            await synchronize();
            if (active(started) && !busy) catalog.connection(true);
          } catch (error) {
            if (active(started))
              catalog.connection(false, error instanceof Error ? error.message : String(error));
          }
        }
      }
    })().finally(() => {
      polling = undefined;
      if (active())
        timer = setTimeout(() => {
          void refresh();
        }, 5000);
    });
    return polling;
  }
  return {
    async refresh(serverId?: string) {
      await refresh();
      if (serverId === undefined) return;
      if (!active()) throw new Error(tr("工作台已停用。"));
      const snapshot = catalog.read();
      const host = snapshot.hosts.find((entry) => entry.serverId === serverId);
      if (host?.status !== "online") throw new Error(`${host?.label ?? serverId} · ${tr("离线")}`);
      if (snapshot.errors[serverId]) throw new Error(snapshot.errors[serverId]);
    },
    hosts(hosts: readonly PluginHostSummary[]) {
      if (stopped || JSON.stringify(hosts) === JSON.stringify(catalog.read().hosts)) return;
      invalidate();
      catalog.hosts(hosts);
      if (active()) void refresh();
    },
    setEnabled(next: boolean) {
      if (stopped || enabled === next) return;
      enabled = next;
      invalidate();
      if (next && users) void refresh();
      else catalog.connection(false);
    },
    reset() {
      invalidate();
    },
    acquire(history: boolean | "all" = false) {
      if (stopped) return () => {};
      users++;
      if (history) historyUsers++;
      if (history === "all") workbenchUsers++;
      if (users === 1 || (history && historyUsers === 1) || history === "all") void refresh();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        users--;
        if (history) historyUsers--;
        if (history === "all") workbenchUsers--;
        if (!users) {
          invalidate();
          catalog.connection(false);
        }
      };
    },
    async run(command: TreeCommand) {
      if (!active() || busy || !catalog.read().editable)
        throw new Error(tr("配置 Host 当前不可编辑，请等待恢复连接。"));
      const started = generation;
      busy = true;
      catalog.connection(false);
      try {
        if (syncing) await syncing;
        if (!active(started)) throw new Error(tr("工作台已停用。"));
        const next = await adapter.changeTree(catalog.read().tree.revision, command);
        if (!active(started)) throw new Error(tr("工作台已停用。"));
        catalog.organize(next);
        catalog.connection(true);
      } catch (error) {
        if (active(started))
          catalog.connection(false, error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose() {
      stopped = true;
      invalidate();
    },
  };
}
