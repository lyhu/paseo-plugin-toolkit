import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  calls: [] as { binary: string; args: string[]; options: { env: Record<string, string> } }[],
  status: { home: "/test-home", listen: "0.0.0.0:6767", connectedDaemon: "reachable" },
}));
vi.mock("node:child_process", () => ({
  execFile(
    binary: string,
    args: string[],
    options: { env: Record<string, string> },
    callback: (error: null, output: string) => void,
  ) {
    state.calls.push({ binary, args, options });
    callback(null, args.includes("status") ? JSON.stringify(state.status) : "{}");
  },
}));
vi.mock("node:util", async (original) => ({
  ...(await original<typeof import("node:util")>()),
  promisify:
    (fn: (...args: any[]) => void) =>
    (...args: unknown[]) =>
      new Promise((resolve) =>
        fn(...args, (_error: unknown, stdout: string) => resolve({ stdout, stderr: "" })),
      ),
}));
vi.mock("../models/storage", () => ({ paseoHome: () => "/test-home" }));
import { renameSession } from "./rename";
beforeEach(() => {
  state.calls.length = 0;
  state.status.home = "/test-home";
});
it("routes to the status-reported daemon using one selector and passes the title as a literal argument", async () => {
  const title = "会员 `touch /tmp/unsafe` $(echo unsafe)";
  await renameSession("test-agent", title, new AbortController().signal);
  expect(state.calls[0]!.args).toEqual(["--home", "/test-home", "daemon", "status", "--json"]);
  expect(state.calls[1]!.args).toEqual([
    "--host",
    "127.0.0.1:6767",
    "agent",
    "update",
    "test-agent",
    "--name",
    title,
    "--json",
  ]);
  expect(state.calls[1]!.options.env).toMatchObject({ PASEO_HOME: "/test-home", PASEO_HOST: "" });
});
it("never writes to a mismatched home", async () => {
  state.status.home = "/another-home";
  await expect(renameSession("a", "业务标题", new AbortController().signal)).rejects.toThrow(
    "写回失败",
  );
  expect(state.calls).toHaveLength(1);
});
