import { act, createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot(container: HTMLElement): { render(node: ReactNode): void; unmount(): void };
};
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { useQuestions, useSummary, workspaceKey } from "./queries";
import {
  summaryVersion,
  workspaceVersion,
  type Job,
  type Workspace,
} from "../../shared/quick-questions/contracts";

const state = await vi.hoisted(async () => {
  const { JSDOM } = await import("jsdom");
  const bootstrap = new JSDOM("");
  vi.stubGlobal("window", bootstrap.window);
  vi.stubGlobal("document", bootstrap.window.document);
  return { rpc: vi.fn() };
});
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => state.rpc }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
  state.rpc.mockReset();
});
function fixture() {
  vi.useFakeTimers();
  const dom = new JSDOM("<div id='root'></div>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  focusManager.setFocused(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.getElementById("root")!);
  return { dom, client, root };
}
it("polls for cross-device changes without replacing unchanged question data", async () => {
  const { dom, client, root } = fixture();
  let data: Workspace = {
    syncToken: "first",
    revision: 0,
    questions: [],
    featureEnabled: true,
    enabled: true,
    historyLimit: 50,
    summaryPrompt: "summary",
    model: { baseUrl: "", model: "", hasKey: false },
  };
  state.rpc.mockImplementation(async ({ known }) =>
    known === workspaceVersion(data) ? null : data,
  );
  let latest: Workspace | undefined;
  function Consumer() {
    latest = useQuestions("host", "workspace").data;
    return null;
  }
  await act(async () =>
    root.render(createElement(QueryClientProvider, { client }, createElement(Consumer))),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  const original = latest;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(latest).toBe(original);
  expect(state.rpc.mock.calls[1]![0].known).toBe(workspaceVersion(data));
  data = { ...data, syncToken: "second", enabled: false };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30001);
  });
  expect(latest?.enabled).toBe(false);
  let finish!: (data: Workspace | null) => void;
  state.rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = client.refetchQueries({ queryKey: workspaceKey("host", "workspace") });
  });
  const saved = { ...data, revision: 2, syncToken: "saved" };
  await act(async () => {
    client.setQueryData(workspaceKey("host", "workspace"), saved);
    finish(data);
    await pending;
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(latest?.syncToken).toBe("saved");
  await act(async () => root.unmount());
  await vi.advanceTimersByTimeAsync(60000);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  client.clear();
  dom.window.close();
});
it("observes folded jobs slowly, active expanded jobs promptly, and terminal jobs at discovery cadence", async () => {
  const { dom, client, root } = fixture();
  let job = { id: "job", revision: 0, phase: "reading" } as Job;
  state.rpc.mockImplementation(async ({ known }) => ({
    unchanged: known === summaryVersion(job),
    job: known === summaryVersion(job) ? null : job,
  }));
  function Consumer({ expanded }: { expanded: boolean }) {
    useSummary("host", "workspace", expanded);
    return null;
  }
  const render = (expanded: boolean) =>
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Consumer, { expanded })),
    );
  await act(async () => render(false));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(state.rpc).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4001);
  });
  expect(state.rpc).toHaveBeenCalledTimes(2);
  await act(async () => render(true));
  job = { ...job, phase: "done", revision: 1 };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001);
  });
  expect(state.rpc).toHaveBeenCalledTimes(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(state.rpc).toHaveBeenCalledTimes(3);
  await act(async () => root.unmount());
  client.clear();
  dom.window.close();
});
