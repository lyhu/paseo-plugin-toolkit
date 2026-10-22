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
export async function readHostCatalog(api: PaseoApi, serverId: string): Promise<HostCatalog> {
  const { projects } = await api.projects.list();
  const workspaces: CatalogWorkspace[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.workspaces.list({ page: { limit: 200, ...(cursor ? { cursor } : {}) } });
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
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  cursor = undefined;
  do {
    const page: PaseoAgentListResult = await api.agents.list({
      filter: { includeArchived: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const { agent } of page.entries) {
      if (!agent.workspaceId || !workspaceIds.has(agent.workspaceId) || agent.internal) continue;
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
  const publish = (next: CatalogSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    read: () => snapshot,
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
      publish({
        ...snapshot,
        errors: {
          ...snapshot.errors,
          [serverId]: error instanceof Error ? error.message : String(error),
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

export function projectWorkspaces(
  snapshot: CatalogSnapshot,
  members: Array<{ serverId: string; projectId: string }>,
  nodeId?: string,
) {
  const keys = new Set(members.map(memberKey));
  const hosts = new Set(snapshot.hosts.map((host) => host.serverId));
  return Object.values(snapshot.catalogs)
    .flatMap((catalog) => catalog.workspaces)
    .filter((workspace) => {
      if (!hosts.has(workspace.serverId)) return false;
      const placement = snapshot.tree.workspacePlacements?.find(
        (entry) => entry.serverId === workspace.serverId && entry.workspaceId === workspace.id,
      );
      return placement ? placement.nodeId === nodeId : keys.has(memberKey(workspace));
    });
}

export function projectAvailable(
  snapshot: CatalogSnapshot,
  members: Array<{ serverId: string; projectId: string }>,
  nodeId?: string,
) {
  return (
    projectWorkspaces(snapshot, members, nodeId).length > 0 ||
    members.some((member) =>
      snapshot.catalogs[member.serverId]?.projects.some(
        (project) => project.projectId === member.projectId,
      ),
    )
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
