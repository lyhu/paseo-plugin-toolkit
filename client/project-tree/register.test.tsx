import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { registerProjectTree } from "./register";
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { readProjectTree } from "../../shared/project-tree/contracts";

const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(container: HTMLElement): { render(node: ReactNode): void; unmount(): void };
};
const state = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  render: vi.fn(),
  hosts: [],
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@getpaseo/plugin/client", () => ({ useHosts: () => state.hosts }));
vi.mock("@getpaseo/plugin/client/ui", () => ({ SidebarRow: () => null }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: () => null }));
vi.mock("../workbench/register", () => ({ registerWorkbench: () => () => {} }));
vi.mock("../workbench/knowledge-space", () => ({ useKnowledgeSpaceHeader: () => {} }));
vi.mock("./view-switcher", () => ({
  mountSidebarViewSwitcher: () => ({ update() {}, dispose() {} }),
}));
vi.mock("../workbench/data", () => ({
  useWorkbenchModel: () => ({
    ai: {},
    preferences: { tabs: [], favorites: [] },
    projects: [],
  }),
}));
vi.mock("./group-projection", () => ({
  groupSidebarSnapshot: (snapshot: unknown) => ({
    ...(snapshot as object),
    projectSources: new Map(),
    groupIds: new Map(),
  }),
}));
vi.mock("./device", () => ({
  loadDevicePreferences: async () => {},
  readDevicePreference: (key: string) => state.preferences.get(key) ?? null,
  writeDevicePreference: (key: string, value: string) => state.preferences.set(key, value),
}));
vi.mock("../web", () => ({
  renderProjectSidebar: (_: unknown, options: unknown) => state.render(options),
  mountProjectSidebar: (render: (container: unknown) => void) => {
    render({});
    return { update: (next: typeof render) => next({}), setEnabled() {}, dispose() {} };
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  state.preferences.clear();
  state.render.mockClear();
});

it.each([false, true])(
  "toggles a workspace against its inherited project visibility (default %s)",
  async (defaultVisible) => {
    const dom = new JSDOM("<div id='root'></div>");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const tree = {
      revision: 0,
      nodes: [
        {
          id: "project",
          kind: "project",
          name: "P",
          parentId: null,
          members: [{ serverId: "pro", projectId: "p" }],
        },
      ],
    };
    state.preferences.set("config.cache", JSON.stringify({ tree, catalogs: {} }));
    state.preferences.set(
      "config.sessionVisibility",
      JSON.stringify([["project", !defaultVisible]]),
    );
    let Sidebar!: ComponentType<PluginSidebarItemProps>;
    const cleanup = registerProjectTree({
      rpc: vi.fn(async (contract) =>
        contract === readProjectTree
          ? tree
          : {
              status: "ready",
              values: { enabled: true, showSessionsByDefault: defaultVisible },
              revision: "0",
            },
      ),
      addScreen: () => () => {},
      addSidebarHeaderItem: (registration: { Component: typeof Sidebar }) => {
        Sidebar = registration.Component;
        return () => {};
      },
    } as never);
    const root = createRoot(document.getElementById("root")!);
    try {
      await act(async () => {});
      await act(async () =>
        root.render(
          createElement(Sidebar, {
            host: { id: "config" },
            layout: { platform: "web" },
            theme: { colors: {} },
          } as PluginSidebarItemProps),
        ),
      );
      const options = () => state.render.mock.calls.at(-1)![0];
      expect(options().sessionVisibility.has("pro:w")).toBe(false);
      await act(async () => options().toggleSessions("pro:w", "project"));
      expect(options().sessionVisibility.get("pro:w")).toBe(defaultVisible);
      await act(async () => options().toggleSessions("pro:w", "project"));
      expect(options().sessionVisibility.get("pro:w")).toBe(!defaultVisible);
      expect(JSON.parse(state.preferences.get("config.sessionVisibility")!)).toContainEqual([
        "pro:w",
        !defaultVisible,
      ]);
    } finally {
      await act(async () => root.unmount());
      await cleanup();
      dom.window.close();
    }
  },
);
