import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createRevisionedJsonStore, writePrivateJsonFile } from "../storage/revisioned-json";
import {
  connectionSchema,
  type ModelConnection,
  type ModelScope,
  type ModelState,
} from "../../shared/models/contracts";
import { activitySettings } from "../../shared/chat-view/settings";
import { LocalizedError } from "../../shared/chat-view/i18n";

export function paseoHome() {
  return process.env.PASEO_HOME || join(homedir(), ".paseo");
}
const emptyModel: ModelConnection = { baseUrl: "", model: "", apiKey: "" };
const registrySchema = z.object({
  revision: z.number().int().nonnegative(),
  defaultModel: connectionSchema,
  overrides: z.record(z.string(), connectionSchema),
});
type Registry = z.infer<typeof registrySchema>;
const legacyEnvelope = z.object({ version: z.number(), values: z.record(z.string(), z.unknown()) });
function hash(workspaceId: string) {
  return createHash("sha256").update(workspaceId).digest("hex");
}
function publicModel(model: ModelConnection) {
  return { baseUrl: model.baseUrl, model: model.model, hasKey: Boolean(model.apiKey) };
}
function legacyDisplayValues(home: string) {
  const path = join(home, "plugin-settings", "chat-view", "display.json");
  return existsSync(path)
    ? legacyEnvelope.parse(JSON.parse(readFileSync(path, "utf8"))).values
    : {};
}
/**
 * Reads credentials that older versions stored in display settings and question documents, then
 * writes one host registry. Migration is a one-time, explicit step; the store never reads those
 * legacy files again.
 */
export function migrateLegacyModelSettings(home = paseoHome()) {
  const filename = join(home, "toolkit", "models.json");
  if (existsSync(filename)) return;
  const values = legacyDisplayValues(home);
  const oldEnhance = connectionSchema.safeParse({
    baseUrl: values.enhanceBaseUrl,
    model: values.enhanceModel,
    apiKey: values.enhanceApiKey,
  });
  const configured: Record<string, ModelConnection> = {};
  const directory = join(home, "toolkit", "quick-questions");
  if (existsSync(directory))
    for (const name of readdirSync(directory)
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .sort()) {
      const raw = z
        .object({ model: connectionSchema.optional() })
        .parse(JSON.parse(readFileSync(join(directory, name), "utf8")));
      if (raw.model?.baseUrl && raw.model.model) configured[name.slice(0, -5)] = raw.model;
    }
  const defaultModel =
    oldEnhance.success && oldEnhance.data.baseUrl && oldEnhance.data.model
      ? oldEnhance.data
      : (Object.values(configured)[0] ?? emptyModel);
  if (!defaultModel.baseUrl && !defaultModel.model) return;
  const overrides = Object.fromEntries(
    Object.entries(configured).filter(
      ([, model]) => JSON.stringify(model) !== JSON.stringify(defaultModel),
    ),
  );
  writePrivateJsonFile(filename, { revision: 0, defaultModel, overrides } satisfies Registry);
}

export function createModelStore(home = paseoHome()) {
  migrateLegacyModelSettings(home);
  const filename = join(home, "toolkit", "models.json");
  const store = createRevisionedJsonStore({
    filename,
    schema: registrySchema,
    create: () => ({ revision: 0, defaultModel: emptyModel, overrides: {} }),
    concurrencyError: new LocalizedError("models.error.stale").message,
  });
  const displayPath = join(home, "plugin-settings", "toolkit", `${activitySettings.id}.json`);
  if (!existsSync(displayPath))
    writePrivateJsonFile(displayPath, {
      version: activitySettings.version,
      values: activitySettings.schema.parse(legacyDisplayValues(home)),
    });
  function read(): Registry {
    return store.read();
  }
  function resolve(workspaceId?: string): ModelConnection {
    const state = read();
    return (workspaceId && state.overrides[hash(workspaceId)]) || state.defaultModel;
  }
  function target(scope: ModelScope, workspaceId?: string): ModelConnection {
    if (scope === "workspace" && !workspaceId)
      throw new LocalizedError("models.error.workspaceRequired");
    return scope === "workspace" ? resolve(workspaceId) : read().defaultModel;
  }
  /** Merges an unsaved draft with the stored credential it inherits, if the draft omits one. */
  function resolveDraft(input: {
    scope: ModelScope;
    workspaceId?: string;
    baseUrl: string;
    apiKey: string;
    clearKey: boolean;
    model?: string;
  }): ModelConnection {
    const stored = target(input.scope, input.workspaceId);
    return {
      baseUrl: input.baseUrl.trim(),
      model: input.model?.trim() ?? "",
      apiKey: input.clearKey ? "" : input.apiKey.trim() || stored.apiKey,
    };
  }
  function publicState(workspaceId?: string): ModelState {
    const state = read();
    const override = workspaceId ? state.overrides[hash(workspaceId)] : undefined;
    return {
      revision: state.revision,
      defaultModel: publicModel(state.defaultModel),
      overrideModel: override ? publicModel(override) : null,
      effectiveModel: publicModel(override ?? state.defaultModel),
      source: override ? "workspace" : "host",
    };
  }
  function change(revision: number, update: (state: Registry) => void, workspaceId?: string) {
    store.update(revision, (state) => {
      update(state);
      return state;
    });
    return publicState(workspaceId);
  }
  return {
    resolve,
    resolveDraft,
    target,
    read: publicState,
    save(input: {
      revision: number;
      scope: ModelScope;
      workspaceId?: string;
      baseUrl: string;
      model: string;
      apiKey: string;
      clearKey: boolean;
    }) {
      const model = resolveDraft(input);
      return change(
        input.revision,
        (state) => {
          if (input.scope === "host") state.defaultModel = model;
          else state.overrides[hash(input.workspaceId!)] = model;
        },
        input.workspaceId,
      );
    },
    inherit(workspaceId: string, revision: number) {
      return change(
        revision,
        (state) => {
          delete state.overrides[hash(workspaceId)];
        },
        workspaceId,
      );
    },
  };
}
export type ModelStore = ReturnType<typeof createModelStore>;
