import { describe, expect, it } from "vitest";
import {
  MAX_FORMAT_CHARS,
  extractCodeInput,
  formatJson,
  formatReasoningText,
  formatUnknownValue,
  prettyJson,
  previewText,
} from "./text";

describe("text budget and JSON formatting", () => {
  it("keeps reasoning formatting outside code spans", () => {
    expect(formatReasoningText("**Plan****Result**\n\n`**inline**`")).toBe(
      "**Plan**\n\n**Result**\n\n`**inline**`",
    );
  });

  it("lexically formats JSON without losing precision or key order", () => {
    const raw = '{"id":9007199254740993,"b":1,"a":2}';
    const formatted = prettyJson(raw);
    expect(formatted).toBe('{\n  "id": 9007199254740993,\n  "b": 1,\n  "a": 2\n}');
    expect(formatted).toContain("9007199254740993");

    // formatUnknownValue uses prettyJson
    expect(formatUnknownValue(raw)).toBe(formatted);
    expect(formatUnknownValue({ num: 123 })).toContain("123");

    // Rejects invalid JSON cleanly
    expect(prettyJson("not json")).toBeNull();

    // Bails out on oversized input
    const oversized = '{"key": "' + "x".repeat(MAX_FORMAT_CHARS) + '"}';
    expect(formatJson(oversized).limited).toBe(true);
  });

  it("extracts literal JavaScript code from code tool inputs", () => {
    expect(extractCodeInput("exec", { code: "console.log('hi');" })).toEqual({
      code: "console.log('hi');",
      language: "javascript",
    });
    expect(
      extractCodeInput("mcp__plugin__mcpscript", JSON.stringify({ code: "const x = 1;" })),
    ).toEqual({
      code: "const x = 1;",
      language: "javascript",
    });
    expect(extractCodeInput("evaluate_browser", { expression: "window.location.href" })).toEqual({
      code: "window.location.href",
      language: "javascript",
    });
    expect(extractCodeInput("read_file", { path: "foo.ts" })).toBeUndefined();
  });

  it("enforces strict 20-line and 4,000-character preview budget with surrogate safety", () => {
    // Under limit
    expect(previewText("line 1\nline 2")).toEqual({
      text: "line 1\nline 2",
      truncated: false,
      totalLines: 2,
      totalChars: 13,
    });

    // Over line limit
    const thirtyLines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    const linePreview = previewText(thirtyLines);
    expect(linePreview.truncated).toBe(true);
    expect(linePreview.text.split("\n").length).toBe(20);
    expect(linePreview.totalLines).toBe(30);

    // Over character limit
    const longSingleLine = "x".repeat(5000);
    const charPreview = previewText(longSingleLine);
    expect(charPreview.truncated).toBe(true);
    expect(charPreview.text.length).toBeLessThanOrEqual(4000);

    // Surrogate pair safety
    const textWithEmoji = "a".repeat(3999) + "🐱" + "b";
    const emojiPreview = previewText(textWithEmoji);
    expect(emojiPreview.truncated).toBe(true);
    const lastChar = emojiPreview.text.charCodeAt(emojiPreview.text.length - 1);
    // Must not end on a high surrogate
    expect(lastChar >= 0xd800 && lastChar <= 0xdbff).toBe(false);
  });
});
