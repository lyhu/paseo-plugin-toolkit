import { describe, expect, it } from "vitest";
import { getActivityExpansionState } from "./timeline";

describe("reasoning expansion", () => {
  it("keeps the latest completed thinking block open", () => {
    expect(getActivityExpansionState(false, true, null)).toBe(true);
  });

  it("collapses an older block when a newer block exists", () => {
    expect(getActivityExpansionState(false, false, null)).toBe(false);
  });

  it("keeps streaming reasoning open regardless of tool activity", () => {
    expect(getActivityExpansionState(true, false, false)).toBe(true);
  });

  it("respects an explicit user toggle", () => {
    expect(getActivityExpansionState(false, true, false)).toBe(false);
    expect(getActivityExpansionState(false, false, true)).toBe(true);
  });

  it("uses the same latest-item rule for tool calls", () => {
    expect(getActivityExpansionState(false, true, null)).toBe(true);
    expect(getActivityExpansionState(false, false, null)).toBe(false);
  });
});
