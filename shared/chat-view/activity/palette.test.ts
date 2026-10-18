import { describe, expect, it } from "vitest";
import { resolveActivityPalette } from "./palette";

const colors = {
  surface0: "#101010",
  surface1: "#181818",
  surface2: "#242424",
  border: "#444444",
  foreground: "#f4f4f5",
  foregroundMuted: "#a1a1aa",
  accent: "#60a5fa",
  accentForeground: "#0f172a",
  statusSuccess: "#4ade80",
  statusWarning: "#fbbf24",
  statusDanger: "#f87171",
};

describe("activity palette", () => {
  it("derives palette colors from Paseo theme tokens", () => {
    const palette = resolveActivityPalette("high_contrast", colors);
    expect(palette.categoryColors.shell).toBe(colors.statusWarning);
    expect(palette.categoryColors.reasoning).toBe(colors.foregroundMuted);
    expect(palette.statusColors.failed).toBe(colors.statusDanger);
    expect(palette.borderWidth).toBe(2);
  });
});
