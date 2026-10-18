import { expect, it, vi } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { createAgentPills } from "./agent-pills";

it("reconciles one changed agent without scanning the other 1999 agents", () => {
  let checked = 0;
  const remove = vi.fn();
  const build = vi.fn(() => ({ remove, update: vi.fn() }));
  const pills = createAgentPills(build);
  const agents = Array.from(
    { length: 2000 },
    (_, i) =>
      ({
        id: String(i),
        workspaceId: "workspace",
        get archivedAt() {
          checked++;
          return null;
        },
      }) as PaseoAgent,
  );
  pills.setEnabled(true);
  for (const agent of agents) pills.registerAgent(agent);
  expect(checked).toBe(2000);
  pills.setEnabled(true);
  expect(checked).toBe(2000);
  pills.registerAgent(agents[0]!);
  expect(checked).toBe(2001);
  expect(build).toHaveBeenCalledTimes(2000);
  pills.registerAgent({ ...agents[0]!, workspaceId: "moved" });
  expect(remove).toHaveBeenCalledOnce();
  expect(build).toHaveBeenCalledTimes(2001);
  pills.dispose();
  expect(pills.liveAgents()).toEqual([]);
});
