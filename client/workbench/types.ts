import type { PluginScreenProps } from "@getpaseo/plugin/client";

export type WorkbenchLayout = "A" | "B" | "C";
export type WorkbenchPage = "home" | "ai" | "hosts" | "memory" | "skills";
export type SearchScope = "all" | "project" | "workspace" | "session" | "host" | "memory";
export interface WorkbenchHost {
  id: string;
  name: string;
  status: string;
  error?: string;
}
export interface ProjectInstance {
  serverId: string;
  projectId: string;
  path: string;
  branch?: string;
}
export interface WorkbenchProject {
  id: string;
  name: string;
  instances: ProjectInstance[];
  workspaceCount: number;
  tags?: string[];
  system?: boolean;
}
export interface WorkbenchWorkspace {
  id: string;
  serverId: string;
  projectId: string;
  name: string;
  path: string;
}
export interface WorkbenchSession {
  id: string;
  serverId: string;
  workspaceId: string;
  title: string;
  updatedAt?: string;
}
export interface WorkbenchTab {
  id: string;
  name: string;
  kind: "favorites" | "host" | "manual";
  hostId?: string;
  projectIds?: string[];
}
export interface FocusTask {
  id: string;
  title: string;
  done: boolean;
}
export interface WorkbenchPreferences {
  layout: WorkbenchLayout;
  tabs: WorkbenchTab[];
  favorites: string[];
  focusTasks: FocusTask[];
}
export interface WorkbenchMemory {
  id: string;
  title: string;
  body: string;
  scope: string;
  confirmed: boolean;
  enabled: boolean;
  source?: string;
  session?: WorkbenchSession;
}
export interface WorkbenchSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  builtin?: boolean;
  loaded?: boolean;
  content?: string;
}
export interface WorkbenchPlan {
  id: string;
  revision: number;
  title: string;
  kind: string;
  status: string;
  serverId: string;
  path?: string;
  projectId?: string;
  workspaceId?: string;
  error?: string;
  steps?: string[];
  result?: { serverId: string; workspaceId?: string; agentId?: string };
}
export interface WorkbenchSearchResult {
  id: string;
  kind: Exclude<SearchScope, "all">;
  title: string;
  detail: string;
  serverId?: string;
  projectId?: string;
  workspaceId?: string;
  agentId?: string;
  stale?: boolean;
}
export interface WorkbenchSearchResponse {
  results: WorkbenchSearchResult[];
  coverage?: string;
}
export interface WorkbenchModel {
  hosts: WorkbenchHost[];
  projects: WorkbenchProject[];
  workspaces: WorkbenchWorkspace[];
  sessions: WorkbenchSession[];
  preferences: WorkbenchPreferences;
  memories: WorkbenchMemory[];
  skills: WorkbenchSkill[];
  plans: WorkbenchPlan[];
  loading: boolean;
  editable: boolean;
  error?: string;
  ai: {
    initialized: boolean;
    root?: string;
    workspaceId?: string;
    serverId: string;
    providers: { id: string; label: string }[];
    error?: string;
  };
  refresh(): Promise<void>;
  savePreferences(update: Partial<WorkbenchPreferences>): Promise<void>;
  search(query: string, scope: SearchScope): Promise<WorkbenchSearchResponse>;
  indexSession?(session: WorkbenchSession): Promise<void>;
  cancelIndex?(): Promise<void>;
  clearSearchIndex?(): Promise<void>;
  indexStatus?: string;
  contextForSession?(session: WorkbenchSession, projectId?: string): Promise<string>;
  initializeAI(): Promise<void>;
  newSession(input: { provider: string; title: string }): Promise<WorkbenchSession>;
  saveMemory(input: {
    id?: string;
    title: string;
    body: string;
    scope: string;
    confirmed: boolean;
    enabled: boolean;
    source?: string;
    session?: WorkbenchSession;
  }): Promise<void>;
  removeMemory(id: string): Promise<void>;
  toggleSkill(id: string, enabled: boolean): Promise<void>;
  saveSkill(input: { name: string; slug: string; content: string }): Promise<void>;
  executePlan(id: string, revision: number): Promise<void>;
  cancelPlan(id: string, revision: number): Promise<void>;
  editPlan?(
    plan: WorkbenchPlan,
    update: { title: string; serverId: string; path: string },
  ): Promise<void>;
}
export type WorkbenchModelHook = (props: PluginScreenProps) => WorkbenchModel;
