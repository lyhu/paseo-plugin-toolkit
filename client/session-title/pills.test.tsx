import { expect, it, vi } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import type { PluginClientContext, PluginComposerPillContribution } from "@getpaseo/plugin/client";
const state = vi.hoisted(() => ({ observe: vi.fn(), prepare: vi.fn() }));
vi.mock("../agent-directory", () => ({ observeAgents: state.observe }));
vi.mock("./prepare-clear", () => ({ prepareClear: state.prepare }));
vi.mock("react-native", () => ({ View: () => null }));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: () => null }));
vi.mock("../i18n", () => ({ tr: (text: string) => text }));
import { registerTitlePills } from "./pills";
it("prepares a manual clear without archiving the conversation", async () => {
  let listener!: { upsert(agent: PaseoAgent): void };
  const stop = vi.fn();
  state.observe.mockImplementation((_paseo, value) => {
    listener = value;
    return stop;
  });
  const remove = vi.fn(),
    rpc = vi.fn();
  let contribution!: PluginComposerPillContribution;
  const client = {
    paseo: {},
    rpc,
    addComposerPill: (entry: PluginComposerPillContribution) => {
      contribution = entry;
      return { remove, update: vi.fn() };
    },
  } as unknown as PluginClientContext;
  const pills = registerTitlePills(client);
  const agent = { id: "a", workspaceId: "w", archivedAt: null, status: "idle" } as PaseoAgent;
  listener.upsert(agent);
  expect(contribution).toMatchObject({
    workspaceId: "w",
    agentId: "a",
    button: { label: "归档新建", disabled: false },
  });
  if (contribution.button.behavior.kind !== "action") throw new Error("expected action");
  await contribution.button.behavior.onPress();
  expect(state.prepare).toHaveBeenCalledWith(client, "a", expect.any(AbortSignal));
  expect(rpc).not.toHaveBeenCalled();
  listener.upsert({ ...agent, archivedAt: "2026-10-26" });
  expect(remove).toHaveBeenCalledOnce();
  expect(state.prepare.mock.calls[0]![2].aborted).toBe(true);
  pills.dispose();
  expect(stop).toHaveBeenCalledOnce();
});
