import { type PluginClientContext, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { type CatalogSnapshot } from "../project-tree/catalog";
import { nativeWorkbenchProjects, nativeProjectPreferences } from "./native-projects";
import {
  loadDevicePreferences,
  readDevicePreference,
  writeDevicePreference,
} from "../project-tree/device";
import {
  defaultWorkbenchState,
  readWorkbenchState,
  saveWorkbenchPreferences,
  saveWorkbenchMemory,
  removeWorkbenchMemory,
  type WorkbenchState,
} from "../../shared/workbench/state";
import {
  readPersonalAI,
  setPersonalAIReference,
  saveWorkbenchSkill,
  toggleWorkbenchSkill,
  type PersonalAIState,
} from "../../shared/workbench/ai";
import {
  listCreationPlans,
  executeCreationPlan,
  cancelCreationPlan,
  editCreationPlan,
  type CreationPlan,
} from "../../shared/workbench/operations";
import {
  readSearchStatus,
  searchWorkbenchHistory,
  indexWorkbenchSession,
  cancelWorkbenchIndex,
  clearWorkbenchIndex,
  type IndexStatus,
} from "../../shared/workbench/search";
import type { WorkbenchModel, WorkbenchLayout, WorkbenchSearchResult } from "./types";

export function useWorkbenchModel(
  client: PluginClientContext,
  props: Pick<PluginScreenProps, "host">,
  catalog: CatalogSnapshot,
  refreshCatalog: () => Promise<void>,
): WorkbenchModel {
  const [state, setState] = useState(defaultWorkbenchState);
  const [ai, setAI] = useState<PersonalAIState>({ root: "", initialized: false, skills: [] });
  const [plans, setPlans] = useState<CreationPlan[]>([]);
  const [status, setStatus] = useState<IndexStatus[]>([]);
  const [layout, setLayout] = useState<WorkbenchLayout>("A");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const current = useRef(state);
  const busy = useRef(false);
  const alive = useRef(true);
  const key = `${props.host.id}.workbench.layout`;
  const accept = (next: WorkbenchState) => {
    current.current = next;
    setState(next);
  };
  async function refresh() {
    const [next, personal, operations, indexing] = await Promise.all([
      client.rpc(readWorkbenchState, {}),
      client.rpc(readPersonalAI, {}),
      client.rpc(listCreationPlans, {}),
      client.rpc(readSearchStatus, {}),
    ]);
    if (!alive.current) return;
    if (!busy.current && next.revision >= current.current.revision) accept(next);
    setAI(personal);
    setPlans(operations);
    setStatus(indexing);
    setError("");
  }
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(() => {
            void poll();
          }, 3000);
        }
      }
    };
    void poll();
    void loadDevicePreferences([key])
      .then(() => {
        const saved = readDevicePreference(key);
        if (!cancelled && (saved === "A" || saved === "B" || saved === "C")) setLayout(saved);
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
      alive.current = false;
      clearTimeout(timer);
    };
  }, [props.host.id]);
  async function mutate(action: () => Promise<WorkbenchState>) {
    if (busy.current) throw new Error("正在保存，请稍后再试。");
    busy.current = true;
    try {
      accept(await action());
    } finally {
      busy.current = false;
    }
  }
  const hosts = catalog.hosts.map((host) => ({
    id: host.serverId,
    name: host.label,
    status: host.status,
    error: catalog.errors[host.serverId],
  }));
  const workspaces = Object.values(catalog.catalogs).flatMap((c) =>
    c.workspaces.map((w) => ({
      id: w.id,
      serverId: w.serverId,
      projectId: w.projectId,
      name: w.name,
      path: w.cwd,
    })),
  );
  const sessions = Object.entries(catalog.catalogs)
    .flatMap(([serverId, c]) =>
      (c.sessions ?? []).map((s) => ({ ...s, serverId, title: s.title ?? "未命名会话" })),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const preferences = nativeProjectPreferences(catalog, state.preferences);
  const projects = nativeWorkbenchProjects(catalog, ai).map((project) => ({
    ...project,
    tags: Object.entries(preferences.scenarioProjects ?? {})
      .filter(([, ids]) => ids.includes(project.id))
      .map(([id]) => id),
  }));
  return {
    hosts,
    projects,
    nativeProjects: projects,
    workspaces,
    sessions,
    preferences: { ...preferences, layout },
    memories: state.memories,
    skills: ai.skills.map((s) => ({ ...s, id: s.slug, loaded: false })),
    plans: plans.map((p) => ({ ...p, ...p.payload, title: p.payload.name })),
    ai: { ...ai, serverId: ai.serverId ?? props.host.id },
    loading,
    editable: catalog.editable && !error,
    error: error || catalog.organizationError || undefined,
    indexStatus: status.length
      ? `${status.filter((s) => s.status === "ready").length} 个会话已索引；${status.filter((s) => s.status === "indexing" || s.status === "queued").length} 个处理中${status.some((s) => s.status === "failed") ? "；存在失败任务，可重试" : ""}`
      : "尚未索引历史正文",
    async refresh() {
      await Promise.all([refresh(), refreshCatalog()]);
    },
    async savePreferences(update) {
      if (update.layout) {
        setLayout(update.layout);
        writeDevicePreference(key, update.layout);
      }
      if (
        update.tabs ||
        update.favorites ||
        update.focusTasks ||
        update.scenarioProjects ||
        update.hostOrder
      )
        await mutate(() =>
          client.rpc(saveWorkbenchPreferences, {
            revision: current.current.revision,
            preferences: {
              ...nativeProjectPreferences(catalog, current.current.preferences),
              ...update,
            },
          }),
        );
    },
    async search(query, scope) {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return { results: [] };
      const results: WorkbenchSearchResult[] = [
        ...projects.map((p) => ({
          id: p.id,
          kind: "project" as const,
          title: p.name,
          detail: p.instances.map((i) => i.path).join(" · "),
          serverId: p.instances[0]?.serverId,
          projectId: p.instances[0]?.projectId,
        })),
        ...workspaces.map((w) => ({
          id: JSON.stringify([w.serverId, w.id]),
          kind: "workspace" as const,
          title: w.name,
          detail: w.path,
          serverId: w.serverId,
          projectId: w.projectId,
          workspaceId: w.id,
        })),
        ...sessions.map((s) => ({
          id: JSON.stringify([s.serverId, s.id]),
          kind: "session" as const,
          title: s.title,
          detail: s.serverId,
          serverId: s.serverId,
          workspaceId: s.workspaceId,
          agentId: s.id,
        })),
        ...hosts.map((h) => ({
          id: h.id,
          kind: "host" as const,
          title: h.name,
          detail: h.status,
          serverId: h.id,
        })),
        ...state.memories.map((m) => ({
          id: m.id,
          kind: "memory" as const,
          title: m.title,
          detail: m.body,
        })),
      ].filter(
        (r) =>
          (scope === "all" || r.kind === scope) &&
          `${r.title} ${r.detail}`.toLocaleLowerCase().includes(needle),
      );
      let coverage = "项目与工作区目录；最近最多 400 条会话元数据/Host";
      if (scope === "all" || scope === "session") {
        try {
          const found = await client.rpc(searchWorkbenchHistory, {
            query: query.trim(),
            limit: 30,
          });
          results.push(
            ...found.hits.map((h) => ({
              id: JSON.stringify([h.serverId, h.agentId, h.epoch, h.seq]),
              kind: "session" as const,
              title: h.title,
              detail: h.text,
              serverId: h.serverId,
              workspaceId: h.workspaceId,
              agentId: h.agentId,
              stale: hosts.find((host) => host.id === h.serverId)?.status !== "online",
            })),
          );
          coverage += `；${found.coverage.filter((s) => s.status === "ready").length} 个会话正文已索引（历史快照）`;
        } catch {
          coverage += "；正文搜索暂不可用；目录结果来自已读取数据";
        }
      }
      return { results: results.slice(0, 100), coverage };
    },
    async indexSession(session) {
      await client.rpc(indexWorkbenchSession, { ...session, agentId: session.id });
      await refresh();
    },
    async cancelIndex() {
      for (const item of status.filter((s) => s.status === "queued" || s.status === "indexing"))
        await client.rpc(cancelWorkbenchIndex, item);
      await refresh();
    },
    async clearSearchIndex() {
      for (const item of status) await client.rpc(clearWorkbenchIndex, item);
      await refresh();
    },
    async setAIReference(project) {
      setAI(await client.rpc(setPersonalAIReference, { project }));
    },
    async saveMemory(input) {
      await mutate(() =>
        client.rpc(saveWorkbenchMemory, { ...input, revision: current.current.revision }),
      );
    },
    async removeMemory(id) {
      await mutate(() =>
        client.rpc(removeWorkbenchMemory, { id, revision: current.current.revision }),
      );
    },
    async toggleSkill(id, enabled) {
      setAI(await client.rpc(toggleWorkbenchSkill, { slug: id, enabled }));
    },
    async saveSkill(input) {
      setAI(await client.rpc(saveWorkbenchSkill, { ...input, description: input.name }));
    },
    async executePlan(id, revision) {
      await client.rpc(executeCreationPlan, { id, revision });
      await Promise.all([refresh(), refreshCatalog()]);
    },
    async cancelPlan(id, revision) {
      await client.rpc(cancelCreationPlan, { id, revision });
      await refresh();
    },
    async editPlan(plan, update) {
      const previous = plans.find((p) => p.id === plan.id);
      if (!previous) throw new Error("计划已变化，请刷新。");
      await client.rpc(editCreationPlan, {
        id: plan.id,
        revision: plan.revision,
        payload: {
          ...previous.payload,
          name: update.title,
          serverId: update.serverId,
          ...(update.path ? { path: update.path } : {}),
        },
      });
      await refresh();
    },
  };
}
