import { expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { cancelTitle, queueClearTitle } from "../../shared/session-title/contracts";
const state = vi.hoisted(() => ({ composer: vi.fn(), focused: vi.fn() }));
vi.mock("../web", () => ({ getTitleComposer: state.composer, getFocusedComposer: state.focused }));
vi.mock("../i18n", () => ({ tr: (text: string) => text }));
import { prepareClear } from "./prepare-clear";

function fixture() {
  let draft = "";
  state.focused.mockReturnValue(undefined);
  const submitClear = vi.fn().mockResolvedValue(true);
  state.composer.mockReturnValue({ read: () => draft, submitClear });
  const rpc = vi.fn().mockResolvedValue({ id: "job", phase: "queued" });
  const controller = new AbortController();
  const run = () => prepareClear({ rpc } as unknown as PluginClientContext, "a", controller.signal);
  return { rpc, submitClear, controller, run, edit: (text: string) => (draft = text) };
}

it("submits native /clear as soon as naming is queued, without polling or waiting for the model", async () => {
  const f = fixture();
  await f.run();
  expect(f.rpc).toHaveBeenCalledExactlyOnceWith(queueClearTitle, { agentId: "a" });
  expect(f.submitClear).toHaveBeenCalledExactlyOnceWith(f.controller.signal);
  expect(f.rpc.mock.invocationCallOrder[0]).toBeLessThan(
    f.submitClear.mock.invocationCallOrder[0]!,
  );
});

it("does not submit if the naming intent could not be saved", async () => {
  const f = fixture();
  f.rpc.mockRejectedValueOnce(new Error("offline"));
  await expect(f.run()).rejects.toThrow("offline");
  expect(f.submitClear).not.toHaveBeenCalled();
});

it("preserves text edited while the short enqueue RPC is pending", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async () => {
    f.edit("新的问题");
    return { id: "job", phase: "queued" };
  });
  await expect(f.run()).rejects.toThrow("当前输入内容已变化");
  expect(f.submitClear).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenLastCalledWith(cancelTitle, { agentId: "a", jobId: "job" });
});

it("does not submit after its conversation pill is removed", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async () => {
    f.controller.abort();
    return { id: "job", phase: "queued" };
  });
  await f.run();
  expect(f.submitClear).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenLastCalledWith(cancelTitle, { agentId: "a", jobId: "job" });
});

it("reports a failed native submission instead of sending /clear to the agent", async () => {
  const f = fixture();
  f.submitClear.mockResolvedValue(false);
  await expect(f.run()).rejects.toThrow("未能提交 /clear");
  expect(f.rpc).toHaveBeenLastCalledWith(cancelTitle, { agentId: "a", jobId: "job" });
});

it("reports unsupported composer access before enqueueing", async () => {
  const f = fixture();
  state.composer.mockReturnValue(undefined);
  await expect(f.run()).rejects.toThrow("无法定位当前输入框");
  expect(f.rpc).not.toHaveBeenCalled();
});

it("cancels the queued job when the composer reports a specific preflight error", async () => {
  const f = fixture();
  f.submitClear.mockRejectedValue(new Error("当前输入框已隐藏"));
  await expect(f.run()).rejects.toThrow("当前输入框已隐藏");
  expect(f.rpc).toHaveBeenLastCalledWith(cancelTitle, { agentId: "a", jobId: "job" });
});

it("focuses the agent composer through the plugin API when the pill sits outside its pane", async () => {
  const f = fixture();
  state.composer.mockReturnValue(undefined);
  const focus = vi.fn().mockImplementation(async () => {
    state.focused.mockReturnValue({ read: () => "", submitClear: f.submitClear });
  });
  const composers = vi.fn().mockReturnValue([{ focus }]);
  const rpc = vi.fn().mockResolvedValue({ id: "job", phase: "queued" });
  await prepareClear(
    { rpc, composers } as unknown as PluginClientContext,
    "a",
    f.controller.signal,
  );
  expect(composers).toHaveBeenCalledWith({ agentId: "a" });
  expect(focus).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith(queueClearTitle, { agentId: "a" });
  expect(f.submitClear).toHaveBeenCalledOnce();
});

it("reports unsupported composer access when focusing finds no composer", async () => {
  const f = fixture();
  state.composer.mockReturnValue(undefined);
  const focus = vi.fn().mockResolvedValue(undefined);
  const composers = vi.fn().mockReturnValue([{ focus }]);
  const rpc = vi.fn();
  await expect(
    prepareClear({ rpc, composers } as unknown as PluginClientContext, "a", f.controller.signal),
  ).rejects.toThrow("无法定位当前输入框");
  expect(focus).toHaveBeenCalledOnce();
  expect(rpc).not.toHaveBeenCalled();
});
