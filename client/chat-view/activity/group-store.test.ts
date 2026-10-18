import { describe, expect, it } from "vitest";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  buildActivityGroups,
  formatGroupSummary,
  updateGroupStats,
  type ActivityEntry,
} from "./group-store";
const entry = (seq: number, item: AgentTimelineItem, seqEnd = seq): ActivityEntry => ({
  item,
  seqStart: seq,
  seqEnd,
  timestamp: new Date(seq * 1000).toISOString(),
});
const tool = (status: "running" | "completed" = "completed"): AgentTimelineItem => ({
  type: "tool_call",
  callId: "shell-1",
  name: "exec_command",
  status,
  error: null,
  detail: { type: "shell", command: "pwd", cwd: "/tmp" },
});

describe("activity grouping", () => {
  it("folds contiguous thoughts and tools, preserving visible message boundaries", () => {
    const groups = buildActivityGroups([
      entry(1, { type: "user_message", text: "question" }),
      entry(2, { type: "reasoning", text: "thinking" }),
      entry(3, tool()),
      entry(4, { type: "assistant_message", text: "answer" }),
      entry(5, { type: "reasoning", text: "next thought" }),
    ]);
    const first = groups.get("reasoning:2000")!;
    expect(first.isLeader).toBe(true);
    expect(groups.get("tool:shell-1")!.isLeader).toBe(false);
    expect(first.group.items).toHaveLength(2);
    expect(first.group.isFinished).toBe(true);
    expect(formatGroupSummary(first.group)).toBe("Thought · Ran 1 command");
    expect(groups.get("reasoning:5000")!.group).not.toBe(first.group);
  });
  it("uses the latest lifecycle output without counting a call twice", () => {
    const entries = [entry(1, tool("running")), entry(2, tool(), 3)];
    const group = buildActivityGroups(entries).get("tool:shell-1")!.group;
    expect(group.items).toHaveLength(1);
    expect(group.commandCount).toBe(1);
    expect(group.isRunning).toBe(false);
    expect(group.items[0]!.toolCallData!.status).toBe("completed");
    expect(buildActivityGroups(entries).get("tool:shell-1")!.group).toEqual(group);
  });
  it("keeps separate histories independent even with overlapping identities", () => {
    const first = buildActivityGroups([entry(1, tool("running"))]);
    const second = buildActivityGroups([entry(1, tool())]);
    expect(first.get("tool:shell-1")!.group.isRunning).toBe(true);
    expect(second.get("tool:shell-1")!.group.isRunning).toBe(false);
  });
  it("keeps speak messages visible and splits groups around them", () => {
    const groups = buildActivityGroups([
      entry(1, { type: "reasoning", text: "before" }),
      entry(2, {
        type: "tool_call",
        callId: "speak",
        name: "speak",
        status: "completed",
        error: null,
        detail: { type: "unknown", input: "hello", output: null },
      }),
      entry(3, tool()),
    ]);
    expect(groups.has("tool:speak")).toBe(false);
    expect(groups.get("tool:shell-1")!.isLeader).toBe(true);
  });
});

it("recomputes counters from the items when a call changes in place", () => {
  const group = buildActivityGroups([entry(1, tool("running"))]).get("tool:shell-1")!.group;
  expect(group.isRunning).toBe(true);
  expect(group.commandCount).toBe(1);
  expect(group.hasError).toBe(false);

  group.items[0]!.toolCallData!.status = "failed";
  updateGroupStats(group);

  expect(group.isRunning).toBe(false);
  expect(group.hasError).toBe(true);
  expect(group.commandCount).toBe(1);
  updateGroupStats(group);
  expect(group.commandCount).toBe(1);
});

it("keeps a sealed group from running again after a rescan", () => {
  const group = buildActivityGroups([
    entry(1, tool("running")),
    entry(2, {
      type: "assistant_message",
      text: "answer",
    }),
  ]).get("tool:shell-1")!.group;
  expect(group.isFinished).toBe(true);
  updateGroupStats(group);
  expect(group.isRunning).toBe(false);
});

it("keeps distinct sequence identities when two thoughts share a timestamp", () => {
  const rows = [
    entry(1, { type: "reasoning", text: "first" }),
    entry(2, { type: "assistant_message", text: "boundary" }),
    { ...entry(3, { type: "reasoning", text: "second" }), timestamp: new Date(1000).toISOString() },
  ];
  // Timestamp-only lookup is ambiguous; retain separate sequence keys for text matching.
  const groups = buildActivityGroups(rows);
  expect(groups.get("reasoning:1000")).toBeUndefined();
  expect(groups.get("reasoning:1000:1")?.group).not.toBe(groups.get("reasoning:1000:3")?.group);
});

it("keeps a reasoning identity stable while its text streams", () => {
  const short = buildActivityGroups([entry(7, { type: "reasoning", text: "think" })]).get(
    "reasoning:7000",
  )!;
  const streamed = buildActivityGroups([
    entry(7, { type: "reasoning", text: "thinking out loud" }, 9),
  ]).get("reasoning:7000")!;
  // The row key must survive growth, otherwise React remounts the row on every token.
  expect(streamed.group.items[0]!.id).toBe(short.group.items[0]!.id);
  expect(streamed.group.leaderId).toBe(short.group.leaderId);
  expect(streamed.group.items[0]!.reasoningData!.text).toBe("thinking out loud");
});
