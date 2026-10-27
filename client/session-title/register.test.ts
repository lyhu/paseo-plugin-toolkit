import { expect, it, vi } from "vitest";
import type {
  PluginClientContext,
  PluginClientSlashCommandContribution,
} from "@getpaseo/plugin/client";
vi.mock("./panel", () => ({ SessionTitlePanel: () => null }));
vi.mock("./settings", () => ({ SessionTitleSettings: () => null }));
vi.mock("./pills", () => ({
  registerTitlePills: () => ({ refresh: vi.fn(), dispose: vi.fn() }),
}));
vi.mock("../i18n", () => ({ tr: (text: string) => text }));
vi.mock("../chat-view/locale", () => ({ subscribeLocale: () => () => {} }));
import { registerSessionTitle } from "./register";
import { startTitle } from "../../shared/session-title/contracts";

it("runs naming silently and registers one workspace session list", async () => {
  const remove = vi.fn();
  let command!: Extract<PluginClientSlashCommandContribution, { context: "agent" }>;
  const addWorkspacePanel = vi.fn(() => remove),
    addCommandCenterItem = vi.fn(() => remove);
  const dispose = registerSessionTitle({
    rpc: vi.fn().mockResolvedValue({ resumed: 0 }),
    addWorkspacePanel,
    addCommandCenterItem,
    addSlashCommand: (value: typeof command) => {
      command = value;
      return remove;
    },
  } as unknown as PluginClientContext);
  expect(command.name).toBe("session-title");
  expect(addWorkspacePanel).toHaveBeenCalledWith(
    expect.objectContaining({ context: "workspace", title: "会话列表", locations: ["explorer"] }),
  );
  expect(addCommandCenterItem).toHaveBeenCalledWith(
    expect.objectContaining({ title: "会话列表", context: "workspace" }),
  );
  const rpc = vi.fn(),
    openPanel = vi.fn();
  const context = { args: "", agent: { id: "a" }, rpc, openPanel } as never;
  await command.onSubmit(context);
  expect(openPanel).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith(startTitle, { agentId: "a" });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockRejectedValueOnce(new Error("transport unavailable"));
  await expect(command.onSubmit(context)).resolves.toBeUndefined();
  expect(openPanel).not.toHaveBeenCalled();
  error.mockRestore();
  await expect(
    command.onSubmit({ ...(context as object), args: "unexpected" } as never),
  ).rejects.toThrow("无需参数");
  await dispose();
  expect(remove).toHaveBeenCalledTimes(3);
});
