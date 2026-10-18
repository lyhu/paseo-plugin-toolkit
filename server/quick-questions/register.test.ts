import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { registerQuickQuestions } from "./register";
import { createModelStore } from "../models/storage";
import {
  readWorkspaceChanges,
  readSummaryChanges,
  saveQuestions,
  workspaceVersion,
} from "../../shared/quick-questions/contracts";

it("returns no unchanged payload and still detects remote question and feature changes", async () => {
  const home = mkdtempSync(join(tmpdir(), "toolkit-sync-"));
  vi.stubEnv("PASEO_HOME", home);
  const handlers = new Map<unknown, (input: any) => any>();
  let enabled = true;
  const dispose = registerQuickQuestions(
    { handle: (contract: unknown, handler: any) => handlers.set(contract, handler) } as never,
    createModelStore(home),
    async () => ({ quickQuestionsEnabled: enabled }),
  );
  try {
    const read = handlers.get(readWorkspaceChanges)!;
    const first = await read({ workspaceId: "w" });
    const known = workspaceVersion(first);
    expect(await read({ workspaceId: "w", known })).toBeNull();
    await handlers.get(saveQuestions)!({
      workspaceId: "w",
      revision: 0,
      enabled: true,
      questions: [],
    });
    const next = await read({ workspaceId: "w", known });
    expect(next.revision).toBe(1);
    enabled = false;
    expect((await read({ workspaceId: "w", known: workspaceVersion(next) })).featureEnabled).toBe(
      false,
    );
    expect(handlers.get(readSummaryChanges)!({ workspaceId: "w", known: "none" })).toEqual({
      unchanged: true,
      job: null,
    });
  } finally {
    dispose();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
});
