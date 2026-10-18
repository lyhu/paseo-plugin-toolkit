import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./parse";

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("a **b** c `d` e *f*")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c " },
      { kind: "code", text: "d" },
      { kind: "text", text: " e " },
      { kind: "italic", text: "f" },
    ]);
  });

  it("leaves an unmatched marker as text rather than eating the rest", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
  });

  it("does not read emphasis inside code", () => {
    expect(parseInline("`a **b**`")).toEqual([{ kind: "code", text: "a **b**" }]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings with their level", () => {
    expect(parseMarkdown("### Title")[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("joins wrapped lines into one paragraph", () => {
    const blocks = parseMarkdown("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
  });

  it("groups consecutive bullets into a single list", () => {
    const blocks = parseMarkdown("- a\n- b\n- c");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "bullet" });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(3);
  });

  it("keeps the starting number of an ordered list", () => {
    expect(parseMarkdown("3. third\n4. fourth")[0]).toMatchObject({ kind: "ordered", start: 3 });
  });

  it("keeps a fenced block verbatim, including its blank lines", () => {
    const blocks = parseMarkdown("```ts\nconst a = 1;\n\nconst b = 2;\n```");
    expect(blocks[0]).toMatchObject({ kind: "code", language: "ts" });
    expect((blocks[0] as { text: string }).text).toContain("\n\n");
  });

  it("does not treat a list inside a code block as a list", () => {
    const blocks = parseMarkdown("```\n- not a bullet\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
  });

  it("reads a rule and a quote", () => {
    expect(parseMarkdown("---")[0]).toMatchObject({ kind: "rule" });
    expect(parseMarkdown("> quoted")[0]).toMatchObject({ kind: "quote" });
  });

  it("reads a table with alignment and inline spans in cells", () => {
    const blocks = parseMarkdown("| Name | Value |\n|:--- | ---:|\n| **a** | `b` |\n| c | d |");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "table",
      align: ["left", "right"],
      header: [[{ kind: "text", text: "Name" }], [{ kind: "text", text: "Value" }]],
    });
    const table = blocks[0] as { rows: { kind: string; text: string }[][][] };
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual([[{ kind: "bold", text: "a" }], [{ kind: "code", text: "b" }]]);
  });

  it("lets a table interrupt a paragraph without a blank line", () => {
    const blocks = parseMarkdown("intro text\nA | B\n--- | ---\n1 | 2");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
    expect(blocks[1]).toMatchObject({ kind: "table" });
  });

  it("hides an escaped pipe from the cell split", () => {
    const blocks = parseMarkdown("| A | B |\n| --- | --- |\n| a \\| b | c |");
    const table = blocks[0] as { rows: { kind: string; text: string }[][][] };
    expect(table.rows[0]).toEqual([
      [{ kind: "text", text: "a | b" }],
      [{ kind: "text", text: "c" }],
    ]);
  });

  it("reads rows without edge pipes and stops at a plain line", () => {
    const blocks = parseMarkdown("A | B\n--- | ---\n1 | 2\nplain tail");
    const table = blocks[0] as { rows: { kind: string; text: string }[][][] };
    expect(blocks[0]).toMatchObject({ kind: "table" });
    expect(table.rows).toHaveLength(1);
    expect(blocks[1]).toMatchObject({ kind: "paragraph" });
  });

  it("leaves pipe lines without a delimiter row as a paragraph", () => {
    const blocks = parseMarkdown("a | b\nc | d");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
  });

  it("returns nothing for empty input", () => {
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});
