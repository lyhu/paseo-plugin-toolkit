import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activitySettings } from "../../shared/chat-view/settings";
import { createFeatureController } from "./features";
import { registerMermaid } from "./mermaid/registration";
import { cleanupStickyMessages } from "./sticky/StickyBar";

vi.mock("./activity/Activity", () => ({
  ColorfulReasoning: () => null,
  ColorfulToolCall: () => null,
}));
vi.mock("./activity/history", () => ({ cleanupActivityHistory: vi.fn() }));
vi.mock("./enhance/controller", () => ({
  requireComposerText: () => "",
  runEnhance: vi.fn(),
  undoEnhance: () => false,
}));
vi.mock("./enhance/pill", () => ({ EnhanceIcon: () => null }));
vi.mock("./sticky/StickyBar", () => ({ cleanupStickyMessages: vi.fn() }));
vi.mock("./sticky/pill", () => ({
  StickyIcon: () => null,
  toggleSticky: vi.fn(),
  createStickyPill: (client: { addComposerPill(contribution: unknown): unknown }, agent: unknown) =>
    client.addComposerPill({ agent }),
}));
vi.mock("./activity/dom", () => ({
  setupCompactActivityStyles: () => vi.fn(),
}));
vi.mock("./mermaid/registration", () => ({ registerMermaid: vi.fn(() => vi.fn()) }));
vi.mock("./readonly/dom", () => ({ setupReadonlyStyles: () => vi.fn() }));
const defaults = activitySettings.schema.parse({});
const enabled = { ...defaults, mermaidEnabled: true, compactActivityEnabled: true };
const disabled = {
  ...defaults,
  mermaidEnabled: false,
  compactActivityEnabled: false,
  stickyEnabled: false,
  readonlyMessagesEnabled: false,
};
let controller: ReturnType<typeof createFeatureController> | undefined;
const ready = (values = defaults) => ({ status: "ready", revision: "1", values });
function setup(rpc = vi.fn(async () => ready())) {
  const remove = vi.fn();
  const pillRemove = vi.fn();
  const client = {
    rpc,
    addTimelineTransformer: vi.fn(() => remove),
    addTimelineRenderer: vi.fn(() => remove),
    addSlashCommand: vi.fn(() => vi.fn()),
    addComposerPill: vi.fn(() => ({ remove: pillRemove, update: vi.fn() })),
  };
  controller = createFeatureController(client as never, vi.fn());
  return { client, controller, remove, pillRemove };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  controller?.cleanup();
  controller = undefined;
  vi.useRealTimers();
});

it("preserves existing palette and display mode while defaulting opt-in features off", () => {
  expect(activitySettings.schema.parse({ palette: "soft", displayMode: "detailed" })).toEqual({
    ...defaults,
    palette: "soft",
    displayMode: "detailed",
  });
  expect(defaults).toMatchObject({
    displayMode: "folded",
    mermaidEnabled: false,
    compactActivityEnabled: false,
    stickyEnabled: true,
    readonlyMessagesEnabled: true,
  });
});
it("migrates the former Codex preference to the upstream Folded mode", () => {
  expect(activitySettings.schema.parse({ displayMode: "codex", palette: "soft" })).toMatchObject({
    displayMode: "folded",
    palette: "soft",
  });
});
it("honors persisted disabled switches before registering any transformers", async () => {
  const { client } = setup(vi.fn(async () => ready(disabled)));
  await Promise.resolve();
  expect(registerMermaid).not.toHaveBeenCalled();
  expect(client.addTimelineTransformer).not.toHaveBeenCalled();
  expect(cleanupStickyMessages).toHaveBeenCalled();
});
it("removes contributions when disabled and does not duplicate unchanged registrations", async () => {
  const { client, controller: controls, remove } = setup();
  await Promise.resolve();
  controls.apply(enabled);
  controls.apply(enabled);
  expect(registerMermaid).toHaveBeenCalledOnce();
  expect(client.addTimelineTransformer).toHaveBeenCalledTimes(2);
  controls.apply(disabled);
  expect(remove).toHaveBeenCalledTimes(4);
  controls.apply(enabled);
  expect(registerMermaid).toHaveBeenCalledTimes(2);
  expect(client.addTimelineTransformer).toHaveBeenCalledTimes(4);
});
it("does not let an old initial read overwrite a newer change from the settings page", async () => {
  let resolve!: (value: ReturnType<typeof ready>) => void;
  const { controller: controls, client } = setup(
    vi.fn(
      () =>
        new Promise<ReturnType<typeof ready>>((done) => {
          resolve = done;
        }),
    ),
  );
  controls.apply(disabled);
  resolve(ready(enabled));
  await Promise.resolve();
  expect(registerMermaid).not.toHaveBeenCalled();
  expect(client.addTimelineTransformer).not.toHaveBeenCalled();
});
it("refreshes changes from another client and stops refreshing after cleanup", async () => {
  const rpc = vi
    .fn(async () => ready())
    .mockResolvedValueOnce(ready(enabled))
    .mockResolvedValueOnce(ready(disabled));
  const { controller: controls, remove } = setup(rpc);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(2000);
  expect(remove).toHaveBeenCalledTimes(4);
  controls.cleanup();
  controller = undefined;
  await vi.advanceTimersByTimeAsync(4000);
  expect(rpc).toHaveBeenCalledTimes(2);
});
it("fans agent updates out to the domains that carry composer pills", async () => {
  const { client, controller: controls, pillRemove } = setup();
  await Promise.resolve();
  const agent = { id: "live", workspaceId: "workspace", archivedAt: null };
  controls.registerAgent(agent as never);
  // Only sticky is on by default; enhance owns its own switch and adds nothing while it is off.
  expect(client.addComposerPill).toHaveBeenCalledOnce();
  controls.registerAgent(agent as never);
  expect(client.addComposerPill).toHaveBeenCalledOnce();
  controls.registerAgent({ ...agent, id: "archived", archivedAt: "2026-10-06" } as never);
  expect(client.addComposerPill).toHaveBeenCalledOnce();
  controls.unregisterAgent("live");
  expect(pillRemove).toHaveBeenCalledOnce();
  controls.cleanup();
  expect(controls.registerAgent(agent as never)).toBeUndefined();
  expect(client.addComposerPill).toHaveBeenCalledOnce();
});
