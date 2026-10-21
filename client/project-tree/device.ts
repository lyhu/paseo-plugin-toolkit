import { Platform, TurboModuleRegistry, type TurboModule } from "react-native";
import { readDevicePreference as readWeb, writeDevicePreference as writeWeb } from "../web";

interface NativeStorage extends TurboModule {
  multiGet(
    keys: string[],
    callback: (errors?: unknown[] | null, result?: Array<[string, string | null]>) => void,
  ): void;
  multiSet(values: Array<[string, string]>, callback: (errors?: unknown[] | null) => void): void;
}
const values = new Map<string, string>();
// Paseo 0.12 links AsyncStorage 2.2. Use its native bridge through the host-owned RN runtime;
// the neutral plugin bundle must not resolve AsyncStorage's browser entry on a phone.
function nativeStorage() {
  return (
    TurboModuleRegistry.get<NativeStorage>("RNC_AsyncSQLiteDBStorage") ??
    TurboModuleRegistry.get<NativeStorage>("RNCAsyncStorage")
  );
}
const storageKey = (key: string) => `toolkit.project-tree.${key}`;
export function readDevicePreference(key: string) {
  return Platform.OS === "web" ? readWeb(key) : (values.get(key) ?? null);
}
export async function loadDevicePreferences(keys: string[]) {
  if (Platform.OS === "web") return;
  const storage = nativeStorage();
  if (!storage)
    throw new Error(
      "Device storage is unavailable. Update Paseo before enabling the project tree.",
    );
  await new Promise<void>((resolve, reject) =>
    storage.multiGet(keys.map(storageKey), (errors, result) => {
      if (errors?.length) {
        reject(new Error("Could not load project tree device preferences."));
        return;
      }
      for (const [key, value] of result ?? [])
        if (value !== null) values.set(key.slice("toolkit.project-tree.".length), value);
      resolve();
    }),
  );
}
export function writeDevicePreference(key: string, value: string) {
  if (Platform.OS === "web") {
    writeWeb(key, value);
    return;
  }
  values.set(key, value);
  nativeStorage()?.multiSet([[storageKey(key), value]], (errors) => {
    if (errors?.length) console.warn("[Toolkit project tree] Could not save device preferences.");
  });
}
