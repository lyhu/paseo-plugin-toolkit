import { expect, it, vi } from "vitest";
import { resolveEditTarget } from "./draft-composer";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

it("edits inside the host composer on web", () => {
  const write = vi.fn(() => true);

  expect(resolveEditTarget({ platform: "web", write })).toBe("composer");
  expect(write).toHaveBeenCalledTimes(1);
});

it("opens the popover editor when the web composer cannot be resolved", () => {
  expect(resolveEditTarget({ platform: "web", write: () => false })).toBe("editor");
});

it("never touches composer DOM on native clients", () => {
  for (const platform of ["ios", "android"] as const) {
    const write = vi.fn(() => true);
    expect(resolveEditTarget({ platform, write })).toBe("editor");
    expect(write).not.toHaveBeenCalled();
  }
});
