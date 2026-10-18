import { getPaseoToolLeafName } from "@getpaseo/protocol/tool-name-normalization";

export const TOOL_CATEGORIES = [
  "shell",
  "file",
  "search",
  "agent",
  "plan",
  "communication",
  "unknown",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const PASEO_TOOL_FAMILIES = [
  "agent",
  "workspace",
  "terminal",
  "schedule",
  "provider",
  "browser",
  "speak",
] as const;
export type PaseoToolFamily = (typeof PASEO_TOOL_FAMILIES)[number];

/** 一个叶子的全部展示声明。summary 是候选字段组，按顺序取第一组全部非空的。 */
export interface PaseoToolRow {
  label: string;
  icon: string;
  category: ToolCategory;
  family: PaseoToolFamily;
  summary?: readonly (readonly string[])[];
  /** 采用 summary 后是否压缩空白（长文本字段用）。 */
  compactSummary?: boolean;
}

export const PASEO_TOOL_ROWS: Readonly<Record<string, PaseoToolRow>> = {
  // agent
  create_agent: {
    label: "Create Agent",
    icon: "Bot",
    category: "agent",
    family: "agent",
    summary: [["title", "provider"], ["title"], ["agentId"]],
  },
  send_agent_prompt: {
    label: "Send Agent Prompt",
    icon: "Send",
    category: "agent",
    family: "agent",
    summary: [["agentId"]],
  },
  get_agent_status: {
    label: "Get Agent Status",
    icon: "Activity",
    category: "agent",
    family: "agent",
  },
  list_agents: { label: "List Agents", icon: "Users", category: "agent", family: "agent" },
  cancel_agent: {
    label: "Cancel Agent Run",
    icon: "CircleStop",
    category: "agent",
    family: "agent",
    summary: [["agentId"]],
  },
  archive_agent: {
    label: "Archive Agent",
    icon: "Archive",
    category: "agent",
    family: "agent",
    summary: [["agentId"]],
  },
  kill_agent: {
    label: "Kill Agent",
    icon: "CircleX",
    category: "agent",
    family: "agent",
    summary: [["agentId"]],
  },
  update_agent: {
    label: "Update Agent",
    icon: "Settings2",
    category: "agent",
    family: "agent",
    summary: [["agentId"]],
  },
  get_agent_activity: {
    label: "Get Agent Activity",
    icon: "Activity",
    category: "agent",
    family: "agent",
  },
  set_agent_mode: {
    label: "Set Agent Session Mode",
    icon: "SlidersHorizontal",
    category: "agent",
    family: "agent",
  },
  list_pending_permissions: {
    label: "List Pending Permissions",
    icon: "ShieldAlert",
    category: "agent",
    family: "agent",
  },
  respond_to_permission: {
    label: "Respond to Permission",
    icon: "ShieldCheck",
    category: "agent",
    family: "agent",
  },

  // workspace
  create_workspace: {
    label: "Create Workspace",
    icon: "FolderPlus",
    category: "file",
    family: "workspace",
    summary: [["workspaceId"]],
  },
  list_workspaces: {
    label: "List Workspaces",
    icon: "Folders",
    category: "file",
    family: "workspace",
    summary: [["workspaceId"]],
  },
  archive_workspace: {
    label: "Archive Workspace",
    icon: "Archive",
    category: "file",
    family: "workspace",
    summary: [["workspaceId"]],
  },
  rename_workspace: {
    label: "Rename Workspace",
    icon: "Pencil",
    category: "file",
    family: "workspace",
    summary: [["workspaceId"]],
  },

  // terminal
  list_workspace_scripts: {
    label: "List Workspace Scripts",
    icon: "ListTree",
    category: "shell",
    family: "terminal",
    summary: [["workspaceId"]],
  },
  start_workspace_script: {
    label: "Start Workspace Script",
    icon: "Play",
    category: "shell",
    family: "terminal",
    summary: [["workspaceId"]],
  },
  stop_workspace_script: {
    label: "Stop Workspace Script",
    icon: "Square",
    category: "shell",
    family: "terminal",
    summary: [["workspaceId"]],
  },
  list_terminals: {
    label: "List Terminals",
    icon: "SquareTerminal",
    category: "shell",
    family: "terminal",
  },
  create_terminal: {
    label: "Create Terminal",
    icon: "SquareTerminal",
    category: "shell",
    family: "terminal",
  },
  kill_terminal: { label: "Kill Terminal", icon: "CircleX", category: "shell", family: "terminal" },
  capture_terminal: {
    label: "Capture Terminal",
    icon: "ScrollText",
    category: "shell",
    family: "terminal",
  },
  send_terminal_keys: {
    label: "Send Terminal Keys",
    icon: "Keyboard",
    category: "shell",
    family: "terminal",
  },

  // schedule
  create_schedule: {
    label: "Create Schedule",
    icon: "CalendarClock",
    category: "plan",
    family: "schedule",
    summary: [["prompt"]],
    compactSummary: true,
  },
  create_heartbeat: {
    label: "Create Heartbeat",
    icon: "HeartPulse",
    category: "plan",
    family: "schedule",
    summary: [["prompt"]],
    compactSummary: true,
  },
  delete_heartbeat: {
    label: "Delete Heartbeat",
    icon: "Trash2",
    category: "plan",
    family: "schedule",
  },
  list_schedules: {
    label: "List Schedules",
    icon: "CalendarDays",
    category: "plan",
    family: "schedule",
  },
  inspect_schedule: {
    label: "Inspect Schedule",
    icon: "CalendarSearch",
    category: "plan",
    family: "schedule",
  },
  pause_schedule: { label: "Pause Schedule", icon: "Pause", category: "plan", family: "schedule" },
  resume_schedule: { label: "Resume Schedule", icon: "Play", category: "plan", family: "schedule" },
  delete_schedule: {
    label: "Delete Schedule",
    icon: "Trash2",
    category: "plan",
    family: "schedule",
  },
  update_schedule: {
    label: "Update Schedule",
    icon: "CalendarCog",
    category: "plan",
    family: "schedule",
  },
  schedule_logs: {
    label: "Schedule Logs",
    icon: "ScrollText",
    category: "plan",
    family: "schedule",
  },
  run_schedule_once: {
    label: "Run Schedule Once",
    icon: "CalendarCheck",
    category: "plan",
    family: "schedule",
  },

  // provider
  list_providers: {
    label: "List Providers",
    icon: "Network",
    category: "agent",
    family: "provider",
  },
  list_models: {
    label: "List Models",
    icon: "Cpu",
    category: "agent",
    family: "provider",
    summary: [["provider"]],
  },
  list_profiles: {
    label: "List Agent Profiles",
    icon: "ContactRound",
    category: "agent",
    family: "provider",
  },
  inspect_provider: {
    label: "Inspect Provider",
    icon: "ScanSearch",
    category: "agent",
    family: "provider",
  },

  // browser
  browser_list_tabs: {
    label: "List Browser Tabs",
    icon: "PanelsTopLeft",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_new_tab: {
    label: "Create Browser Tab",
    icon: "Globe2",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_snapshot: {
    label: "Snapshot Browser Page",
    icon: "Scan",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_click: {
    label: "Click Browser Element",
    icon: "MousePointer2",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_fill: {
    label: "Fill Browser Element",
    icon: "TextCursorInput",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_wait: {
    label: "Wait for Browser Condition",
    icon: "Timer",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_type: {
    label: "Type into Browser",
    icon: "Keyboard",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_keypress: {
    label: "Press Browser Key",
    icon: "KeyRound",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_navigate: {
    label: "Navigate Browser",
    icon: "Navigation",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_back: {
    label: "Browser Back",
    icon: "ArrowLeft",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_forward: {
    label: "Browser Forward",
    icon: "ArrowRight",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_reload: {
    label: "Browser Reload",
    icon: "RefreshCw",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_screenshot: {
    label: "Capture Browser Screenshot",
    icon: "Camera",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_upload: {
    label: "Upload Files in Browser",
    icon: "Upload",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_hover: {
    label: "Hover Browser Element",
    icon: "Hand",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_select: {
    label: "Select Browser Option",
    icon: "ListFilter",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_drag: {
    label: "Drag Browser Element",
    icon: "Move",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_logs: {
    label: "Read Browser Logs",
    icon: "ScrollText",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_evaluate: {
    label: "Evaluate Browser JavaScript",
    icon: "Braces",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_scroll: {
    label: "Scroll Browser",
    icon: "Scroll",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_resize: {
    label: "Resize Browser Viewport",
    icon: "Maximize2",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },
  browser_close_tab: {
    label: "Close Browser Tab",
    icon: "X",
    category: "search",
    family: "browser",
    summary: [["url"], ["browserId"]],
  },

  // speak
  speak: {
    label: "Speak",
    icon: "MicVocal",
    category: "communication",
    family: "speak",
    summary: [["text"]],
    compactSummary: true,
  },
};

/** 叶子名去掉 paseo 命名空间后的显示名，用于宿主将来新增、插件还没有描述行的叶子。 */
export function prettyToolName(name: string): string {
  const normalized = name.trim().replace(/[._-]+/g, " ");
  if (!normalized) return "Tool";
  return normalized
    .split(/\s+/)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

/**
 * 准入一个叶子：有描述行的叶子按行渲染，宿主新增的 browser 动词交给 browser 家族的通用渲染兜底。
 * 没有描述行也不是 browser 动词的叶子按「不认识」处理，界面保持原生样式。
 */
function admitLeaf(leafName: string | undefined): string | null {
  if (!leafName) return null;
  if (PASEO_TOOL_ROWS[leafName]) return leafName;
  return leafName.startsWith("browser_") ? leafName : null;
}

/** 叶子的描述行；宿主新增的 browser 动词合成一行兜底行。 */
export function resolvePaseoToolRow(toolName: string): { leaf: string; row: PaseoToolRow } | null {
  const leaf = paseoToolLeafName(toolName);
  if (!leaf) return null;
  const authored = PASEO_TOOL_ROWS[leaf];
  if (authored) return { leaf, row: authored };
  return {
    leaf,
    row: {
      label: prettyToolName(leaf),
      icon: "Globe2",
      category: "search",
      family: "browser",
    },
  };
}

export function paseoToolLeafName(toolName: string): string | null {
  const namespacedLeafName = getPaseoToolLeafName(toolName);
  if (namespacedLeafName) {
    const admitted = admitLeaf(namespacedLeafName);
    if (admitted) return admitted;
  }
  const normalized = toolName.trim().toLowerCase();
  const directMatch = normalized.match(/^(?:mcp_)?paseo_(.+)$/);
  return admitLeaf(directMatch?.[1]);
}

export function paseoToolFamily(toolName: string): PaseoToolFamily | null {
  const found = resolvePaseoToolRow(toolName);
  return found ? found.row.family : null;
}
