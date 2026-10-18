import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localeSchema, messages, resolveLocale, t } from "./i18n";

type Key = keyof (typeof messages)["zh-CN"];

const sourceDirs = ["client", "shared", "server"];
const sourceFiles = ["index.client.tsx", "index.server.ts"];

/** Every module that may ask for a word, so a key nothing refers to shows up as dead. */
function sourceText(): string {
  const read = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return read(path);
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) return [];
      return [readFileSync(path, "utf8")];
    });
  return [
    ...sourceDirs.flatMap(read),
    ...sourceFiles.map((path) => readFileSync(path, "utf8")),
  ].join("\n");
}

describe("shared/i18n", () => {
  it("resolves explicitly configured locales", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-CN");
    expect(resolveLocale("en-US")).toBe("en-US");
  });

  it("defaults to zh-CN when preference is omitted or unsupported", () => {
    expect(resolveLocale(undefined)).toBe("zh-CN");
  });

  it("translates key correctly for supported locales", () => {
    expect(t("zh-CN", "settings.title")).toBe("功能设置");
    expect(t("en-US", "settings.title")).toBe("Settings");
    expect(t("zh-CN", "settings.testConnection")).toBe("测试连接");
    expect(t("en-US", "settings.testConnection")).toBe("Test Connection");
  });

  it("fills in the placeholders a key declares", () => {
    expect(t("zh-CN", "enhance.skip.tooLong", { limit: 200 })).toBe("原文已超过 200 字，保持原样");
    expect(t("en-US", "enhance.skip.tooLong", { limit: 200 })).toBe(
      "The prompt is already longer than 200 characters — kept as written",
    );
    // An unfilled placeholder stays visible rather than printing "undefined".
    expect(t("zh-CN", "enhance.skip.tooLong")).toContain("{limit}");
  });

  it("has parity between zh-CN and en-US keys", () => {
    const zhKeys = Object.keys(messages["zh-CN"]).sort();
    const enKeys = Object.keys(messages["en-US"]).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("declares the same placeholders in both languages", () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(messages["zh-CN"]) as Key[]) {
      // A translation that drops a placeholder would silently lose part of the sentence.
      expect(placeholders(messages["en-US"][key]), key).toEqual(
        placeholders(messages["zh-CN"][key]),
      );
    }
  });

  it("keeps no key that nothing asks for", () => {
    const text = sourceText();
    const dead = (Object.keys(messages["zh-CN"]) as Key[]).filter(
      (key) => !text.includes(`"${key}"`),
    );
    expect(dead).toEqual([]);
  });

  it("accepts only the locales it can render", () => {
    expect(localeSchema.safeParse("zh-CN").success).toBe(true);
    expect(localeSchema.safeParse("en-US").success).toBe(true);
    expect(localeSchema.safeParse("fr-FR").success).toBe(false);
  });
});
