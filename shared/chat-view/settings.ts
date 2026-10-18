import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const paletteModeSchema = z.enum(["vivid", "soft", "high_contrast"]);
export type PaletteMode = z.output<typeof paletteModeSchema>;

export const displayModeSchema = z.preprocess(
  (value) => (value === "codex" ? "folded" : value),
  z.enum(["folded", "detailed"]),
);
export type DisplayMode = z.output<typeof displayModeSchema>;

export const languageModeSchema = z.enum(["auto", "zh-CN", "en-US"]);
export type LanguageMode = z.output<typeof languageModeSchema>;

export const activitySettings = defineSettings({
  id: "chat-view-display",
  scope: "host",
  version: 5,
  schema: z.object({
    quickQuestionsEnabled: z.boolean().default(true),
    mermaidEnabled: z.boolean().default(true),
    compactActivityEnabled: z.boolean().default(true),
    stickyEnabled: z.boolean().default(true),
    readonlyMessagesEnabled: z.boolean().default(true),
    // Off until a model endpoint is configured: an unconfigured button must not look actionable.
    enhanceEnabled: z.boolean().default(false),
    palette: paletteModeSchema.default("vivid"),
    displayMode: displayModeSchema.default("folded"),
    language: languageModeSchema.default("zh-CN"),
  }),
  // v1 stored none of the enhance fields, v2 none of readonly; defaults fill them in on next parse.
  migrate: (values) => values,
});

export const DEFAULT_PALETTE_MODE: PaletteMode = "vivid";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "folded";

export type ChatViewSettings = z.output<typeof activitySettings.schema>;
