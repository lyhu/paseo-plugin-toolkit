import { expect, it, vi } from "vitest";
import { createNodeSubmission } from "./submission";

it("blocks duplicate submits, retains errors and completes only a successful retry", async () => {
  const change = vi.fn();
  const complete = vi.fn();
  const submission = createNodeSubmission(change);
  let reject!: (cause: Error) => void;
  const work = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      }),
  );
  const pending = submission.perform(work, complete);
  await submission.perform(work, complete);
  expect(work).toHaveBeenCalledOnce();
  expect(submission.pending).toBe(true);
  reject(new Error("Revision conflict"));
  await pending;
  expect(complete).not.toHaveBeenCalled();
  expect(change).toHaveBeenLastCalledWith({ pending: false, error: "Revision conflict" });
  expect(submission.pending).toBe(false);
  await submission.perform(async () => {}, complete);
  expect(complete).toHaveBeenCalledOnce();
  expect(change).toHaveBeenLastCalledWith({ pending: false, error: "" });
});
