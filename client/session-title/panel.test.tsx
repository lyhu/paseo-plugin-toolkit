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
const api = vi.hoisted(() => ({
  call: vi.fn(),
  list: vi.fn(),
  statuses: [] as Array<{ agentId: string; at: string; phase: string }>,
  copy: vi.fn(async (_text: string) => {}),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => createElement("span", { role: "progressbar" }),
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? createElement("div", null, children) : null,
  View: ({
    children,
    style,
    onPointerEnter,
    onPointerLeave,
    accessibilityRole,
    role,
  }: {
    children: ReactNode;
    style?: object;
    onPointerEnter?(): void;
    onPointerLeave?(): void;
    accessibilityRole?: string;
    role?: string;
  }) =>
    createElement(
      "div",
      { style, onPointerEnter, onPointerLeave, role: role ?? accessibilityRole },
      children,
    ),
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
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }),
  copyText: api.copy,
}));
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
  api.statuses = [];
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
    if (name === "session-title.list") return api.statuses;
    if (name === "session-title.start") {
      const at = new Date().toISOString();
      api.statuses = [{ agentId: input.agentId, at, phase: "reading" }];
      return { id: "job", phase: "reading", at };
    }
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
    expect(
      api.call.mock.calls.every(
        ([method]) => method === "session-title.turns" || method === "session-title.list",
      ),
    ).toBe(true);
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
  expect(
    api.call.mock.calls.every(
      ([method]) => method === "session-title.turns" || method === "session-title.list",
    ),
  ).toBe(true);
});
it("starts silent naming from the trailing icon without opening a conversation or diagnostics", async () => {
  const { node, openAgent } = await mount();
  await openActions(node);
  await act(async () => textButton(node, "智能生成标题").click());
  expect(api.call).toHaveBeenCalledWith("session-title.start", { agentId: "old" });
  expect(node.querySelector('[role="menu"]')).toBeNull();
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
it("places filters immediately before refresh and removes the instructional line", async () => {
  const { node } = await mount();
  const refresh = [...node.querySelectorAll("button")].find(
    (button) => button.textContent === "刷新",
  )!;
  expect(
    [...refresh.parentElement!.querySelectorAll("button")].map((button) => button.textContent),
  ).toEqual(["全部", "进行中", "已归档", "刷新"]);
  expect(refresh.parentElement!.style.marginLeft).toBe("auto");
  expect(refresh.parentElement!.parentElement!.style.flexDirection).toBe("row");
  expect(refresh.parentElement!.parentElement!.textContent).toContain("会话列表（2）");
  expect(node.textContent).not.toContain("双击打开会话 · 轮次按用户提问统计");
});
async function updatePhase(phase: string) {
  api.statuses = api.statuses.map((entry) => ({ ...entry, phase }));
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ["toolkit", "session-naming-status"] });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
it("keeps the spinner and disables repeat naming until the actual background task finishes", async () => {
  const { node } = await mount();
  await openActions(node);
  const button = () => node.querySelector<HTMLButtonElement>('[role="menu"] button')!;
  await act(async () => button().click());
  expect(node.querySelector('[role="menu"]')).toBeNull();
  await openActions(node);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(button().disabled).toBe(true);
  expect(button().textContent).toContain("总结对话");
  expect(button().querySelector('[role="progressbar"]')).not.toBeNull();
  await updatePhase("summarizing");
  expect(button().textContent).toContain("生成标题");
  expect(button().disabled).toBe(true);
  await act(async () => button().click());
  expect(api.call.mock.calls.filter(([name]) => name === "session-title.start")).toHaveLength(1);
  await updatePhase("done");
  expect(button().disabled).toBe(false);
  expect(button().querySelector('[role="progressbar"]')).toBeNull();
  expect(button().textContent).toBe("智能生成标题");
});
it("shows background failures and permits retry", async () => {
  const { node } = await mount();
  await openActions(node);
  const button = () => node.querySelector<HTMLButtonElement>('[role="menu"] button')!;
  await act(async () => button().click());
  await updatePhase("error");
  expect(node.textContent).toContain("命名失败，请重试。");
  await openActions(node);
  expect(button().disabled).toBe(false);
  await act(async () => button().click());
  expect(api.call.mock.calls.filter(([name]) => name === "session-title.start")).toHaveLength(2);
});
it("restores an already running naming status when the session list is reopened", async () => {
  api.statuses = [{ agentId: "old", at: new Date().toISOString(), phase: "summarizing" }];
  const { node } = await mount();
  const row = node.querySelector('button[aria-label="会员续费"]')!;
  expect(row.textContent).toContain("已归档");
  expect(row.lastElementChild!.textContent).toBe("正在生成标题...");
  expect(row.lastElementChild!.firstElementChild!.getAttribute("role")).toBe("progressbar");
  expect(row.lastElementChild!.previousElementSibling!.textContent).toContain("已归档");
  await openActions(node);
  const button = node.querySelector<HTMLButtonElement>('[role="menu"] button')!;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toContain("生成标题");
  expect(api.call.mock.calls.some(([name]) => name === "session-title.start")).toBe(false);
  await updatePhase("done");
  expect(row.textContent).not.toContain("正在生成标题...");
  expect(row.querySelector('[role="progressbar"]')).toBeNull();
});
const textButton = (node: Element, text: string) =>
  [...node.querySelectorAll("button")].find((button) => button.textContent === text)!;
async function openActions(node: Element, title = "会员续费") {
  await act(async () =>
    node.querySelector<HTMLButtonElement>(`button[aria-label="更多：${title}"]`)!.click(),
  );
}
it("puts all title actions in a dropdown and dismisses it by clicking outside", async () => {
  const { node } = await mount();
  expect(node.querySelector('[role="menu"]')).toBeNull();
  expect(node.textContent).not.toContain("智能生成标题");
  expect(node.textContent).not.toContain("复制标题");
  await openActions(node);
  const menu = node.querySelector('[role="menu"]')!;
  expect([...menu.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
    "智能生成标题",
    "复制标题",
    "重新命名",
    "永久删除",
  ]);
  expect(menu.parentElement!.parentElement!.parentElement!.textContent).toContain("会员续费");
  expect((menu as HTMLElement).style.width).toBe("160px");
  expect(
    [...menu.querySelectorAll("[data-icon]")].map((icon) => icon.getAttribute("data-icon")),
  ).toEqual(["Sparkles", "Copy", "Pencil", "Trash2"]);
  await act(async () =>
    node.querySelector<HTMLButtonElement>('button[aria-label="关闭更多菜单"]')!.click(),
  );
  expect(node.querySelector('[role="menu"]')).toBeNull();
});
it("copies the exact session title without opening a session", async () => {
  const { node, openAgent } = await mount();
  await openActions(node);
  await act(async () => textButton(node, "复制标题").click());
  expect(api.copy).toHaveBeenCalledExactlyOnceWith("会员续费");
  expect(node.textContent).toContain("标题已复制");
  expect(openAgent).not.toHaveBeenCalled();
});
it("renames manually with the original title and workspace, without invoking a model", async () => {
  const { node, openAgent } = await mount();
  await openActions(node);
  await act(async () => textButton(node, "重新命名").click());
  const dialog = node.querySelector('[role="dialog"]')!;
  expect((dialog as HTMLElement).style.position).toBe("absolute");
  expect((dialog as HTMLElement).style.width).toBe("576px");
  expect(node.querySelector('[role="menu"]')).toBeNull();
  expect(textButton(dialog, "保存").parentElement!.style.justifyContent).toBe("flex-end");
  expect(dialog.querySelector("input")!.value).toBe("会员续费");
  await act(async () => {
    const input = dialog.querySelector("input")!;
    input.value = "会员续费方案";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  api.call.mockImplementation(async (name: string) =>
    name === "session-title.rename" ? { renamed: true } : [],
  );
  await act(async () => textButton(dialog, "保存").click());
  expect(api.call).toHaveBeenCalledWith("session-title.rename", {
    agentId: "old",
    workspaceId: "w",
    previousTitle: "会员续费",
    title: "会员续费方案",
  });
  expect(node.querySelector('[role="dialog"]')).toBeNull();
  expect(openAgent).not.toHaveBeenCalled();
  expect(api.call.mock.calls.some(([name]) => name === "session-title.start")).toBe(false);
});
it("requires explicit confirmation for deletion and keeps failed deletion available for retry", async () => {
  const { node } = await mount();
  await openActions(node);
  await act(async () => textButton(node, "永久删除").click());
  const dialog = node.querySelector('[role="alert"]')!;
  expect(dialog.textContent).toContain("Provider 原始历史");
  expect(node.querySelector('[role="dialog"]')).toBeNull();
  expect(dialog.querySelectorAll("button")).toHaveLength(2);
  expect((dialog as HTMLElement).style.width).toBe("220px");
  expect(api.call.mock.calls.some(([name]) => name === "session-title.delete")).toBe(false);
  api.call.mockRejectedValue(
    new Error(
      "Request failed: 原始历史仍存在，请重试。 requestType=plugin.rpc.invoke.request code=handler_error",
    ),
  );
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('button[aria-label="确认永久删除"]')!.click(),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(api.call).toHaveBeenCalledWith("session-title.delete", {
    agentId: "old",
    workspaceId: "w",
    previousTitle: "会员续费",
    confirmed: true,
  });
  expect(dialog.textContent).toContain("原始历史仍存在，请重试。");
  expect(dialog.textContent).not.toContain("requestType=");
  expect(dialog.textContent).not.toContain("Request failed:");
  expect(
    dialog.querySelector<HTMLButtonElement>('button[aria-label="确认永久删除"]')!.disabled,
  ).toBe(false);
  await act(async () => textButton(dialog, "取消").click());
  expect(node.querySelector('[role="alert"]')).toBeNull();
});
it("emphasizes a hovered row and restores its background when the pointer leaves", async () => {
  const { node } = await mount();
  const row = node.querySelector('button[aria-label="订单退款"]')!.parentElement!.parentElement!;
  const original = row.style.backgroundColor;
  await act(async () => row.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
  expect(row.style.backgroundColor).not.toBe(original);
  expect(row.style.borderColor).toBe("rgb(0, 85, 204)");
  await act(async () =>
    row.dispatchEvent(
      new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
    ),
  );
  expect(row.style.backgroundColor).toBe(original);
});
