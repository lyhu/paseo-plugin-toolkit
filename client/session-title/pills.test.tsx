import { expect, it, vi } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import type { PluginClientContext, PluginComposerPillContribution } from "@getpaseo/plugin/client";
const state = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock("../agent-directory", () => ({ observeAgents: state.observe }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: () => null }));
vi.mock("../i18n", () => ({ tr: (text: string) => text }));
import { registerTitlePills } from "./pills";
import { archiveTitle } from "../../shared/session-title/contracts";
it("adds the archive action to the current conversation's composer and removes it on archive", async () => {
  let listener!: { upsert(agent: PaseoAgent): void };
  const stop = vi.fn();
  state.observe.mockImplementation((_paseo, value) => {
    listener = value;
    return stop;
  });
  const remove = vi.fn(),
    rpc = vi.fn().mockResolvedValue({ archived: true });
  let contribution!: PluginComposerPillContribution;
  const pills = registerTitlePills({
    paseo: {},
    rpc,
    addComposerPill: (entry: PluginComposerPillContribution) => {
      contribution = entry;
      return { remove, update: vi.fn() };
    },
  } as unknown as PluginClientContext);
  const agent = { id: "a", workspaceId: "w", archivedAt: null } as PaseoAgent;
  listener.upsert(agent);
  expect(contribution).toMatchObject({
    workspaceId: "w",
    agentId: "a",
    button: { label: "总结归档" },
  });
  if (contribution.button.behavior.kind !== "action") throw new Error("expected action");
  await contribution.button.behavior.onPress();
  expect(rpc).toHaveBeenCalledWith(archiveTitle, { agentId: "a" });
  listener.upsert({ ...agent, archivedAt: "2026-10-26" });
  expect(remove).toHaveBeenCalledOnce();
  pills.dispose();
  expect(stop).toHaveBeenCalledOnce();
});
