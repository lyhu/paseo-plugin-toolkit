import { describe, expect, it } from "vitest";
import { fileIconForPath, languageForFilePath } from "./file-kind";

describe("file kind by path", () => {
  it("maps file extensions to icons and highlight languages", () => {
    expect(fileIconForPath("src/web/main.tsx")).toBe("FileCode2");
    expect(fileIconForPath("package.json")).toBe("FileJson");
    expect(fileIconForPath("README.md")).toBe("FileText");
    expect(fileIconForPath(".env")).toBe("FileKey2");
    expect(languageForFilePath("src/web/main.tsx")).toBe("typescript");
    expect(languageForFilePath("styles.css")).toBe("css");
  });
});
