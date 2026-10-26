// @vitest-environment jsdom
import { createElement, act, type ReactNode } from "react";
import { createRequire } from "node:module";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import type { PaseoAgent } from "@getpaseo/client";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(node: Element): { render(node: ReactNode): void; unmount(): void };
};
const api = vi.hoisted(() => ({ call: vi.fn(), list: vi.fn() }));
vi.mock("react-native", () => ({
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
  TextInput: ({
    value,
    placeholder,
    onChangeText,
  }: {
    value: string;
    placeholder: string;
    onChangeText(value: string): void;
  }) =>
    createElement("input", {
      value,
      placeholder,
      onInput: (event: { currentTarget: { value: string } }) =>
        onChangeText(event.currentTarget.value),
    }),
  FlatList: ({
    data,
    renderItem,
    ListEmptyComponent,
  }: {
    data: PaseoAgent[];
    renderItem(input: { item: PaseoAgent; index: number }): ReactNode;
    ListEmptyComponent: ReactNode;
  }) =>
    createElement(
      "section",
      null,
      data.length ? data.map((item, index) => renderItem({ item, index })) : ListEmptyComponent,
    ),
}));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: () => null }));
vi.mock("@getpaseo/plugin/client", () => ({
  usePaseo: () => ({ agents: { list: api.list } }),
  useRpc: (contract: { name: string }) => (input: unknown) => api.call(contract.name, input),
}));
vi.mock("../i18n", () => ({
  useLocale: () => "zh-CN",
  tr: (text: string, values?: Record<string, string | number>) =>
    text.replace(/\{(\d+)\}/g, (_, key) => String(values?.[key] ?? "")),
}));
import { SessionTitlePanel } from "./panel";
let root: ReturnType<typeof createRoot> | undefined;
let cache: QueryClient;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  cache?.clear();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
const entries = [
  {
    id: "old",
    workspaceId: "w",
    title: "会员续费",
    createdAt: "2026-10-24T10:00:00Z",
    lastUserMessageAt: "2026-10-24T12:00:00Z",
    updatedAt: "2026-10-26T12:00:00Z",
    archivedAt: "2026-10-25",
    status: "closed",
  },
  {
    id: "new",
    workspaceId: "w",
    title: "订单退款",
    createdAt: "2026-10-26T10:00:00Z",
    lastUserMessageAt: "2026-10-26T11:00:00Z",
    updatedAt: "2026-10-26T11:00:00Z",
    archivedAt: null,
    status: "idle",
  },
  {
    id: "foreign",
    workspaceId: "other",
    title: "其他空间",
    createdAt: "2026-10-26T13:00:00Z",
    lastUserMessageAt: null,
    updatedAt: "2026-10-26T13:00:00Z",
    status: "idle",
  },
] as PaseoAgent[];
async function mount(compact = false, dark = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  api.list.mockResolvedValue({
    entries: entries.map((agent) => ({ agent })),
    pageInfo: { nextCursor: null },
  });
  api.call.mockImplementation(async (name: string, input: { agentId: string }) => {
    if (name === "session-title.turns") return { count: input.agentId === "new" ? 12 : null };
    if (name === "session-title.start") return { id: "job", phase: "queued" };
    throw new Error("unexpected RPC");
  });
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const openAgent = vi.fn();
  const props = {
    workspaceId: "w",
    params: {},
    host: { id: "host" },
    layout: { compact, platform: "web" },
    navigation: { openAgent },
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
  } as unknown as PluginWorkspacePanelProps;
  await act(async () => {
    root!.render(
      <QueryClientProvider client={cache}>
        <SessionTitlePanel {...props} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { node, openAgent };
}
it.each([
  [false, false],
  [true, true],
])(
  "renders all workspace sessions sorted by activity in compact=%s dark=%s",
  async (compact, dark) => {
    const { node } = await mount(compact, dark);
    expect(node.textContent).toContain("会话列表（2）");
    expect(node.textContent).not.toContain("其他空间");
    expect(node.textContent).toContain("12 轮");
    expect(node.textContent).toContain("— 轮");
    expect(node.textContent!.indexOf("订单退款")).toBeLessThan(
      node.textContent!.indexOf("会员续费"),
    );
    expect(node.textContent).not.toContain("命名记录");
    expect(node.textContent).not.toContain("会话摘要");
    expect(node.innerHTML).toContain(dark ? "rgb(238, 238, 238)" : "rgb(17, 17, 17)");
    expect(api.call.mock.calls.every(([method]) => method === "session-title.turns")).toBe(true);
  },
);
it("opens only on double press or the explicit open action, on the selected host", async () => {
  const { node, openAgent } = await mount();
  const row = node.querySelector<HTMLButtonElement>('button[aria-label="订单退款"]')!;
  await act(async () => row.click());
  expect(openAgent).not.toHaveBeenCalled();
  await act(async () => row.click());
  expect(openAgent).toHaveBeenCalledExactlyOnceWith({ agentId: "new", serverId: "host" });
  await act(async () =>
    node.querySelector<HTMLButtonElement>('button[aria-label="打开会话：会员续费"]')!.click(),
  );
  expect(openAgent).toHaveBeenLastCalledWith({ agentId: "old", serverId: "host" });
});
it("filters archived sessions without opening a tab or requesting naming", async () => {
  const { node, openAgent } = await mount();
  await act(async () =>
    [...node.querySelectorAll("button")].find((button) => button.textContent === "已归档")!.click(),
  );
  expect(node.textContent).toContain("会员续费");
  expect(node.textContent).not.toContain("订单退款");
  await act(async () =>
    [...node.querySelectorAll("button")].find((button) => button.textContent === "进行中")!.click(),
  );
  expect(node.textContent).toContain("订单退款");
  expect(node.textContent).not.toContain("会员续费");
  expect(openAgent).not.toHaveBeenCalled();
  expect(api.call.mock.calls.every(([method]) => method === "session-title.turns")).toBe(true);
});
it("starts silent naming from the trailing icon without opening a conversation or diagnostics", async () => {
  const { node, openAgent } = await mount();
  await act(async () =>
    node.querySelector<HTMLButtonElement>('button[aria-label="智能命名：会员续费"]')!.click(),
  );
  expect(api.call).toHaveBeenCalledWith("session-title.start", { agentId: "old" });
  expect(openAgent).not.toHaveBeenCalled();
  expect(node.textContent).not.toContain("会话摘要");
});
it("searches session titles", async () => {
  const { node } = await mount();
  await act(async () => {
    const input = node.querySelector("input")!;
    input.value = "退款";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(node.textContent).toContain("订单退款");
  expect(node.textContent).not.toContain("会员续费");
});
