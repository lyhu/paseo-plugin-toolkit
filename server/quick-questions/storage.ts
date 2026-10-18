import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createRevisionedJsonStore } from "../storage/revisioned-json";
import { LocalizedError } from "../../shared/chat-view/i18n";
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
});
export type Document = z.infer<typeof documentSchema>;
export type WorkspaceDocument = Omit<Workspace, "featureEnabled" | "model">;

function validateQuestions(document: Document) {
  const seen = new Set<string>();
  for (const question of document.questions) {
    const key = questionKey(question.text);
    if (seen.has(key)) throw new LocalizedError("quickQuestions.error.duplicateQuestions");
    seen.add(key);
  }
  if (new Set(document.questions.map((q) => q.id)).size !== document.questions.length)
    throw new LocalizedError("quickQuestions.error.duplicateIds");
}

export function createStorage(
  root = join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "toolkit", "quick-questions"),
) {
  function path(workspaceId: string) {
    return join(root, `${createHash("sha256").update(workspaceId).digest("hex")}.json`);
  }
  function store(workspaceId: string) {
    return createRevisionedJsonStore({
      filename: path(workspaceId),
      schema: documentSchema,
      create: () => documentSchema.parse({}),
      concurrencyError: new LocalizedError("quickQuestions.error.stale").message,
      readError: new LocalizedError("quickQuestions.error.read").message,
    });
  }
  function read(workspaceId: string): Document {
    return store(workspaceId).read();
  }
  function save(
    workspaceId: string,
    revision: number,
    update: (current: Document) => Document,
  ): WorkspaceDocument {
    const next = store(workspaceId).update(revision, (current) => {
      const document = update(current);
      validateQuestions(document);
      return document;
    });
    return publicWorkspace(next);
  }
  return { read, save };
}
/** Projects the document without the feature flag or credentials, which have other owners. */
export function publicWorkspace(document: Document): WorkspaceDocument {
  return {
    revision: document.revision,
    historyLimit: document.historyLimit,
    summaryPrompt: document.summaryPrompt,
    enabled: document.enabled,
    questions: document.questions,
  };
}
