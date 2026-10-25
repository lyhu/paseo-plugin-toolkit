import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import type { PluginTheme } from "@getpaseo/plugin";
import { expect, it, vi } from "vitest";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const detached = vi.hoisted(() => ({ content: null as unknown }));
vi.mock("react-native", () => {
  const component =
    (tag: string) =>
    ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement(tag, { "data-style": JSON.stringify(style) }, children);
  return {
    View: component("div"),
    Text: component("span"),
    Pressable: component("button"),
    TextInput: component("input"),
    ScrollView: component("section"),
  };
});
vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: () => null,
  Modal: Object.assign(
    ({ children }: { children: ReactNode }) => {
      detached.content = children;
      return null;
    },
    { Content: ({ children }: { children: ReactNode }) => createElement("div", null, children) },
  ),
}));
vi.mock("../i18n", () => ({ tr: (value: string) => value }));
import { WorkbenchTheme } from "./components";
import { ProjectPickerDialog } from "./project-picker";
it("preserves the theme when the host renders modal content in a detached sheet", () => {
  const theme = {
    colors: {
      foreground: "#202a3a",
      foregroundMuted: "#67748a",
      surface1: "#ffffff",
      border: "#dfe5ef",
    },
  } as PluginTheme;
  renderToStaticMarkup(
    <WorkbenchTheme.Provider value={theme}>
      <ProjectPickerDialog
        title="Add project"
        detail="Choose existing projects"
        projects={[]}
        hosts={[]}
        initialSelected={[]}
        editable
        confirmLabel="Save"
        onSave={async () => {}}
        onClose={() => {}}
      />
    </WorkbenchTheme.Provider>,
  );
  expect(detached.content).not.toBeNull();
  let html = "";
  expect(() => {
    html = renderToStaticMarkup(detached.content as ReactNode);
  }).not.toThrow();
  expect(html).toContain("Choose existing projects");
  expect(html).toContain("#202a3a");
});
