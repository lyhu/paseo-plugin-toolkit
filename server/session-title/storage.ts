import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { jobSchema, resultSchema } from "../../shared/session-title/contracts";
import { createRevisionedJsonStore } from "../storage/revisioned-json";
import { paseoHome } from "../models/storage";

const stateSchema = z.object({
  revision: z.number().int(),
  agentId: z.string().nullable().default(null),
  workspaceId: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),
  jobs: z.array(jobSchema).default([]),
  archiveRequest: z
    .object({
      jobId: z.string(),
      title: z.string().nullable(),
      lastUserMessageAt: z.string().nullable(),
      archivedAt: z.string().nullable(),
    })
    .nullable()
    .default(null),
  observedCreation: z.boolean(),
  rounds: z.number().int(),
  epoch: z.string().nullable(),
  lastRequest: z.string().nullable(),
  title: z.string().nullable(),
  protected: z.boolean(),
  result: resultSchema.nullable(),
  error: z.string().nullable(),
});
export type TitleState = z.infer<typeof stateSchema>;
export function createTitleStore(home = paseoHome()) {
  const directory = join(home, "toolkit", "session-title");
  const store = (id: string) =>
    createRevisionedJsonStore({
      filename: join(
        home,
        "toolkit",
        "session-title",
        `${createHash("sha256").update(id).digest("hex")}.json`,
      ),
      schema: stateSchema,
      create: () => ({
        revision: 0,
        agentId: null,
        workspaceId: null,
        archivedAt: null,
        jobs: [],
        archiveRequest: null,
        observedCreation: false,
        rounds: 0,
        epoch: null,
        lastRequest: null,
        title: null,
        protected: false,
        result: null,
        error: null,
      }),
      concurrencyError: "会话总结已变化，请刷新后重试。",
    });
  return {
    list() {
      if (!existsSync(directory)) return [];
      return readdirSync(directory)
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .map((name) => stateSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8"))));
    },
    read: (id: string) => store(id).read(),
    update(id: string, change: (state: TitleState) => TitleState) {
      const document = store(id);
      return document.update(document.read().revision, change);
    },
  };
}
export type TitleStore = ReturnType<typeof createTitleStore>;
