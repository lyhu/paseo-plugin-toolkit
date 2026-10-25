import { afterEach, expect, it, vi } from "vitest";
import type { PaseoAgent } from "@getpaseo/client";
import { setLocalePreference } from "../chat-view/locale";
import { registerQuickQuestions } from "./register";

const state = vi.hoisted(() => ({
  observe: vi.fn(),
  draft: { setEnabled: vi.fn(), dispose: vi.fn() },
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("../agent-directory", () => ({ observeAgents: state.observe }));
vi.mock("./draft-pill", () => ({ createDraftPill: () => state.draft }));
vi.mock("./panel", () => ({ QuickQuestionsPanel: () => null }));
vi.mock("./popover", () => ({ QuickQuestionsPopover: () => null }));
afterEach(() => {
  setLocalePreference("zh-CN");
  vi.clearAllMocks();
});

it("shares Agent pill lifecycle while updating translated text without replacing an open popover", async () => {
  let listener!: { upsert(agent: PaseoAgent): void; remove(id: string): void };
  const stop = vi.fn();
  state.observe.mockImplementation((_, next) => {
    listener = next;
    return stop;
  });
  const registrations: Array<{
    remove: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }> = [];
  const addComposerPill = vi.fn((_contribution: { workspaceId: string }) => {
    const registration = { remove: vi.fn(), update: vi.fn() };
    registrations.push(registration);
    return registration;
  });
  const questions = registerQuickQuestions({
    paseo: {},
    addComposerPill,
    addWorkspacePanel: () => () => {},
    addCommandCenterItem: () => () => {},
  } as never);
  const agent = { id: "a", workspaceId: "w", archivedAt: null } as PaseoAgent;
  try {
    expect(state.observe).not.toHaveBeenCalled();
    questions.setEnabled(true);
    expect(state.observe).toHaveBeenCalledOnce();
    listener.upsert(agent);
    listener.upsert(agent);
    expect(addComposerPill).toHaveBeenCalledOnce();
    setLocalePreference("en-US");
    expect(registrations[0]!.update).toHaveBeenCalledWith({
      title: "Quick questions",
      label: "Quick questions",
    });
    expect(registrations[0]!.remove).not.toHaveBeenCalled();
    expect(addComposerPill).toHaveBeenCalledOnce();
    listener.upsert({ ...agent, workspaceId: "moved" });
    expect(registrations[0]!.remove).toHaveBeenCalledOnce();
    expect(addComposerPill.mock.calls.at(-1)![0]).toMatchObject({ workspaceId: "moved" });
    listener.upsert({ ...agent, archivedAt: "2026-10-25" });
    expect(registrations[1]!.remove).toHaveBeenCalledOnce();
    listener.upsert(agent);
    listener.remove(agent.id);
    expect(registrations[2]!.remove).toHaveBeenCalledOnce();
    listener.upsert(agent);
    questions.setEnabled(false);
    expect(stop).toHaveBeenCalledOnce();
    expect(registrations[3]!.remove).toHaveBeenCalledOnce();
    questions.setEnabled(true);
    expect(state.observe).toHaveBeenCalledTimes(2);
    expect(addComposerPill).toHaveBeenCalledTimes(4);
    listener.upsert(agent);
    expect(addComposerPill).toHaveBeenCalledTimes(5);
  } finally {
    await questions.dispose();
  }
  expect(registrations[4]!.remove).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalledTimes(2);
  questions.setEnabled(true);
  expect(state.observe).toHaveBeenCalledTimes(2);
});
