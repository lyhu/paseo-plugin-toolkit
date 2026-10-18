import { describe, expect, it } from "vitest";
import {
  MAX_DIFF_CHARS,
  diffLinesForDetail,
  diffStatsFromStrings,
  diffStatsFromUnifiedDiff,
} from "./diff";
import { resolveToolCallPresentation } from "./tool-presentation";

describe("line diff", () => {
  it("counts unified diff additions and deletions without file headers", () => {
    expect(
      diffStatsFromUnifiedDiff("--- a/main.ts\n+++ b/main.ts\n@@ -1 +1 @@\n-old\n+new\n"),
    ).toEqual({ additions: 1, deletions: 1 });
  });

  it("counts changes when an edit only has old and new strings", () => {
    expect(diffStatsFromStrings("one\ntwo\n", "one\nthree\n")).toEqual({
      additions: 1,
      deletions: 1,
    });
    expect(diffStatsFromStrings("one\ntwo", "one\ntwo\n")).toEqual({
      additions: 1,
      deletions: 1,
    });
  });

  it("creates colored diff rows from old and new strings", () => {
    expect(
      diffLinesForDetail({
        type: "edit",
        filePath: "main.ts",
        oldString: "const oldValue = 1;\n",
        newString: "const newValue = 2;\n",
      }),
    ).toEqual([
      { kind: "remove", text: "const oldValue = 1;" },
      { kind: "add", text: "const newValue = 2;" },
    ]);
  });

  it("protects against oversized diff calculations", () => {
    const largeOld = "a\n".repeat(60_000);
    const largeNew = "b\n".repeat(60_000);
    expect(largeOld.length + largeNew.length).toBeGreaterThan(MAX_DIFF_CHARS);

    // Fast fallback without hanging LCS
    const stats = diffStatsFromStrings(largeOld, largeNew);
    expect(stats.additions).toBe(60_000);
    expect(stats.deletions).toBe(60_000);

    const diffLines = diffLinesForDetail({
      type: "edit",
      filePath: "large.txt",
      oldString: largeOld,
      newString: largeNew,
    });
    expect(diffLines.length).toBe(2);
    expect(diffLines[0]?.kind).toBe("remove");
    expect(diffLines[1]?.kind).toBe("add");

    // Timeline presentation skips diffStats when edit is oversized
    const pres = resolveToolCallPresentation({
      name: "edit",
      detail: {
        type: "edit",
        filePath: "large.txt",
        oldString: largeOld,
        newString: largeNew,
      },
    });
    expect(pres.diffStats).toBeUndefined();
  });
});
