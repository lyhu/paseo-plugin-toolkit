import { describe, expect, it } from "vitest";
import {
  parseSubAgentActionLog,
  paseoToolCategory,
  paseoToolIcon,
  paseoToolLabel,
  paseoToolResult,
  paseoToolSummary,
  resolveSubAgentActionPresentation,
  resolveToolCallPresentation,
  unwrapPaseoToolOutput,
} from "./tool-presentation";
import { paseoToolLeafName } from "./paseo-tools";

describe("tool call presentation", () => {
  it("maps known tool details to screenshot-style presentation", () => {
    expect(
      resolveToolCallPresentation({
        name: "edit",
        detail: { type: "edit", filePath: "src/web/main.tsx", oldString: "", newString: "x" },
      }),
    ).toMatchObject({
      category: "file",
      icon: "FileCode2",
      label: "Edit File",
      summary: "src/web/main.tsx",
      language: "typescript",
      diffStats: { additions: 1, deletions: 0 },
    });
    expect(
      resolveToolCallPresentation({
        name: "bash",
        detail: { type: "shell", command: "bun run typecheck && bun test" },
      }),
    ).toEqual({
      category: "shell",
      icon: "SquareTerminal",
      label: "Shell Command",
      summary: "bun run typecheck && bun test",
    });
  });

  it("maps sub-agent actions to readable inline progress rows", () => {
    expect(resolveSubAgentActionPresentation("read", "README.md")).toEqual({
      icon: "FileText",
      label: "Read File",
      summaryIcon: "FileText",
    });
    expect(resolveSubAgentActionPresentation("find_files")).toEqual({
      icon: "Search",
      label: "Find Files",
    });
    expect(resolveSubAgentActionPresentation("shell", "git status")).toEqual({
      icon: "SquareTerminal",
      label: "Shell Command",
    });
  });

  it("recovers Claude-style sub-agent actions from the provider log", () => {
    expect(parseSubAgentActionLog("[Read] README.md\n[Shell] git status\nnot an action")).toEqual([
      { index: 0, toolName: "Read", summary: "README.md" },
      { index: 1, toolName: "Shell", summary: "git status" },
    ]);
  });

  it("gives namespaced Paseo tools a specialized title, icon, and summary", () => {
    const input = {
      title: "Random Number Agent 3",
      provider: "pi/plexus/gpt-5.6-luna",
    };
    expect(paseoToolLabel("mcp__paseo__create_agent")).toBe("Create Agent");
    expect(paseoToolLabel("mcp_paseo_create_agent")).toBe("Create Agent");
    expect(paseoToolIcon("paseo.create_agent")).toBe("Bot");
    expect(paseoToolLeafName("paseo_create_agent")).toBe("create_agent");
    expect(paseoToolLeafName("mcp_paseo_create_agent")).toBe("create_agent");
    expect(paseoToolLeafName("mcp__paseo__future_tool")).toBeNull();
    expect(paseoToolCategory("paseo_remote.create_agent")).toBe("agent");
    expect(paseoToolSummary("mcp__paseo__create_agent", input)).toBe(
      "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    );
    expect(paseoToolLabel("mcp__github__create_issue")).toBeNull();
    expect(
      resolveToolCallPresentation({
        name: "mcp_paseo_create_agent",
        detail: { type: "unknown", input, output: { agentId: "agt_123" } },
      }),
    ).toMatchObject({
      category: "agent",
      icon: "Bot",
      label: "Paseo Create Agent",
      summary: "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    });
    expect(
      resolveToolCallPresentation({
        name: "mcp__github__search_repositories",
        detail: { type: "unknown", input: { query: "paseo" }, output: {} },
      }),
    ).toMatchObject({
      category: "search",
      icon: "BookMarked",
      label: "GitHub Repository Search",
      summary: "paseo",
    });
    expect(
      resolveToolCallPresentation({
        name: "mcp__paseo__create_agent",
        detail: { type: "unknown", input, output: { agentId: "agt_123" } },
      }),
    ).toMatchObject({
      category: "agent",
      icon: "Bot",
      label: "Paseo Create Agent",
      summary: "Random Number Agent 3 · pi/plexus/gpt-5.6-luna",
    });
  });

  it("unwraps MCP text envelopes with diagnostic prefixes", () => {
    const output = {
      content: [
        {
          type: "text",
          text: 'availableModes_count=0\\n\\n{"agentId":"agt_123","status":"running"}',
        },
      ],
    };
    expect(unwrapPaseoToolOutput(output)).toEqual({
      agentId: "agt_123",
      status: "running",
    });
    expect(paseoToolResult({ ok: true, result: { browserId: "tab-1" } })).toEqual({
      browserId: "tab-1",
    });
    expect(
      paseoToolResult({
        ok: false,
        error: { code: "browser_timeout", message: "Timed out" },
      }),
    ).toEqual({
      ok: false,
      error: { code: "browser_timeout", message: "Timed out" },
    });
  });

  it("uses valid Activity icon for get_agent_activity", () => {
    expect(paseoToolIcon("paseo_get_agent_activity")).toBe("Activity");
    expect(paseoToolIcon("mcp_paseo_get_agent_activity")).toBe("Activity");
    expect(
      resolveToolCallPresentation({
        name: "mcp_paseo_get_agent_activity",
        detail: { type: "unknown", input: { agentId: "agt_1" }, output: {} },
      }).icon,
    ).toBe("Activity");
  });
});
