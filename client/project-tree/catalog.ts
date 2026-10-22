import type { PaseoApi, PaseoAgentListResult } from "@getpaseo/client";
import type { PluginHostSummary } from "@getpaseo/plugin/client";
import { applyTreeCommand, emptyTree, memberKey, type Tree } from "../../shared/project-tree/model";
import { treeSchema } from "../../shared/project-tree/model";
import { z } from "zod";

export interface CatalogProject {
  serverId: string;
  projectId: string;
  name: string;
  key?: string;
  root: string;
}
export interface CatalogWorkspace {
  serverId: string;
  projectId: string;
  id: string;
  name: string;
  cwd: string;
  worktreeSlug?: string;
  diffStat?: { additions: number; deletions: number } | null;
  currentBranch?: string | null;
}
export interface HostCatalog {
  projects: CatalogProject[];
  workspaces: CatalogWorkspace[];
  sessions?: CatalogSession[];
  sessionCounts?: Record<string, number>;
}
export interface CatalogSession {
  id: string;
  workspaceId: string;
  title: string | null;
  updatedAt: string;
}
export const catalogCacheSchema = z.object({
  tree: treeSchema,
  catalogs: z.record(
    z.string(),
    z.object({
      sessionCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
      sessions: z
        .array(
          z.object({
            id: z.string(),
            workspaceId: z.string(),
            title: z.string().nullable(),
            updatedAt: z.string(),
          }),
        )
        .optional(),
      projects: z.array(
        z.object({
          serverId: z.string(),
          projectId: z.string(),
          name: z.string(),
          key: z.string().optional(),
          root: z.string(),
        }),
      ),
      workspaces: z.array(
        z.object({
          serverId: z.string(),
          projectId: z.string(),
          id: z.string(),
          name: z.string(),
          cwd: z.string(),
          worktreeSlug: z.string().optional(),
          diffStat: z
            .object({ additions: z.number(), deletions: z.number() })
            .nullable()
            .optional(),
          currentBranch: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});
export interface CatalogSnapshot {
  hosts: readonly PluginHostSummary[];
  catalogs: Record<string, HostCatalog>;
  tree: Tree;
  errors: Record<string, string>;
  editable: boolean;
  organizationError: string;
  initialized: boolean;
}

/** Uses the public SDK, including pagination. Background and archived workspaces remain excluded. */
export async function readHostCatalog(
  api: PaseoApi,
  serverId: string,
  demand: {
    sessions?: boolean;
    active?: () => boolean;
    sessionLimits?: ReadonlyMap<string, number>;
  } = {},
): Promise<HostCatalog> {
  const checkActive = () => {
    if (demand.active && !demand.active()) throw new Error("Catalog read stopped");
  };
  checkActive();
  const { projects } = await api.projects.list();
  checkActive();
  const workspaces: CatalogWorkspace[] = [];
  let cursor: string | undefined;
  do {
    checkActive();
    const page = await api.workspaces.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
    checkActive();
    for (const workspace of page.entries) {
      if (workspace.background || workspace.archivingAt) continue;
      const branch = workspace.gitRuntime?.currentBranch?.trim();
      workspaces.push({
        serverId,
        projectId: workspace.projectId,
        id: workspace.id,
        name: workspace.name,
        cwd: workspace.workspaceDirectory,
        worktreeSlug: workspace.worktreeSlug,
        diffStat: workspace.diffStat,
        currentBranch: branch && branch !== "HEAD" ? branch : null,
      });
    }
    const next = page.pageInfo.nextCursor;
    if (next && next === cursor) throw new Error("Workspace pagination did not advance");
    cursor = next ?? undefined;
  } while (cursor);
  const sessions: CatalogSession[] = [];
  const sessionCounts: Record<string, number> = {};
  const retained = new Map<string, number>();
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  cursor = undefined;
  if (demand.sessions !== false)
    do {
      checkActive();
      const page: PaseoAgentListResult = await api.agents.list({
        filter: { includeArchived: true },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
      });
      checkActive();
      for (const { agent } of page.entries) {
        if (!agent.workspaceId || !workspaceIds.has(agent.workspaceId) || agent.internal) continue;
        const limit = demand.sessionLimits?.get(agent.workspaceId);
        if (demand.sessionLimits && limit === undefined) continue;
        sessionCounts[agent.workspaceId] = (sessionCounts[agent.workspaceId] ?? 0) + 1;
        const count = retained.get(agent.workspaceId) ?? 0;
        if (limit !== undefined && count >= limit) continue;
        retained.set(agent.workspaceId, count + 1);
        sessions.push({
          id: agent.id,
          workspaceId: agent.workspaceId,
          title: agent.title,
          updatedAt: agent.updatedAt,
        });
      }
      const next = page.pageInfo.nextCursor;
      if (next && next === cursor) throw new Error("Session pagination did not advance");
      cursor = next ?? undefined;
    } while (cursor);
  return {
    sessions,
    ...(demand.sessionLimits ? { sessionCounts } : {}),
    projects: projects.map((project) => ({
      serverId,
      projectId: project.projectId,
      name: project.projectDisplayName,
      key: project.projectKey,
      root: project.projectRootPath,
    })),
    workspaces,
  };
}

export function createCatalog(cache?: z.infer<typeof catalogCacheSchema>) {
  let organized = cache?.tree ?? emptyTree();
  let snapshot: CatalogSnapshot = {
    hosts: [],
    catalogs: cache?.catalogs ?? {},
    tree: organized,
    errors: {},
    editable: false,
    organizationError: "",
    initialized: !!cache,
  };
  const listeners = new Set<() => void>();
  let batching = 0;
  let pending = false;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const publish = (next: CatalogSnapshot) => {
    snapshot = next;
    if (batching) pending = true;
    else notify();
  };
  return {
    read: () => snapshot,
    batch(update: () => void) {
      batching++;
      try {
        update();
      } finally {
        if (--batching === 0 && pending) {
          pending = false;
          notify();
        }
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hosts(hosts: readonly PluginHostSummary[]) {
      const retained = new Set(hosts.map((host) => host.serverId));
      const catalogs = Object.fromEntries(
        Object.entries(snapshot.catalogs).filter(([id]) => retained.has(id)),
      );
      publish({ ...snapshot, hosts, catalogs });
    },
    restore(cache?: z.infer<typeof catalogCacheSchema>) {
      organized = cache?.tree ?? emptyTree();
      const retained = new Set(snapshot.hosts.map((host) => host.serverId));
      const catalogs = Object.fromEntries(
        Object.entries(cache?.catalogs ?? {}).filter(([id]) => retained.has(id)),
      );
      publish({ ...snapshot, catalogs, tree: organized, initialized: true });
    },
    update(serverId: string, catalog: HostCatalog) {
      if (
        !snapshot.errors[serverId] &&
        JSON.stringify(snapshot.catalogs[serverId]) === JSON.stringify(catalog)
      )
        return;
      const catalogs = { ...snapshot.catalogs, [serverId]: catalog };
      const errors = { ...snapshot.errors };
      delete errors[serverId];
      const projects = Object.values(catalogs).flatMap((entry) => entry.projects);
      publish({
        ...snapshot,
        catalogs,
        errors,
        tree: applyTreeCommand(organized, { type: "discover", projects }),
      });
    },
    error(serverId: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (snapshot.errors[serverId] === message) return;
      publish({
        ...snapshot,
        errors: {
          ...snapshot.errors,
          [serverId]: message,
        },
      });
    },
    organize(tree: Tree) {
      organized = tree;
      if (JSON.stringify(snapshot.tree) !== JSON.stringify(tree)) publish({ ...snapshot, tree });
    },
    connection(editable: boolean, organizationError = "") {
      if (snapshot.editable !== editable || snapshot.organizationError !== organizationError)
        publish({ ...snapshot, editable, organizationError });
    },
  };
}

const derived = new WeakMap<CatalogSnapshot, ReturnType<typeof indexCatalog>>();
const workspaceKey = (workspace: { serverId: string; id: string }) =>
  JSON.stringify([workspace.serverId, workspace.id]);
function indexCatalog(snapshot: CatalogSnapshot) {
  const members = new Map<string, CatalogWorkspace[]>();
  const nodes = new Map<string, CatalogWorkspace[]>();
  const order = new Map<CatalogWorkspace, number>();
  const placements = new Map(
    (snapshot.tree.workspacePlacements ?? []).map((entry) => [
      JSON.stringify([entry.serverId, entry.workspaceId]),
      entry.nodeId,
    ]),
  );
  const hosts = new Set(snapshot.hosts.map((host) => host.serverId));
  const projects = new Set<string>();
  const sessions = new Map<string, CatalogSession[]>();
  const children = new Map<string | null, Tree["nodes"]>();
  for (const node of snapshot.tree.nodes) {
    const entries = children.get(node.parentId) ?? [];
    entries.push(node);
    children.set(node.parentId, entries);
  }
  for (const [serverId, catalog] of Object.entries(snapshot.catalogs)) {
    if (!hosts.has(serverId)) continue;
    for (const project of catalog.projects) projects.add(memberKey(project));
    for (const workspace of catalog.workspaces) {
      order.set(workspace, order.size);
      const placement = placements.get(workspaceKey(workspace));
      const map = placement === undefined ? members : nodes;
      const key = placement === undefined ? memberKey(workspace) : placement;
      const entries = map.get(key) ?? [];
      entries.push(workspace);
      map.set(key, entries);
    }
    for (const session of catalog.sessions ?? []) {
      const key = JSON.stringify([serverId, session.workspaceId]);
      const entries = sessions.get(key) ?? [];
      entries.push(session);
      sessions.set(key, entries);
    }
  }
  for (const entries of sessions.values())
    entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return {
    members,
    nodes,
    order,
    projects,
    sessions,
    children,
    queries: new Map<string, CatalogWorkspace[]>(),
  };
}
function catalogIndex(snapshot: CatalogSnapshot) {
  let index = derived.get(snapshot);
  if (!index) {
    index = indexCatalog(snapshot);
    derived.set(snapshot, index);
  }
  return index;
}
export function projectWorkspaces(
  snapshot: CatalogSnapshot,
  members: Array<{ serverId: string; projectId: string }>,
  nodeId?: string,
) {
  const index = catalogIndex(snapshot);
  const keys = [...new Set(members.map(memberKey))];
  const query = JSON.stringify([nodeId, keys]);
  let result = index.queries.get(query);
  if (!result) {
    result = [
      ...(nodeId === undefined ? [] : (index.nodes.get(nodeId) ?? [])),
      ...keys.flatMap((key) => index.members.get(key) ?? []),
    ];
    result.sort((a, b) => index.order.get(a)! - index.order.get(b)!);
    index.queries.set(query, result);
  }
  return result;
}
export function workspaceSessions(
  snapshot: CatalogSnapshot,
  workspace: Pick<CatalogWorkspace, "serverId" | "id">,
) {
  return catalogIndex(snapshot).sessions.get(workspaceKey(workspace)) ?? [];
}
export function workspaceSessionCount(
  snapshot: CatalogSnapshot,
  workspace: Pick<CatalogWorkspace, "serverId" | "id">,
) {
  return (
    snapshot.catalogs[workspace.serverId]?.sessionCounts?.[workspace.id] ??
    workspaceSessions(snapshot, workspace).length
  );
}
export function projectTreeChildren(snapshot: CatalogSnapshot, parentId: string | null) {
  return catalogIndex(snapshot).children.get(parentId) ?? [];
}

export function projectAvailable(
  snapshot: CatalogSnapshot,
  members: Array<{ serverId: string; projectId: string }>,
  nodeId?: string,
) {
  return (
    projectWorkspaces(snapshot, members, nodeId).length > 0 ||
    members.some((member) => catalogIndex(snapshot).projects.has(memberKey(member)))
  );
}

/** Visible project nodes that currently show no workspace rows. */
export function emptyProjectNodes(snapshot: CatalogSnapshot) {
  return snapshot.tree.nodes.filter(
    (node) =>
      node.kind === "project" &&
      !node.hidden &&
      projectAvailable(snapshot, node.members, node.id) &&
      projectWorkspaces(snapshot, node.members, node.id).length === 0,
  );
}
