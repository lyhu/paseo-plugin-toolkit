import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaseoClient, type PaseoAgentListResult, type PaseoClient } from "@getpaseo/client";
import { createJobs } from "./jobs";
import { renderMessage } from "../../shared/chat-view/i18n";

const clients: PaseoClient[] = [];
const jobsToDispose: ReturnType<typeof createJobs>[] = [];
function fixture() {
  const paseo = createPaseoClient({ url: "ws://127.0.0.1:1", reconnect: { enabled: false } });
  clients.push(paseo);
  const jobs = createJobs();
  jobsToDispose.push(jobs);
  return { paseo, jobs };
}
afterEach(async () => {
  for (const jobs of jobsToDispose.splice(0)) jobs.dispose();
  for (const client of clients.splice(0)) await client.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const model = { baseUrl: "https://example.com/v1", model: "summary", apiKey: "" };
const empty: PaseoAgentListResult = {
  requestId: "r",
  entries: [],
  pageInfo: { nextCursor: null, prevCursor: null, hasMore: false },
};
describe("summary task feedback", () => {
  it("expires terminal jobs after 30 minutes without canceling running jobs", async () => {
    vi.useFakeTimers();
    const { paseo, jobs } = fixture();
    vi.spyOn(paseo.agents, "list").mockResolvedValue(empty);
    const task = jobs.start(paseo, "workspace", model);
    await vi.advanceTimersByTimeAsync(1);
    expect(task.phase).toBe("error");
    expect(jobs.read("workspace")).toBe(task);
    await vi.advanceTimersByTimeAsync(1800001);
    expect(jobs.read("workspace")).toBeNull();
  });
  it("reports directory errors and allows a fresh retry", async () => {
    const { paseo, jobs } = fixture();
    vi.spyOn(paseo.agents, "list")
      .mockRejectedValueOnce(new Error("连接已断开"))
      .mockResolvedValueOnce(empty);
    const first = jobs.start(paseo, "workspace", model);
    await vi.waitFor(() => expect(jobs.read("workspace")?.phase).toBe("error"));
    expect(renderMessage("zh-CN", first.activity)).toBe("总结失败：连接已断开");
    expect(first.events.map((event) => event.level)).toEqual(["info", "error"]);
    const second = jobs.start(paseo, "workspace", model);
    expect(second.id).not.toBe(first.id);
    await vi.waitFor(() => expect(second.phase).toBe("error"));
    expect(renderMessage("zh-CN", second.activity)).toBe(
      "没有可总结的用户提问。请检查历史读取结果后重试。",
    );
    expect(second.events.map((event) => renderMessage("zh-CN", event.message))).toEqual([
      "正在查找当前工作空间的对话（包含归档），选取最近 50 条用户提问",
      "找到 0 个对话，开始读取历史",
      "共读取 0 条用户提问，选用最近 0 条参与总结",
      "没有可总结的用户提问。请检查历史读取结果后重试。",
    ]);
  });
  it("removes only the requested candidate from the current completed task", async () => {
    const { paseo, jobs } = fixture();
    vi.spyOn(paseo.agents, "list").mockResolvedValue(empty);
    const task = jobs.start(paseo, "workspace", model);
    await vi.waitFor(() => expect(task.phase).toBe("error"));
    expect(() => jobs.removeCandidate("workspace", task.id, "one")).toThrow(
      "quickQuestions.error.candidateStale",
    );
    task.phase = "done";
    task.candidates = ["one", "two"].map((id) => ({
      id,
      text: id,
      origin: "history",
      frequency: 1,
      sources: [],
    }));
    expect(() => jobs.removeCandidate("other-workspace", task.id, "one")).toThrow(
      "quickQuestions.error.candidateStale",
    );
    expect(() => jobs.removeCandidate("workspace", "stale-task", "one")).toThrow(
      "quickQuestions.error.candidateStale",
    );
    expect(task.candidates.map((q) => q.id)).toEqual(["one", "two"]);
    jobs.removeCandidate("workspace", task.id, "one");
    expect(jobs.read("workspace")?.candidates.map((q) => q.id)).toEqual(["two"]);
    jobs.removeCandidate("workspace", task.id, "one");
    expect(task.candidates.map((q) => q.id)).toEqual(["two"]);
  });
  it("shows cancellation immediately and does not turn it into a failure", async () => {
    const { paseo, jobs } = fixture();
    let release = (_result: PaseoAgentListResult) => {};
    vi.spyOn(paseo.agents, "list").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const task = jobs.start(paseo, "workspace", model);
    expect(jobs.cancel("workspace")).toBe(true);
    expect(task.phase).toBe("canceled");
    expect(renderMessage("zh-CN", task.activity)).toContain("总结已取消");
    release(empty);
    await vi.waitFor(() =>
      expect(renderMessage("zh-CN", task.events.at(-1)?.message ?? task.activity)).toContain(
        "总结已取消",
      ),
    );
    expect(task.error).toBeNull();
  });
});
