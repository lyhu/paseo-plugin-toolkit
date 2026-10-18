import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  connectionSchema,
  type ModelConnection,
  type ModelScope,
  type ModelState,
} from "../../shared/models/contracts";
import { activitySettings } from "../../shared/chat-view/settings";

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
function writeJson(filename: string, value: unknown) {
  mkdirSync(join(filename, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, filename);
    chmodSync(filename, 0o600);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
export function createModelStore(home = paseoHome()) {
  const filename = join(home, "toolkit", "models.json");
  const legacyPath = join(home, "plugin-settings", "chat-view", "display.json");
  function legacyValues() {
    return existsSync(legacyPath)
      ? legacyEnvelope.parse(JSON.parse(readFileSync(legacyPath, "utf8"))).values
      : {};
  }
  // Seed the shared model from the old enhancement endpoint; preserve different summary models as workspace overrides.
  if (!existsSync(filename)) {
    const values = legacyValues();
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
    const overrides = Object.fromEntries(
      Object.entries(configured).filter(
        ([, model]) => JSON.stringify(model) !== JSON.stringify(defaultModel),
      ),
    );
    writeJson(filename, { revision: 0, defaultModel, overrides });
  }
  const displayPath = join(home, "plugin-settings", "toolkit", `${activitySettings.id}.json`);
  if (!existsSync(displayPath))
    writeJson(displayPath, {
      version: activitySettings.version,
      values: activitySettings.schema.parse(legacyValues()),
    });
  function read(): Registry {
    return registrySchema.parse(JSON.parse(readFileSync(filename, "utf8")));
  }
  function resolve(workspaceId?: string): ModelConnection {
    const state = read();
    return (workspaceId && state.overrides[hash(workspaceId)]) || state.defaultModel;
  }
  function target(scope: ModelScope, workspaceId?: string): ModelConnection {
    if (scope === "workspace" && !workspaceId) throw new Error("工作区模型配置需要指定工作区。");
    return scope === "workspace" ? resolve(workspaceId) : read().defaultModel;
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
    const state = read();
    if (state.revision !== revision)
      throw new Error("模型配置已在其他页面更新，请重新加载后保存；当前草稿仍保留。");
    update(state);
    state.revision += 1;
    writeJson(filename, registrySchema.parse(state));
    return publicState(workspaceId);
  }
  return {
    resolve,
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
      const current = target(input.scope, input.workspaceId);
      const model = {
        baseUrl: input.baseUrl.trim(),
        model: input.model.trim(),
        apiKey: input.clearKey ? "" : input.apiKey.trim() || current.apiKey,
      };
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
