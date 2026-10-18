import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activitySettings } from "../../../shared/chat-view/settings";
import { createToolCallData } from "../../../shared/chat-view/activity/timeline";
import { ColorfulReasoning, ColorfulToolCall } from "./Activity";
import { cleanupActivityHistory } from "./history";
import { cleanupActivityDisclosure } from "./disclosure";
import { buildActivityGroups, type ActivityEntry } from "./group-store";

const state = vi.hoisted(() => ({
  values: {} as unknown,
  activity: undefined as unknown,
  timeline: vi.fn(),
  refetch: vi.fn(async () => ({
    entries: [],
    epoch: "one",
    startCursor: null,
    hasOlder: false,
  })),
  actions: [] as Array<() => void>,
}));
vi.mock("react-native", async () => {
  const native = await import("react-native-web");
  const react = await import("react");
  return {
    ...native,
    Pressable: (props: { onPress: () => void }) => {
      state.actions.push(props.onPress);
      return react.createElement(native.Pressable, props);
    },
  };
});
vi.mock("./history", () => ({
  useActivityGroup: () => state.activity,
  cleanupActivityHistory: vi.fn(),
}));
vi.mock("@getpaseo/plugin/client", () => {
  // Turns now read history so a finished turn can collapse in the render layer.
  const paseo = {
    agents: {
      ref: (agentId: string) => {
        state.timeline(agentId);
        return {
          timeline: {
            refetch: state.refetch,
            subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }),
          },
        };
      },
    },
  };
  return {
    useSettings: () => ({ status: "ready", values: state.values }),
    usePaseo: () => paseo,
    useAgent: () => ({ status: "idle" }),
  };
});
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
const shell = (status: "running" | "completed") =>
  createToolCallData({
    type: "tool_call",
    callId: "shell",
    name: "exec_command",
    status,
    error: null,
    detail: {
      type: "shell",
      command: "npm test",
      cwd: "/tmp",
      output: "secret output",
      exitCode: 0,
    },
  });
function renderTool(status: "running" | "completed", agentId = "agent") {
  state.actions.length = 0;
  return renderToStaticMarkup(
    React.createElement(ColorfulToolCall, {
      agentId,
      timestamp: new Date(1000),
      theme,
      item: { type: "plugin", kind: "colorful-tool-call", version: 1, data: shell(status) },
    } as never),
  );
}
beforeEach(() => {
  state.values = activitySettings.schema.parse({ displayMode: "folded" });
  state.activity = undefined;
  state.timeline.mockClear();
  cleanupActivityDisclosure();
  cleanupActivityHistory();
});
afterEach(() => {
  cleanupActivityHistory();
});
const entry = (seq: number, item: ActivityEntry["item"]): ActivityEntry => ({
  item,
  seqStart: seq,
  seqEnd: seq,
  timestamp: new Date(seq * 1000).toISOString(),
});
function setGroup(finished: boolean, text = "checking the command") {
  const entries = [
    entry(1, { type: "user_message", text: "run the tests" }),
    entry(2, { type: "reasoning", text }),
    entry(3, {
      type: "tool_call",
      callId: "shell",
      name: "exec_command",
      status: finished ? "completed" : "running",
      error: null,
      detail: { type: "shell", command: "npm test", cwd: "/tmp", output: "secret output" },
    }),
  ];
  if (finished) entries.push(entry(4, { type: "assistant_message", text: "done" }));
  state.activity = buildActivityGroups(entries).get("reasoning:2000");
}
function renderThought() {
  state.actions.length = 0;
  return renderToStaticMarkup(
    React.createElement(ColorfulReasoning, {
      agentId: "agent",
      timestamp: new Date(2000),
      theme,
      item: {
        type: "plugin",
        kind: "colorful-reasoning",
        version: 1,
        data: { text: "checking the command", phase: "streaming" },
      },
    } as never),
  );
}
it("keeps the upstream folded summary unchanged through streaming and completion", () => {
  setGroup(false);
  const running = renderThought();
  expect(running).toContain("folded-activity-group");
  expect(running).toContain("Thought · Ran 1 command");
  expect(running).not.toContain("checking the command");
  expect(running).not.toContain("secret output");
  setGroup(false, "checking the command with more streamed tokens");
  expect(renderThought()).toBe(running);
  setGroup(true);
  expect(renderThought()).toBe(running);
});
it("keeps follower rows empty during running and completed turns", () => {
  for (const finished of [false, true]) {
    setGroup(finished);
    state.activity = { ...(state.activity as object), isLeader: false };
    const follower = renderTool(finished ? "completed" : "running");
    expect(follower).toContain("folded-activity-follower");
    expect(follower).not.toContain("secret output");
    expect(follower).not.toContain("folded-activity-group");
  }
});
it("shows direct upstream tool details and retains disclosure after remount", () => {
  setGroup(true);
  renderThought();
  state.actions[0]!();
  const expanded = renderThought();
  expect(expanded).toContain("checking the command");
  expect(expanded).not.toContain("command-run-group");
  expect(expanded).not.toContain("用时");
  state.actions[1]!();
  const details = renderThought();
  expect(details).toContain("secret output");
  expect(details).not.toContain("codex-shell-panel");
  expect(renderThought()).toBe(details);
  state.actions[0]!();
  expect(renderThought()).not.toContain("secret output");
  state.actions[0]!();
  expect(renderThought()).toContain("secret output");
});
it("does not flash expanded details before folded history becomes available", () => {
  expect(renderTool("running")).not.toContain("secret output");
  expect(renderTool("completed")).not.toContain("secret output");
});
it("preserves separate cards in Detailed mode", () => {
  state.values = activitySettings.schema.parse({ displayMode: "detailed" });
  const markup = renderTool("running");
  expect(markup).not.toContain("folded-activity-group");
  expect(markup).toContain("npm test");
  expect(markup).toContain("secret output");
});

it("starts new conversations in the upstream Folded mode and migrates old Codex preferences", () => {
  expect(activitySettings.schema.parse({}).displayMode).toBe("folded");
  expect(activitySettings.schema.parse({ displayMode: "codex" }).displayMode).toBe("folded");
});

it("stays silent as zero-height follower when historical activity is unresolved", () => {
  state.activity = undefined;
  // 已完成的历史命令在未解析时作为 follower 占位，绝不作为折叠卡片撑开高度
  const completedMarkup = renderTool("completed");
  expect(completedMarkup).toContain("folded-activity-follower");
  expect(completedMarkup).not.toContain("folded-activity-group");

  // 运行中的命令在未解析时允许作为单条展示活跃进度
  const runningMarkup = renderTool("running");
  expect(runningMarkup).toContain("folded-activity-group");
  expect(runningMarkup).not.toContain("folded-activity-follower");
});
