import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { readTitle, startTitle } from "../../shared/session-title/contracts";
const state = vi.hoisted(() => ({ composer: vi.fn() }));
vi.mock("../web", () => ({ getTitleComposer: state.composer }));
vi.mock("../i18n", () => ({ tr: (text: string) => text }));
import { prepareClear } from "./prepare-clear";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  let draft = "";
  const write = vi.fn(() => true);
  state.composer.mockReturnValue({ read: () => draft, write });
  const rpc = vi.fn().mockResolvedValueOnce({ id: "job", phase: "reading" });
  const controller = new AbortController();
  const run = () => prepareClear({ rpc } as unknown as PluginClientContext, "a", controller.signal);
  return { rpc, write, controller, run, edit: (text: string) => (draft = text) };
}
const done = { id: "job", phase: "done", result: { applied: true } };

it("waits for the title to be saved, then only fills /clear", async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ job: { id: "job", phase: "applying" } });
  f.rpc.mockResolvedValueOnce({ job: done });
  const pending = f.run();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  await pending;
  expect(f.rpc.mock.calls).toEqual([
    [startTitle, { agentId: "a" }],
    [readTitle, { agentId: "a" }],
    [readTitle, { agentId: "a" }],
  ]);
  expect(f.write).toHaveBeenCalledExactlyOnceWith("/clear");
});

it.each(["error", "canceled"])("keeps the composer when naming is %s", async (phase) => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ job: { id: "job", phase, error: "命名未完成" } });
  const rejected = expect(f.run()).rejects.toThrow("命名未完成");
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
  expect(f.write).not.toHaveBeenCalled();
});

it("preserves text typed while the model is running", async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ job: done });
  const rejected = expect(f.run()).rejects.toThrow("输入框已变化");
  f.edit("新的问题");
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
  expect(f.write).not.toHaveBeenCalled();
});

it("does not write after its conversation pill is removed", async () => {
  const f = fixture();
  const pending = f.run();
  f.controller.abort();
  await vi.advanceTimersByTimeAsync(500);
  await pending;
  expect(f.write).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledOnce();
});

it("does not fill for a superseded naming job", async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ job: { ...done, id: "other" } });
  const rejected = expect(f.run()).rejects.toThrow("命名任务已变化");
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
  expect(f.write).not.toHaveBeenCalled();
});

it("reports a detached composer after naming without sending anything", async () => {
  const f = fixture();
  f.rpc.mockResolvedValueOnce({ job: done });
  f.write.mockReturnValue(false);
  const rejected = expect(f.run()).rejects.toThrow("请手动输入 /clear");
  await vi.advanceTimersByTimeAsync(500);
  await rejected;
});

it("reports unsupported composer access before starting a model request", async () => {
  const f = fixture();
  state.composer.mockReturnValue(undefined);
  await expect(f.run()).rejects.toThrow("无法定位当前输入框");
  expect(f.rpc).not.toHaveBeenCalled();
});
