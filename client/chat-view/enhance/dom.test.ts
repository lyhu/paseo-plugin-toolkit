import { expect, it, vi } from "vitest";
import { pickComposerInput, summarizeComposer } from "./dom";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

const candidate = (value: string, visible = true) => ({
  value,
  clientWidth: visible ? 500 : 0,
  clientHeight: visible ? 80 : 0,
});

it("prefers the filled composer over a mounted empty one", () => {
  const archived = candidate("", false);
  const active = candidate("加个缓存");
  expect(pickComposerInput([archived, active])).toBe(active);
  expect(pickComposerInput([candidate(""), candidate("  ")])).toMatchObject({ value: "" });
  expect(pickComposerInput([candidate("", false)])).toBeUndefined();
  expect(pickComposerInput([])).toBeUndefined();
});

it("counts composer candidates for diagnostics", () => {
  expect(summarizeComposer([candidate("a"), candidate("b", false), candidate("", true)])).toEqual({
    total: 3,
    visible: 2,
    filled: 1,
  });
  expect(summarizeComposer([])).toEqual({ total: 0, visible: 0, filled: 0 });
});
