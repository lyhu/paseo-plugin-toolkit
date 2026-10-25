import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { openWorkbenchFile } from "../web";
const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));
let dom: JSDOM;
afterEach(() => {
  dom?.window.close();
  vi.unstubAllGlobals();
  platform.OS = "web";
});
function setup(path = "/h/host/workspace/space") {
  dom = new JSDOM("", { url: "https://paseo.local" + path });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("PopStateEvent", dom.window.PopStateEvent);
  dom.window.history.replaceState({ id: "native-history" }, "", path);
  dom.window.addEventListener("popstate", () => {
    if (new URLSearchParams(dom.window.location.search).get("open") === "file:")
      dom.window.history.replaceState(dom.window.history.state, "", dom.window.location.pathname);
  });
}
it("opens Unicode skill paths through the native file intent without reloading or adding history entries", async () => {
  setup();
  const opened: string[] = [];
  dom.window.addEventListener("popstate", () => {
    const intent = new URLSearchParams(dom.window.location.search).get("open");
    if (intent && intent.length > 5)
      opened.push(Buffer.from(intent.slice(5), "base64url").toString("utf8"));
  });
  const path = "/工作空间/skill #1 (a)/SKILL.md";
  const length = dom.window.history.length;
  for (let i = 0; i < 2; i++)
    expect(await openWorkbenchFile({ serverId: "host", workspaceId: "space", path })).toBe(true);
  const intent = new URLSearchParams(dom.window.location.search).get("open")!;
  expect(intent.startsWith("file:")).toBe(true);
  expect(Buffer.from(intent.slice(5), "base64url").toString("utf8")).toBe(path);
  expect(dom.window.history.state).toEqual({ id: "native-history" });
  expect(dom.window.history.length).toBe(length);
  expect(opened).toEqual([path, path]);
});
it.each([
  { serverId: "other", workspaceId: "space", path: "/SKILL.md" },
  { serverId: "host", workspaceId: "other", path: "/SKILL.md" },
  { serverId: "host", workspaceId: "space", path: "" },
])("leaves the route unchanged for a wrong Host, workspace or empty path", async (input) => {
  setup();
  expect(await openWorkbenchFile(input)).toBe(false);
  expect(dom.window.location.search).toBe("");
});
it("keeps native platforms and non-workspace screens on their existing content fallback", async () => {
  setup("/plugins/toolkit/workbench");
  expect(
    await openWorkbenchFile({ serverId: "host", workspaceId: "space", path: "/SKILL.md" }),
  ).toBe(false);
  platform.OS = "ios";
  vi.stubGlobal("window", undefined);
  expect(
    await openWorkbenchFile({ serverId: "host", workspaceId: "space", path: "/SKILL.md" }),
  ).toBe(false);
});
