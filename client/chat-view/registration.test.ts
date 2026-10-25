import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as JSX from "react/jsx-runtime";
import * as zod from "zod";
import * as Plugin from "@getpaseo/plugin";
import * as ReactNative from "react-native-web";
import { expect, it, vi } from "vitest";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { activitySettings } from "../../shared/chat-view/settings";
import { projectTreeSettings } from "../../shared/project-tree/contracts";
import { sessionTitleSettings } from "../../shared/session-title/contracts";
import { editorHighlightSettings } from "../../shared/editor-highlight/contracts";
import { pathToFileURL, fileURLToPath } from "node:url";
import { paseoToolLeafName } from "../../shared/chat-view/activity/paseo-tools";

const defaultPaseoSource = resolve(fileURLToPath(new URL("../../", import.meta.url)), "../paseo");

it("loads sticky questions, activity and Mermaid while preserving native user messages", async () => {
  const paseoSource = process.env.PASEO_SOURCE_DIR ?? defaultPaseoSource;
  const { compilePlugin } = await import(
    pathToFileURL(join(paseoSource, "packages/server/src/server/plugins/compiler.ts")).href
  );
  const { clientBundle } = await compilePlugin({
    client: new URL("../../index.client.tsx", import.meta.url).pathname,
    server: new URL("../../index.server.ts", import.meta.url).pathname,
  });
  const save = vi.fn(async () => true);
  const saveProjectTree = vi.fn(async () => true);
  const savedValues = activitySettings.schema.parse({ palette: "soft", displayMode: "detailed" });
  const enabledValues = {
    ...activitySettings.schema.parse({}),
    mermaidEnabled: true,
    compactActivityEnabled: true,
  };
  const switches: Array<{
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }> = [];
  const selections: Array<{ disabled: boolean; label: string }> = [];
  const actions: Array<{ label: string; onPress(): void }> = [];
  const container = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const modules: Record<string, unknown> = {
    react: React,
    "@tanstack/react-query": {
      useQuery: () => ({ data: undefined, isPending: false, isError: false }),
      useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
      useQueryClient: () => ({ setQueryData: vi.fn() }),
    },
    zod,
    "@getpaseo/plugin": Plugin,
    "@getpaseo/plugin/client/ui": {
      SettingsSection: container,
      SettingsCard: container,
      SettingsRow: container,
      SettingsAction: (props: { label: string; onPress(): void }) => {
        actions.push(props);
        return null;
      },
      SettingsSelect: (props: { disabled: boolean; label: string }) => {
        selections.push(props);
        return null;
      },
      SettingsSwitch: (props: (typeof switches)[number]) => {
        switches.push(props);
        return React.createElement("span", null, props.label);
      },
    },
    "react/jsx-runtime": JSX,
    "react-native": ReactNative,
    "@getpaseo/plugin/client": {
      useSettings: (definition: { id: string }) => {
        if (definition.id === projectTreeSettings.id) {
          return {
            status: "ready",
            values: projectTreeSettings.schema.parse({ enabled: false }),
            revision: "tree-revision",
            saving: false,
            saveError: null,
            save: saveProjectTree,
          };
        }
        if (definition.id === sessionTitleSettings.id) {
          return {
            status: "ready",
            values: sessionTitleSettings.schema.parse({ enabled: false }),
            revision: "title-revision",
            saving: false,
            saveError: null,
            save: vi.fn(),
          };
        }
        if (definition.id === editorHighlightSettings.id) {
          return {
            status: "ready",
            values: editorHighlightSettings.schema.parse({ automatic: true }),
            revision: "highlight-revision",
            saving: false,
            saveError: null,
            save: vi.fn(),
          };
        }
        return {
          status: "ready",
          values: savedValues,
          revision: "saved-revision",
          saving: false,
          saveError: null,
          save,
        };
      },
      useRpc: () => async () => ({
        ok: false,
        message: "未调用",
        latencyMs: 0,
        endpoint: "",
      }),
      usePaseo: () => {
        throw new Error("Registration must not call a React hook");
      },
    },
    "@getpaseo/plugin/client/react-native": {
      Icon: () => null,
      copyText: vi.fn(async () => {}),
    },
  };
  const factory = (0, eval)(clientBundle!);
  const exports = factory((name: string) => {
    if (!(name in modules)) throw new Error(`Unsupported runtime module: ${name}`);
    return modules[name];
  });
  const remove = vi.fn();
  const release = vi.fn(async () => {});
  const unsubscribe = vi.fn();
  const removedTransformers: string[] = [];
  const addTimelineTransformer = vi.fn((registration) => () => {
    removedTransformers.push(registration.id);
  });
  const addTimelineRenderer = vi.fn(() => vi.fn());
  const addComposerPill = vi.fn((pill) => {
    expect(typeof pill.button.icon).toBe("function");
    return { remove, update: vi.fn() };
  });
  const quickRemove = vi.fn();
  const quickPills = vi.fn(() => ({ remove: quickRemove, update: vi.fn() }));
  const archivePills = vi.fn(() => ({ remove: vi.fn(), update: vi.fn() }));
  const removeSettings = vi.fn();
  const addSettingsScreen = vi.fn(() => removeSettings);
  const addSlashCommand = vi.fn(() => vi.fn());
  const cleanup = exports.default({
    addWorkspacePanel: vi.fn(() => vi.fn()),
    addHeaderButton: vi.fn(() => ({ remove: vi.fn(), update: vi.fn() })),
    addCommandCenterItem: vi.fn(() => vi.fn()),
    openSettings: vi.fn(),
    addSettingsScreen,
    rpc: vi.fn(async () => ({
      status: "ready",
      values: enabledValues,
      revision: "1",
    })),
    paseo: {
      agents: {
        subscribe: () => unsubscribe,
        list: async () => ({
          entries: [
            { agent: { id: "active", workspaceId: "workspace", archivedAt: null } },
            { agent: { id: "archived", workspaceId: "workspace", archivedAt: "2026-10-06" } },
          ],
          subscription: {
            release,
            subscribe: vi.fn((observer) =>
              observer.snapshot({
                entries: [{ agent: { id: "active", workspaceId: "workspace", archivedAt: null } }],
                pageInfo: { nextCursor: null },
              }),
            ),
          },
          pageInfo: { nextCursor: null },
        }),
      },
    },
    addTimelineTransformer,
    addTimelineRenderer,
    addComposerPill: (pill) =>
      pill.id.startsWith("quick-questions-")
        ? quickPills(pill)
        : pill.id.startsWith("session-archive-")
          ? archivePills(pill)
          : addComposerPill(pill),
    addSlashCommand,
  });
  await Promise.resolve();
  expect(archivePills).toHaveBeenCalledWith(
    expect.objectContaining({
      agentId: "active",
      button: expect.objectContaining({ label: "归档新建" }),
    }),
  );
  expect(addComposerPill).toHaveBeenCalledTimes(1);
  expect(addComposerPill.mock.calls[0]![0].agentId).toBe("active");
  expect(
    addTimelineTransformer.mock.calls.map(([registration]) => registration.query.itemType),
  ).toEqual(["assistant_message", "reasoning", "tool_call"]);
  expect(addTimelineRenderer).toHaveBeenCalledTimes(4);
  const mermaid = addTimelineTransformer.mock.calls[0]![0];
  expect(mermaid.transform({ item: { text: "ordinary answer" } })).toBeUndefined();
  expect(
    mermaid.transform({ item: { text: "```mermaid\nflowchart TD\nA --> B\n```" } }).items[0].kind,
  ).toBe("chat-view-mermaid-diagram");
  expect(addSettingsScreen).toHaveBeenCalledTimes(1);
  expect(addSettingsScreen).toHaveBeenCalledWith(
    expect.objectContaining({ id: "toolkit-settings", title: "Toolkit 设置", icon: "Settings" }),
  );
  expect(clientBundle).not.toContain("对话增强");
  expect(clientBundle).not.toContain("复制回答");
  const settingsRegistration = addSettingsScreen.mock.calls[0]![0];
  const page = settingsRegistration.Component({});
  const SettingsPage = settingsRegistration.Component;
  const markup = renderToStaticMarkup(
    React.createElement(SettingsPage, {
      theme: { colors: { foreground: "white", foregroundMuted: "gray", statusDanger: "red" } },
      host: { id: "host", label: "Local" },
      layout: { compact: false },
    }),
  );
  expect(markup).toContain("Toolkit 版本 v0.2.1");
  expect(markup).toContain("Paseo Toolkit");
  expect(markup).toContain("概览与主控");
  expect(markup).toContain("功能设置导航");

  // 渲染对话交互 Tab
  const chatMarkup = renderToStaticMarkup(
    React.createElement(SettingsPage, {
      theme: { colors: { foreground: "white", foregroundMuted: "gray", statusDanger: "red" } },
      host: { id: "host", label: "Local" },
      layout: { compact: false },
      initialTab: "chat",
    }),
  );
  expect(chatMarkup).toContain("紧凑活动总开关");
  expect(chatMarkup).toContain("Mermaid 交互图表");

  const defaults = activitySettings.schema.parse({});
  expect(defaults.language).toBe("zh-CN");
  expect(quickPills).toHaveBeenCalledTimes(1);
  page.props.onSettingsChange({ ...enabledValues, quickQuestionsEnabled: false });
  expect(quickRemove).toHaveBeenCalledTimes(1);
  page.props.onSettingsChange(enabledValues);
  expect(quickPills).toHaveBeenCalledTimes(2);
  page.props.onSettingsChange({ ...enabledValues, stickyEnabled: false });
  expect(remove).toHaveBeenCalledOnce();
  page.props.onSettingsChange({ ...enabledValues, stickyEnabled: false });
  expect(remove).toHaveBeenCalledOnce();
  page.props.onSettingsChange(enabledValues);
  expect(addComposerPill).toHaveBeenCalledTimes(2);
  page.props.onSettingsChange({ ...enabledValues, enhanceEnabled: true });
  expect(addComposerPill).toHaveBeenCalledTimes(3);
  expect(addComposerPill.mock.calls[2]![0].id).toBe("enhance-active");
  expect(addSlashCommand).toHaveBeenCalledTimes(2);
  expect(addSlashCommand).toHaveBeenCalledWith(expect.objectContaining({ name: "session-title" }));
  page.props.onSettingsChange({ ...enabledValues, enhanceEnabled: false });
  expect(addComposerPill).toHaveBeenCalledTimes(3);
  page.props.onSettingsChange({ ...enabledValues, mermaidEnabled: false });
  expect(removedTransformers).toEqual(["mermaid-assistant"]);
  page.props.onSettingsChange({
    ...enabledValues,
    mermaidEnabled: false,
    compactActivityEnabled: false,
  });
  expect(removedTransformers).toEqual(["mermaid-assistant", "reasoning", "tool-calls"]);
  page.props.onSettingsChange(enabledValues);
  expect(addTimelineTransformer).toHaveBeenCalledTimes(6);
  // Everything registered in the old language is registered again in the new one: the settings
  // screen's title, the composer pill and the slash command.
  const pillsBefore = addComposerPill.mock.calls.length;
  const commandsBefore = addSlashCommand.mock.calls.length;
  page.props.onSettingsChange({ ...enabledValues, language: "en-US" });
  expect(addSettingsScreen).toHaveBeenCalledTimes(2);
  expect(addSettingsScreen.mock.calls.slice(1).map(([entry]) => entry.title)).toEqual([
    "Toolkit Settings",
  ]);
  expect(removeSettings).toHaveBeenCalledTimes(1);
  expect(addComposerPill.mock.calls.slice(pillsBefore).map(([pill]) => pill.button.title)).toEqual([
    "Sticky Questions",
  ]);
  expect(
    addSlashCommand.mock.calls.slice(commandsBefore).map(([command]) => command.description),
  ).toEqual([
    "Enhance prompt: expands vague request into actionable prompt",
    "Summarize in the background and automatically set the session title",
  ]);
  await cleanup();
  // sticky removed on disable, enhance removed on disable, sticky removed again for the new
  // language, then removed once more on cleanup.
  expect(remove).toHaveBeenCalledTimes(4);
  expect(removeSettings).toHaveBeenCalledTimes(2);
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
});

it("covers every tool the host registers, or admits it by the browser family pattern", async () => {
  const paseoSource = process.env.PASEO_SOURCE_DIR ?? defaultPaseoSource;
  const sources = [
    "packages/server/src/server/agent/tools/paseo-tools.ts",
    "packages/server/src/server/browser-tools/tools.ts",
  ];
  const registered = new Set<string>();
  for (const source of sources) {
    const text = await readFile(join(paseoSource, source), "utf8");
    for (const match of text.matchAll(/registerTool\(\s*"([a-z0-9_]+)"/g)) registered.add(match[1]);
  }
  // 宿主换了注册写法时先让这条断言炸掉，而不是静默地什么都验不到。
  expect(registered.size).toBeGreaterThan(50);
  const unsupported = [...registered].filter((name) => !paseoToolLeafName(`paseo_${name}`));
  expect(unsupported).toEqual([]);
});
