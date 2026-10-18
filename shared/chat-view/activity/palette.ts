import type { PaletteMode } from "../settings";
import type { ToolCategory } from "./paseo-tools";

/** 主题 token 与调色板模式 → 各处共用的 ActivityPalette。 */

type ActivityCategory = ToolCategory | "reasoning";

export interface ActivityThemeColors {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  accentForeground: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
}

export interface ActivityPalette {
  mode: PaletteMode;
  categoryColors: Record<ActivityCategory, string>;
  categoryBackgrounds: Record<ActivityCategory, string>;
  statusColors: {
    running: string;
    completed: string;
    failed: string;
    canceled: string;
  };
  statusBackgrounds: {
    running: string;
    completed: string;
    failed: string;
    canceled: string;
  };
  borderWidth: number;
}

export function parseHexColor(value: string): [number, number, number] | null {
  const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  if (!hex) return null;
  if (hex.length === 3) {
    return [
      Number.parseInt(`${hex[0]}${hex[0]}`, 16),
      Number.parseInt(`${hex[1]}${hex[1]}`, 16),
      Number.parseInt(`${hex[2]}${hex[2]}`, 16),
    ];
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function tintColor(color: string, alpha: number, fallback: string): string {
  const rgb = parseHexColor(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : fallback;
}

export function resolveActivityPalette(
  mode: PaletteMode,
  colors: ActivityThemeColors,
): ActivityPalette {
  const alpha = mode === "vivid" ? 0.1 : mode === "high_contrast" ? 0.16 : 0.06;
  const categoryColors: Record<ActivityCategory, string> = {
    reasoning: mode === "vivid" ? colors.accent : colors.foregroundMuted,
    shell: colors.statusWarning,
    file: mode === "vivid" ? colors.accent : colors.foregroundMuted,
    search: mode === "vivid" ? colors.accent : colors.foregroundMuted,
    agent: mode === "vivid" ? colors.statusSuccess : colors.foregroundMuted,
    plan: colors.foregroundMuted,
    communication: mode === "vivid" ? colors.accent : colors.foregroundMuted,
    unknown: colors.foregroundMuted,
  };
  const statusColors = {
    running: colors.accent,
    completed: colors.statusSuccess,
    failed: colors.statusDanger,
    canceled: colors.foregroundMuted,
  };
  const categoryBackgrounds = Object.fromEntries(
    Object.entries(categoryColors).map(([category, color]) => [
      category,
      tintColor(color, alpha, colors.surface2),
    ]),
  ) as Record<ActivityCategory, string>;
  const statusBackgrounds = Object.fromEntries(
    Object.entries(statusColors).map(([status, color]) => [
      status,
      tintColor(color, alpha, colors.surface2),
    ]),
  ) as ActivityPalette["statusBackgrounds"];
  return {
    mode,
    categoryColors,
    categoryBackgrounds,
    statusColors,
    statusBackgrounds,
    borderWidth: mode === "high_contrast" ? 2 : 1,
  };
}
