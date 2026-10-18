import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createToolCallData } from "../../../../shared/chat-view/activity/timeline";
import { resolveActivityPalette } from "../../../../shared/chat-view/activity/palette";
import { useActivityStyles } from "../styles";
import { DetailBody } from "./index";

vi.mock("react-native", async () => await import("react-native-web"));
vi.mock("@getpaseo/plugin/client/react-native", async () => ({
  ScrollView: (await import("react-native-web")).ScrollView,
  Icon: () => null,
  useRevealedText: (text: string) => text,
}));

const theme = {
  colors: {
    foreground: "#222222",
    foregroundMuted: "#777777",
    border: "#dddddd",
    surface0: "#ffffff",
    surface1: "#eeeeee",
    accent: "#0066cc",
    statusSuccess: "#00aa44",
    statusWarning: "#cc8800",
    statusDanger: "#cc2222",
  },
};
const palette = resolveActivityPalette("default", theme.colors as never);

function Body({ toolName, detail }: { toolName: string; detail: unknown }) {
  const styles = useActivityStyles(theme as never, palette);
  const data = createToolCallData({
    type: "tool_call",
    callId: "call",
    name: toolName,
    status: "completed",
    error: null,
    detail,
  } as never);
  return React.createElement(DetailBody, { data, theme, palette, styles } as never);
}

const render = (toolName: string, detail: unknown) =>
  renderToStaticMarkup(React.createElement(Body, { toolName, detail }));

// 每个 detail 类型都要落到自己的渲染器：断言各自独有的文案，而不是"渲染成功"。
const cases: Array<[string, string, unknown, string]> = [
  [
    "shell",
    "exec_command",
    { type: "shell", command: "npm test", cwd: "/tmp", output: "ok" },
    "Command",
  ],
  [
    "read",
    "read_file",
    { type: "read", filePath: "src/a.ts", content: "const a = 1;" },
    "Contents",
  ],
  [
    "write",
    "write_file",
    { type: "write", filePath: "src/a.ts", content: "x" },
    "Written contents",
  ],
  [
    "edit",
    "edit_file",
    { type: "edit", filePath: "src/a.ts", unifiedDiff: "@@ -1 +1 @@\n-old\n+new\n" },
    "Diff",
  ],
  [
    "search",
    "search_files",
    { type: "search", query: "needle", filePaths: ["a.ts"] },
    "Query: needle",
  ],
  ["fetch", "fetch_url", { type: "fetch", url: "https://x.test", result: "body" }, "Result"],
  [
    "worktree_setup",
    "worktree_setup",
    { type: "worktree_setup", branchName: "b", worktreePath: "/tmp/w" },
    "Branch: b",
  ],
  [
    "sub_agent",
    "task",
    { type: "sub_agent", subAgentType: "explore", log: "[read] a.ts" },
    "Activity log",
  ],
  ["plain_text", "speak", { type: "plain_text", text: "hello" }, "hello"],
  ["plan", "update_plan", { type: "plan", text: "- one\n- two" }, "- one"],
  ["unknown", "mystery_tool", { type: "unknown", input: { a: 1 }, output: [1, 2] }, "Input"],
];

it.each(cases)(
  "renders %s details through its own renderer",
  (_type, toolName, detail, expected) => {
    expect(render(toolName, detail)).toContain(expected);
  },
);
