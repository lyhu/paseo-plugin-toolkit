// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRequire } from "node:module";
type Root = { render(node: ReactNode): void; unmount(): void };
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): Root;
};
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { PluginAgentPanelProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import type { TitleJob, TitleResult } from "../../shared/session-title/contracts";
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  View: ({ children, style }: { children: ReactNode; style?: object }) =>
    createElement("div", { style }, children),
  Text: ({ children, style }: { children: ReactNode; style?: object }) =>
    createElement("span", { style }, children),
  Pressable: ({
    children,
    disabled,
    onPress,
    accessibilityLabel,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress(): void;
    accessibilityLabel?: string;
  }) =>
    createElement(
      "button",
      { disabled, onClick: onPress, "aria-label": accessibilityLabel },
      children,
    ),
  TextInput: () => null,
}));
vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: (contract: { name: string }) => (input: unknown) => api.call(contract.name, input),
}));
vi.mock("../i18n", () => ({
  useLocale: () => "zh-CN",
  tr: (text: string, values?: Record<string, string>) =>
    text.replace(/\{(\d+)\}/g, (_, key) => values?.[key] ?? ""),
}));
import { SessionTitlePanel, TitleContent } from "./panel";
import { Surface } from "../quick-questions/ui";

let root: Root | undefined;
let cache: QueryClient;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  cache?.clear();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
const result: TitleResult = {
  id: "result",
  agentId: "a",
  workspaceId: "w",
  previousTitle: "原始标题",
  fingerprint: "f",
  messages: 40,
  through: 80,
  at: "2026-10-26T10:00:00Z",
  applied: false,
  analysis: {
    summary: "目标：修复会员权益同步。关键决策：按订单号幂等。待办：回归测试。",
    title: "修复会员权益同步",
    changed: true,
    reason: "明确了业务目标",
  },
};
async function mount(
  job: TitleJob | null,
  compact = false,
  dark = false,
  workspace = false,
  history: TitleJob[] = [],
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  api.call.mockImplementation(async (method: string, input: { agentId?: string }) => {
    if (method === "session-title.list")
      return [
        { agentId: "a", title: "会员续费", archived: true, runs: 2, at: result.at, phase: "done" },
        { agentId: "b", title: "订单退款", archived: false, runs: 1, at: result.at, phase: "done" },
      ];
    if (method === "session-title.read")
      return {
        history,
        job,
        result:
          input.agentId === "b"
            ? { ...result, analysis: { ...result.analysis, title: "订单退款业务" } }
            : result,
        protected: false,
        error: null,
      };
    if (method === "session-title.apply") return { applied: true };
    if (method === "session-title.cancel") {
      if (job) job.phase = "canceled";
      return { canceled: true };
    }
    throw new Error("unexpected RPC");
  });
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const props = {
    params: { agentId: "a", workspaceId: "w" },
    host: { id: "host" },
    layout: { compact },
    theme: {
      colors: {
        foreground: dark ? "#eeeeee" : "#111111",
        foregroundMuted: "#888888",
        surface0: dark ? "#222222" : "#ffffff",
        surface1: "#333333",
        accent: "#0055cc",
        accentForeground: "#ffffff",
        border: "#777777",
        statusDanger: "#cc0000",
      },
    },
  } as unknown as PluginAgentPanelProps;
  await act(async () => {
    root!.render(
      <QueryClientProvider client={cache}>
        {workspace ? (
          <SessionTitlePanel {...(props as unknown as PluginWorkspacePanelProps)} workspaceId="w" />
        ) : (
          <Surface theme={props.theme}>
            <TitleContent agentId="a" hostId="host" />
          </Surface>
        )}
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
  return node;
}
it.each([
  [false, false],
  [true, true],
])(
  "renders the persisted preview in compact=%s dark=%s without applying automatically",
  async (compact, dark) => {
    const node = await mount(null, compact, dark);
    expect(node.textContent).toContain("修复会员权益同步");
    await act(async () => {
      [...node.querySelectorAll("button")]
        .find((button) => button.textContent === "详细信息")!
        .click();
    });
    expect(node.textContent).toContain("覆盖 40 条");
    expect(node.textContent).toContain("待办：回归测试");
    expect(node.innerHTML).toContain(dark ? "rgb(238, 238, 238)" : "rgb(17, 17, 17)");
    expect(api.call.mock.calls.every(([name]) => name === "session-title.read")).toBe(true);
    const apply = [...node.querySelectorAll("button")].find(
      (button) => button.textContent === "应用推荐标题",
    )!;
    await act(async () => {
      apply.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
    expect(api.call).toHaveBeenCalledWith("session-title.apply", {
      agentId: "a",
      resultId: "result",
    });
    expect(node.textContent).toContain("标题已应用");
  },
);
it("shows progress, disables apply during work, and sends cancellation for the current session", async () => {
  const node = await mount({
    id: "job",
    source: "automatic",
    phase: "summarizing",
    completed: 1,
    total: 4,
    error: null,
    result,
  });
  expect(node.textContent).toContain("正在总结分段 2/4");
  expect(
    [...node.querySelectorAll("button")].find((button) => button.textContent === "应用推荐标题")!
      .disabled,
  ).toBe(true);
  await act(async () => {
    [...node.querySelectorAll("button")]
      .find((button) => button.textContent === "取消总结")!
      .click();
  });
  expect(api.call).toHaveBeenCalledWith("session-title.cancel", { agentId: "a" });
});
it("switches conversations inside the same workspace panel without opening more tabs", async () => {
  const node = await mount(null, true, true, true);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(api.call).toHaveBeenCalledWith("session-title.list", { workspaceId: "w" });
  expect(node.textContent).toContain("会话列表（2）");
  await act(async () => {
    node.querySelector<HTMLButtonElement>('button[aria-label="订单退款"]')!.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(api.call).toHaveBeenCalledWith("session-title.read", { agentId: "b" });
  expect(node.textContent).toContain("订单退款业务");
});
it("inspects an older persisted run without generating or applying anything", async () => {
  const old: TitleJob = {
    id: "old",
    source: "automatic",
    phase: "done",
    at: "2026-10-25T10:00:00Z",
    completed: 1,
    total: 1,
    error: null,
    result: { ...result, applied: true, analysis: { ...result.analysis, title: "旧业务标题" } },
  };
  const current: TitleJob = { ...old, id: "new", at: "2026-10-26T10:00:00Z", result };
  const node = await mount(current, true, false, false, [old, current]);
  await act(async () => {
    [...node.querySelectorAll("button")]
      .find(
        (button) =>
          button.textContent?.includes("2026/10/25") || button.textContent?.includes("10/25/2026"),
      )!
      .click();
  });
  expect(node.textContent).toContain("旧业务标题");
  expect(api.call.mock.calls.every(([method]) => method === "session-title.read")).toBe(true);
});
