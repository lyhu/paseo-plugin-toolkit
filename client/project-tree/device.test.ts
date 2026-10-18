import { expect, it, vi } from "vitest";
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  TurboModuleRegistry: {
    get: () => ({
      multiGet: (
        keys: string[],
        callback: (errors: null, result: Array<[string, string | null]>) => void,
      ) =>
        callback(
          null,
          keys.map((key) => [key, storage.get(key) ?? null]),
        ),
      multiSet: (entries: Array<[string, string]>, callback: (errors: null) => void) => {
        for (const [key, value] of entries) storage.set(key, value);
        callback(null);
      },
    }),
  },
}));
it("restores native preferences after a plugin remount and isolates configuration hosts", async () => {
  let device = await import("./device");
  await device.loadDevicePreferences(["pro.cache", "mini.cache"]);
  device.writeDevicePreference("pro.cache", "cached projects");
  vi.resetModules();
  device = await import("./device");
  await device.loadDevicePreferences(["pro.cache", "mini.cache"]);
  expect(device.readDevicePreference("pro.cache")).toBe("cached projects");
  expect(device.readDevicePreference("mini.cache")).toBeNull();
});
