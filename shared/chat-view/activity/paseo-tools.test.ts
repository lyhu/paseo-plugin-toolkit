import { describe, expect, it } from "vitest";
import { paseoToolSummary } from "./tool-presentation";
import {
  PASEO_TOOL_FAMILIES,
  PASEO_TOOL_ROWS,
  TOOL_CATEGORIES,
  paseoToolFamily,
  paseoToolLeafName,
  resolvePaseoToolRow,
} from "./paseo-tools";

/** 冻结 62 个叶子的家族划分：改一个叶子属于哪个渲染模块，必须改这里。 */
const FAMILY_LEAVES: Record<string, readonly string[]> = {
  agent: [
    "create_agent",
    "send_agent_prompt",
    "get_agent_status",
    "list_agents",
    "cancel_agent",
    "archive_agent",
    "kill_agent",
    "update_agent",
    "get_agent_activity",
    "set_agent_mode",
    "list_pending_permissions",
    "respond_to_permission",
  ],
  workspace: ["create_workspace", "list_workspaces", "archive_workspace", "rename_workspace"],
  terminal: [
    "list_workspace_scripts",
    "start_workspace_script",
    "stop_workspace_script",
    "list_terminals",
    "create_terminal",
    "kill_terminal",
    "capture_terminal",
    "send_terminal_keys",
  ],
  schedule: [
    "create_schedule",
    "create_heartbeat",
    "delete_heartbeat",
    "list_schedules",
    "inspect_schedule",
    "pause_schedule",
    "resume_schedule",
    "delete_schedule",
    "update_schedule",
    "schedule_logs",
    "run_schedule_once",
  ],
  provider: ["list_providers", "list_models", "list_profiles", "inspect_provider"],
  browser: [
    "browser_list_tabs",
    "browser_new_tab",
    "browser_snapshot",
    "browser_click",
    "browser_fill",
    "browser_wait",
    "browser_type",
    "browser_keypress",
    "browser_navigate",
    "browser_back",
    "browser_forward",
    "browser_reload",
    "browser_screenshot",
    "browser_upload",
    "browser_hover",
    "browser_select",
    "browser_drag",
    "browser_logs",
    "browser_evaluate",
    "browser_scroll",
    "browser_resize",
    "browser_close_tab",
  ],
  speak: ["speak"],
};

/** 冻结配色分类。家族管渲染，分类管颜色与计数，两者独立。 */
const CATEGORY_LEAVES: Record<string, readonly string[]> = {
  agent: [...FAMILY_LEAVES.agent, ...FAMILY_LEAVES.provider],
  plan: FAMILY_LEAVES.schedule,
  search: FAMILY_LEAVES.browser,
  shell: FAMILY_LEAVES.terminal,
  file: FAMILY_LEAVES.workspace,
  communication: FAMILY_LEAVES.speak,
};

function leavesBy(key: "family" | "category"): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const [leaf, row] of Object.entries(PASEO_TOOL_ROWS)) {
    (grouped[row[key]] ??= []).push(leaf);
  }
  for (const leaves of Object.values(grouped)) leaves.sort();
  return grouped;
}

function sortedEntry(leaves: readonly string[]): readonly string[] {
  return [...leaves].sort();
}

function sortedGroups(
  groups: Record<string, readonly string[]>,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(groups).map(([key, leaves]) => [key, sortedEntry(leaves)]),
  );
}

describe("paseo tool registry", () => {
  it("每个叶子都有一条完整描述行", () => {
    for (const [leaf, row] of Object.entries(PASEO_TOOL_ROWS)) {
      expect(row.label, leaf).toBeTruthy();
      expect(row.icon, leaf).toBeTruthy();
      expect(TOOL_CATEGORIES, leaf).toContain(row.category);
      expect(PASEO_TOOL_FAMILIES, leaf).toContain(row.family);
    }
  });

  it("叶子按家族划分，家族集合没有多余的、也没有没人用的", () => {
    expect(sortedGroups(leavesBy("family"))).toEqual(sortedGroups(FAMILY_LEAVES));
    expect(Object.keys(FAMILY_LEAVES).sort()).toEqual([...PASEO_TOOL_FAMILIES].sort());
  });

  it("配色分类与叶子做的事一致，list_models 归 agent 而不是 unknown", () => {
    expect(sortedGroups(leavesBy("category"))).toEqual(sortedGroups(CATEGORY_LEAVES));
    expect(PASEO_TOOL_ROWS.list_models.category).toBe("agent");
  });

  it("宿主新增的 browser 动词按 browser 家族兜底渲染", () => {
    expect(paseoToolLeafName("paseo_browser_hover_text")).toBe("browser_hover_text");
    expect(paseoToolFamily("mcp__paseo__browser_hover_text")).toBe("browser");
    const resolved = resolvePaseoToolRow("paseo_browser_hover_text");
    expect(resolved).toMatchObject({ row: { category: "search", family: "browser" } });
  });

  it("没有描述行也不是 browser 动词的叶子保持原生样式", () => {
    expect(paseoToolLeafName("mcp__paseo__future_tool")).toBeNull();
    expect(paseoToolFamily("mcp__paseo__future_tool")).toBeNull();
    expect(resolvePaseoToolRow("mcp__github__create_issue")).toBeNull();
  });

  it("summary 按字段组顺序取第一组字段齐全的", () => {
    expect(paseoToolSummary("paseo_create_schedule", { prompt: "  a\n\nb  " })).toBe("a b");
    expect(paseoToolSummary("paseo_create_schedule", { initialPrompt: "hello" })).toBe("hello");
    expect(paseoToolSummary("paseo_browser_click", { url: "https://x", browserId: "b1" })).toBe(
      "https://x",
    );
    expect(paseoToolSummary("paseo_browser_click", { browserId: "b1" })).toBe("b1");
    expect(paseoToolSummary("paseo_list_agents", { agentId: "a" })).toBeUndefined();
    expect(paseoToolSummary("paseo_list_models", { provider: "pi" })).toBe("pi");
  });

  it("create_agent 依次尝试 title+provider、title、agentId", () => {
    const name = "mcp__paseo__create_agent";
    expect(paseoToolSummary(name, { title: "A", provider: "pi/gpt" })).toBe("A · pi/gpt");
    expect(paseoToolSummary(name, { title: "A" })).toBe("A");
    // 旧实现里 create_agent 会落到通用 `_agent` 规则上，这里如实保留。
    expect(paseoToolSummary(name, { agentId: "agt_1" })).toBe("agt_1");
    expect(paseoToolSummary(name, {})).toBeUndefined();
  });
});
