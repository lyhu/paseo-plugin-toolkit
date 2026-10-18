import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { resolveActivityPalette } from "../../../shared/chat-view/activity/palette";
import type {
  ActivityPalette,
  ActivityThemeColors,
} from "../../../shared/chat-view/activity/palette";
import { activitySettings, DEFAULT_PALETTE_MODE } from "../../../shared/chat-view/settings";

/** Palette and style derivation shared by the compact-activity rows and the tool detail panels. */
export type Theme = PluginTimelineItemProps["theme"];

const MAX_DETAIL_HEIGHT = 420;
/**
 * Theme objects are rebuilt on the host's schedule, so depending on the object identity
 * invalidated every memo below. Depend on the color content instead.
 */
function useThemeColorsKey(theme: Theme): string {
  const colors = theme.colors as unknown as Record<string, unknown>;
  return useMemo(
    () =>
      Object.keys(colors)
        .sort()
        .map((name) => `${name}:${String(colors[name])}`)
        .join("|"),
    [colors],
  );
}

export function usePalette(theme: Theme): ActivityPalette {
  const settings = useSettings(activitySettings);
  const mode = settings.status === "ready" ? settings.values.palette : DEFAULT_PALETTE_MODE;
  const colorsKey = useThemeColorsKey(theme);
  const colors = theme.colors as ActivityThemeColors;
  return useMemo(() => resolveActivityPalette(mode, colors), [mode, colorsKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useActivityStyles(theme: Theme, palette: ActivityPalette) {
  const themeColorsKey = useThemeColorsKey(theme);
  return useMemo(
    () => ({
      card: {
        marginHorizontal: 0,
        marginVertical: -3,
      } satisfies ViewStyle,
      headerButton: {
        alignItems: "center",
        borderRadius: 2,
        flexDirection: "row",
        gap: 5,
        minWidth: 0,
        outlineColor: "transparent",
        outlineStyle: "none" as unknown as ViewStyle["outlineStyle"],
        outlineWidth: 0,
        overflow: "hidden",
        paddingHorizontal: 5,
        paddingVertical: 2,
      } satisfies ViewStyle,
      iconBadge: {
        alignItems: "center",
        height: 16,
        justifyContent: "center",
        width: 16,
      } satisfies ViewStyle,
      title: {
        color: theme.colors.foreground,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 17,
      } satisfies TextStyle,
      summary: {
        color: theme.colors.foregroundMuted,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 17,
        minWidth: 0,
      } satisfies TextStyle,
      status: {
        alignItems: "center",
        flexDirection: "row",
        marginLeft: 2,
      } satisfies ViewStyle,
      stats: {
        alignItems: "center",
        flexDirection: "row",
        gap: 3,
        marginLeft: 2,
      } satisfies ViewStyle,
      additions: {
        color: theme.colors.statusSuccess,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 15,
      } satisfies TextStyle,
      deletions: {
        color: theme.colors.statusDanger,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 15,
      } satisfies TextStyle,
      details: {
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 1,
        flexShrink: 1,
        marginLeft: 12,
        minWidth: 0,
        overflow: "hidden",
      } satisfies ViewStyle,
      detailsScroll: {
        maxHeight: MAX_DETAIL_HEIGHT,
      } satisfies ViewStyle,
      detailsContent: {
        gap: 6,
        paddingHorizontal: 7,
        paddingVertical: 5,
      } satisfies ViewStyle,
      detailLabel: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: "500",
        letterSpacing: 0.35,
        lineHeight: 14,
        textTransform: "uppercase",
      } satisfies TextStyle,
      detailText: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      mutedText: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      pathRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 5,
        minWidth: 0,
      } satisfies ViewStyle,
      pathText: {
        color: theme.colors.foreground,
        flex: 1,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      section: {
        gap: 3,
      } satisfies ViewStyle,
      showMoreButton: {
        alignSelf: "flex-start",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 2,
        marginTop: 3,
      } satisfies ViewStyle,
      showMoreText: {
        color: palette.categoryColors.agent,
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: "600",
        lineHeight: 14,
      } satisfies TextStyle,
      codeSurface: {
        backgroundColor: theme.colors.surface0,
        borderColor: theme.colors.border,
        borderRadius: 2,
        borderWidth: 1,
        minWidth: "100%",
        paddingHorizontal: 6,
        paddingVertical: 4,
      } satisfies ViewStyle,
      codeScroll: {
        maxWidth: "100%",
      } satisfies ViewStyle,
      codeLine: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        minHeight: 16,
      } satisfies TextStyle,
      diffSurface: {
        backgroundColor: theme.colors.surface0,
        borderColor: theme.colors.border,
        borderRadius: 2,
        borderWidth: 1,
        minWidth: "100%",
        overflow: "hidden",
        paddingVertical: 2,
      } satisfies ViewStyle,
      diffLine: {
        flexDirection: "row",
        minHeight: 16,
        paddingHorizontal: 5,
      } satisfies ViewStyle,
      diffMarker: {
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        width: 12,
      } satisfies TextStyle,
      diffText: {
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      diffAdded: {
        backgroundColor: palette.categoryBackgrounds.agent,
      } satisfies ViewStyle,
      diffRemoved: {
        backgroundColor: palette.statusBackgrounds.failed,
      } satisfies ViewStyle,
      diffMeta: {
        backgroundColor: palette.categoryBackgrounds.search,
      } satisfies ViewStyle,
      reasoningBody: {
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 5,
      } satisfies ViewStyle,
      reasoningLine: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 17,
      } satisfies TextStyle,
      reasoningHeading: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 17,
      } satisfies TextStyle,
      reasoningBullet: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 17,
        width: 14,
      } satisfies TextStyle,
      reasoningBulletRow: {
        alignItems: "flex-start",
        flexDirection: "row",
        gap: 4,
      } satisfies ViewStyle,
      reasoningQuote: {
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 1,
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 17,
        paddingLeft: 6,
      } satisfies TextStyle,
      reasoningInlineCode: {
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 11,
        paddingHorizontal: 2,
      } satisfies TextStyle,
      reasoningSpacer: {
        height: 2,
      } satisfies ViewStyle,
      subAgentProgress: {
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 1,
        gap: 1,
        marginLeft: 12,
        paddingBottom: 2,
        paddingLeft: 7,
        paddingTop: 1,
      } satisfies ViewStyle,
      subAgentLine: {
        alignItems: "center",
        flexDirection: "row",
        gap: 5,
        minWidth: 0,
      } satisfies ViewStyle,
      subAgentLineIcon: {
        alignItems: "center",
        justifyContent: "center",
        width: 14,
      } satisfies ViewStyle,
      subAgentLineLabel: {
        color: theme.colors.foreground,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "600",
        lineHeight: 16,
      } satisfies TextStyle,
      subAgentLineSummary: {
        color: theme.colors.foregroundMuted,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        minWidth: 0,
      } satisfies TextStyle,
      subAgentMore: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        paddingLeft: 19,
      } satisfies TextStyle,
      subAgentAction: {
        alignItems: "center",
        flexDirection: "row",
        gap: 5,
        minWidth: 0,
        paddingLeft: 19,
      } satisfies ViewStyle,
      subAgentActionIcon: {
        alignItems: "center",
        justifyContent: "center",
        width: 14,
      } satisfies ViewStyle,
      subAgentActionLabel: {
        color: theme.colors.foreground,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      subAgentActionSummary: {
        color: theme.colors.foregroundMuted,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        minWidth: 0,
      } satisfies TextStyle,
      childTimelineSection: {
        gap: 2,
      } satisfies ViewStyle,
      childTimelineHeader: {
        alignItems: "center",
        flexDirection: "row",
        gap: 5,
      } satisfies ViewStyle,
      childTimelineList: {
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 1,
        gap: 1,
        marginLeft: 7,
        paddingLeft: 7,
      } satisfies ViewStyle,
      childTimelineItem: {
        alignItems: "center",
        flexDirection: "row",
        gap: 5,
        minWidth: 0,
        paddingVertical: 1,
      } satisfies ViewStyle,
      childTimelineItemTitle: {
        color: theme.colors.foreground,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "500",
        lineHeight: 15,
      } satisfies TextStyle,
      childTimelineItemSummary: {
        color: theme.colors.foregroundMuted,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 14,
        minWidth: 0,
      } satisfies TextStyle,
      childTimelineItemMeta: {
        color: theme.colors.foregroundMuted,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 14,
      } satisfies TextStyle,
      empty: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
      } satisfies TextStyle,
      paseoStack: {
        gap: 6,
      } satisfies ViewStyle,
      paseoHero: {
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 2,
        paddingHorizontal: 6,
        paddingVertical: 2,
      } satisfies ViewStyle,
      paseoHeroRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 6,
      } satisfies ViewStyle,
      paseoHeroIcon: {
        alignItems: "center",
        height: 16,
        justifyContent: "center",
        width: 16,
      } satisfies ViewStyle,
      paseoHeroTitle: {
        color: theme.colors.foreground,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "600",
        lineHeight: 16,
      } satisfies TextStyle,
      paseoHeroSubtitle: {
        color: theme.colors.foregroundMuted,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 14,
      } satisfies TextStyle,
      paseoRows: {
        gap: 2,
      } satisfies ViewStyle,
      paseoRow: {
        alignItems: "flex-start",
        flexDirection: "row",
        gap: 8,
        minWidth: 0,
      } satisfies ViewStyle,
      paseoKey: {
        color: theme.colors.foregroundMuted,
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 15,
        minWidth: 90,
      } satisfies TextStyle,
      paseoValue: {
        color: theme.colors.foreground,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 15,
        minWidth: 0,
      } satisfies TextStyle,
      paseoPrompt: {
        backgroundColor: theme.colors.surface0,
        borderLeftColor: theme.colors.border,
        borderLeftWidth: 1,
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 16,
        paddingHorizontal: 6,
        paddingVertical: 4,
      } satisfies TextStyle,
      paseoList: {
        gap: 0,
      } satisfies ViewStyle,
      paseoListItem: {
        borderTopColor: theme.colors.border,
        borderTopWidth: 1,
        gap: 1,
        paddingHorizontal: 5,
        paddingVertical: 3,
      } satisfies ViewStyle,
      paseoListItemHeader: {
        alignItems: "center",
        flexDirection: "row",
        gap: 7,
        minWidth: 0,
      } satisfies ViewStyle,
      paseoListItemTitle: {
        color: theme.colors.foreground,
        flex: 1,
        flexShrink: 1,
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "500",
        lineHeight: 15,
        minWidth: 0,
      } satisfies TextStyle,
      paseoListItemMeta: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 14,
      } satisfies TextStyle,
      paseoChips: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
      } satisfies ViewStyle,
      paseoChip: {
        borderColor: theme.colors.border,
        borderRadius: 2,
        borderWidth: 1,
        paddingHorizontal: 4,
        paddingVertical: 1,
      } satisfies ViewStyle,
      paseoChipText: {
        color: theme.colors.foregroundMuted,
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 14,
      } satisfies TextStyle,
      paseoStatus: {
        alignSelf: "flex-start",
      } satisfies ViewStyle,
      paseoStatusText: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: "500",
        lineHeight: 14,
      } satisfies TextStyle,
    }),
    [palette, themeColorsKey],
  );
}

export type ActivityStyles = ReturnType<typeof useActivityStyles>;
