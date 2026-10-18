import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { localeSchema } from "../i18n";

export const PROJECT_KINDS = [
  "frontend",
  "backend",
  "cli",
  "library",
  "monorepo",
  "docs",
  "unknown",
] as const;
export const projectKindSchema = z.enum(PROJECT_KINDS);
export type ProjectKind = z.output<typeof projectKindSchema>;

/**
 * Facts read from disk. The probe never records a conclusion it could not read: a missing
 * manifest means "unknown", not a guess. The model draws conclusions; this carries evidence.
 */
export const environmentProfileSchema = z.object({
  root: z.string(),
  projectKind: projectKindSchema,
  languages: z.array(z.string()),
  packageManagers: z.array(z.string()),
  frameworks: z.array(z.string()),
  commands: z.object({
    build: z.string().optional(),
    test: z.string().optional(),
    lint: z.string().optional(),
    typecheck: z.string().optional(),
  }),
  conventions: z.array(z.string()),
  constraints: z.array(z.string()),
  hotspots: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
    }),
  ),
  references: z.array(
    z.object({
      path: z.string(),
      excerpt: z.string(),
    }),
  ),
});
export type EnvironmentProfile = z.output<typeof environmentProfileSchema>;

export const MAX_RAW_CHARS = 20_000;
/**
 * A hard ceiling on the enhanced body, deliberately not a multiple of the input. Scaling the cap by
 * input length was what made short prompts come back as stubs — a four-character request was held to
 * twelve characters — and a floor would fight this ceiling, so the body is simply held to one size.
 * Four dimensions fit in 200 characters if the model is told to spend them on substance.
 */
export const MAX_ENHANCED_CHARS = 200;

export const enhanceRequestSchema = z.object({
  raw: z.string().min(1).max(MAX_RAW_CHARS),
  agentId: z.string().min(1),
  workspaceId: z.string().min(1),
  /** The caller's UI language; plugin-authored text in the result comes back in it. */
  locale: localeSchema.optional(),
});
export type EnhanceRequest = z.output<typeof enhanceRequestSchema>;

export const enhanceResultSchema = z.object({
  enhanced: z.string(),
  deltaSummary: z.string(),
  openQuestions: z.array(z.string()),
  applied: z.boolean(),
  degraded: z.boolean(),
  degradedReason: z.string(),
  /** The body was shortened to `MAX_ENHANCED_CHARS`, so `deltaSummary` says less than it wanted to. */
  truncated: z.boolean(),
});
export type EnhanceResult = z.output<typeof enhanceResultSchema>;

export const enhancePromptRpc = defineRpc({
  name: "chat-view.enhance.prompt",
  input: enhanceRequestSchema,
  output: enhanceResultSchema,
});
