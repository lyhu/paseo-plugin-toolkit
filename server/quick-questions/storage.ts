import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DEFAULT_HISTORY_LIMIT,
  historyLimitSchema,
  summaryPromptSchema,
  questionKey,
  questionSchema,
  type Workspace,
} from "../../shared/quick-questions/contracts";

import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";

const documentSchema = z.object({
  summaryPrompt: summaryPromptSchema.default(DEFAULT_SUMMARY_PROMPT),
  historyLimit: historyLimitSchema.default(DEFAULT_HISTORY_LIMIT),
  revision: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
  questions: z.array(questionSchema).default([]),
  model: z
    .object({
      baseUrl: z.string().default(""),
      model: z.string().default(""),
      apiKey: z.string().default(""),
    })
    .default({ baseUrl: "", model: "", apiKey: "" }),
});
export type Document = z.infer<typeof documentSchema>;

export function createStorage(
  root = join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "toolkit", "quick-questions"),
) {
  function path(workspaceId: string) {
    return join(root, `${createHash("sha256").update(workspaceId).digest("hex")}.json`);
  }
  function read(workspaceId: string): Document {
    const filename = path(workspaceId);
    if (!existsSync(filename)) return documentSchema.parse({});
    try {
      return documentSchema.parse(JSON.parse(readFileSync(filename, "utf8")));
    } catch {
      throw new Error("快捷提问数据无法读取，请检查主机上的 toolkit 数据文件。");
    }
  }
  function save(
    workspaceId: string,
    revision: number,
    update: (current: Document) => Document,
  ): Workspace {
    const current = read(workspaceId);
    if (revision !== current.revision)
      throw new Error("其他设备已更新此工作空间。请重新加载后再保存；当前编辑内容仍保留。");
    const next = documentSchema.parse(update(current));
    next.revision = current.revision + 1;
    const seen = new Set<string>();
    for (const question of next.questions) {
      const key = questionKey(question.text);
      if (seen.has(key)) throw new Error("存在重复话术，请合并后保存。");
      seen.add(key);
    }
    if (new Set(next.questions.map((q) => q.id)).size !== next.questions.length)
      throw new Error("问题标识重复，请重新加载。");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = `${path(workspaceId)}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      renameSync(temporary, path(workspaceId));
      chmodSync(path(workspaceId), 0o600);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return publicWorkspace(next);
  }
  return { read, save };
}
export function publicWorkspace(document: Document): Workspace {
  return {
    featureEnabled: true,
    revision: document.revision,
    historyLimit: document.historyLimit,
    summaryPrompt: document.summaryPrompt,
    enabled: document.enabled,
    questions: document.questions,
    model: {
      baseUrl: document.model.baseUrl,
      model: document.model.model,
      hasKey: Boolean(document.model.apiKey),
    },
  };
}
