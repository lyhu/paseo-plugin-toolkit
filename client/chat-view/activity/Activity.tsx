import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useRevealedText } from "@getpaseo/plugin/client/react-native";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import React, { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import {
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type ScrollView as NativeScrollView,
  type NativeSyntheticEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { z } from "zod";

import { useActivityStyles, usePalette, type Theme } from "./styles";

import type { ActivityPalette } from "../../../shared/chat-view/activity/palette";

import { previewText } from "../../../shared/chat-view/activity/text";
import {
  parseSubAgentActionLog,
  resolveSubAgentActionPresentation,
} from "../../../shared/chat-view/activity/tool-presentation";

import {
  parseInlineMarkdown,
  parseReasoningMarkdown,
} from "../../../shared/chat-view/activity/parse";

import { activitySettings, DEFAULT_DISPLAY_MODE } from "../../../shared/chat-view/settings";
import {
  activityDataKey,
  getActivityExpansionState,
  reasoningItemDataSchema,
  toolCallItemDataSchema,
  type ReasoningItemData,
  type ToolCallItemData,
} from "../../../shared/chat-view/activity/timeline";
import {
  createActivityGroup,
  formatGroupSummary,
  updateGroupStats,
  type GroupItemData,
  type TurnGroup,
} from "./group-store";
import { useActivityGroup } from "./history";
import { createLatestMarker, useIsLatestMarker } from "./latest-marker";
import { DetailBody, DetailLabel, HighlightedCodeBlock, asToolCallDetail } from "./detail";
import { useActivityDisclosure } from "./disclosure";
import { scrollActivityIntoView } from "./dom";

const MAX_VISIBLE_SUBAGENT_ACTIONS = 5;

type ReasoningData = z.output<typeof reasoningItemDataSchema>;
type ToolCallData = z.output<typeof toolCallItemDataSchema>;

const latestReasoningMarker = createLatestMarker();
const latestToolCallMarker = createLatestMarker();

function statusIcon(status: ToolCallData["status"]): string {
  switch (status) {
    case "running":
      return "LoaderCircle";
    case "completed":
      return "CircleCheck";
    case "failed":
      return "CircleX";
    case "canceled":
      return "CircleSlash2";
  }
}

function SubAgentProgress({
  detail,
  styles,
}: {
  detail: Extract<ToolCallDetail, { type: "sub_agent" }>;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  const actions = useMemo(() => {
    const explicitActions = [...(detail.actions ?? [])].sort(
      (left, right) => left.index - right.index,
    );
    return explicitActions.length > 0 ? explicitActions : parseSubAgentActionLog(detail.log);
  }, [detail.actions, detail.log]);
  const hiddenActionCount = Math.max(0, actions.length - MAX_VISIBLE_SUBAGENT_ACTIONS);
  const visibleActions = actions.slice(hiddenActionCount);
  const thinking =
    actions.length > 0 && !(detail.actions?.length ?? 0)
      ? null
      : detail.log?.replace(/\s+/g, " ").trim();

  return (
    <View style={styles.subAgentProgress}>
      {thinking ? (
        <View style={styles.subAgentLine}>
          <View style={styles.subAgentLineIcon}>
            <Icon name="Brain" color={styles.subAgentLineSummary.color} size={11} />
          </View>
          <Text numberOfLines={1} style={styles.subAgentLineLabel}>
            Thinking
          </Text>
          <Text numberOfLines={1} style={styles.subAgentLineSummary}>
            {thinking}
          </Text>
        </View>
      ) : null}
      {hiddenActionCount > 0 ? (
        <Text style={styles.subAgentMore}>+{hiddenActionCount} more…</Text>
      ) : null}
      {visibleActions.map((action) => {
        const presentation = resolveSubAgentActionPresentation(action.toolName, action.summary);
        return (
          <View key={`${action.index}-${action.toolName}`} style={styles.subAgentAction}>
            <View style={styles.subAgentActionIcon}>
              <Icon name={presentation.icon} color={styles.subAgentActionSummary.color} size={11} />
            </View>
            <Text numberOfLines={1} style={styles.subAgentActionLabel}>
              {presentation.label}
            </Text>
            {presentation.summaryIcon && action.summary ? (
              <Icon
                name={presentation.summaryIcon}
                color={styles.subAgentActionSummary.color}
                size={11}
              />
            ) : null}
            {action.summary ? (
              <Text numberOfLines={1} style={styles.subAgentActionSummary}>
                {action.summary}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function renderInlineReasoning(
  text: string,
  styles: ReturnType<typeof useActivityStyles>,
): ReactNode[] {
  return parseInlineMarkdown(text).map((part, index) => {
    if (part.type === "text") return part.text;
    const style =
      part.type === "bold"
        ? [styles.reasoningLine, { fontWeight: "700" as const }]
        : part.type === "italic"
          ? [styles.reasoningLine, { fontStyle: "italic" as const }]
          : styles.reasoningInlineCode;
    return (
      <Text key={`inline-${index}`} style={style}>
        {part.text}
      </Text>
    );
  });
}

function InlineReasoning({
  text,
  styles,
}: {
  text: string;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  return <Text style={styles.reasoningLine}>{renderInlineReasoning(text, styles)}</Text>;
}

function ReasoningMarkdown({
  text,
  theme,
  styles,
}: {
  text: string;
  theme: Theme;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  const blocks = useMemo(() => parseReasoningMarkdown(text), [text]);
  return (
    <View style={styles.reasoningBody}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "code":
            return (
              <HighlightedCodeBlock
                key={key}
                code={block.text}
                language={block.language ?? "text"}
                theme={theme}
                styles={styles}
              />
            );
          case "spacer":
            return <View key={key} style={styles.reasoningSpacer} />;
          case "heading":
            return (
              <Text key={key} selectable style={styles.reasoningHeading}>
                {renderInlineReasoning(block.text, styles)}
              </Text>
            );
          case "unordered":
            return (
              <View key={key} style={styles.reasoningBulletRow}>
                <Text style={styles.reasoningBullet}>•</Text>
                <InlineReasoning text={block.text} styles={styles} />
              </View>
            );
          case "ordered":
            return (
              <View key={key} style={styles.reasoningBulletRow}>
                <Text style={styles.reasoningBullet}>{block.marker}</Text>
                <InlineReasoning text={block.text} styles={styles} />
              </View>
            );
          case "quote":
            return (
              <Text key={key} selectable style={styles.reasoningQuote}>
                {renderInlineReasoning(block.text, styles)}
              </Text>
            );
          case "paragraph":
            return <InlineReasoning key={key} text={block.text} styles={styles} />;
        }
      })}
    </View>
  );
}

function ReasoningText({
  text,
  phase,
  theme,
  styles,
}: {
  text: string;
  phase: ReasoningData["phase"];
  theme: Theme;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  const [showAll, setShowAll] = useState(false);
  const preview = useMemo(() => previewText(text), [text]);
  const targetText = showAll ? text : preview.text;
  const revealedText = useRevealedText(targetText, phase);
  const scrollRef = useRef<NativeScrollView | null>(null);
  const isNearBottom = useRef(true);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    isNearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 32;
  }, []);
  const handleContentSizeChange = useCallback(() => {
    if (isNearBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
        style={styles.detailsScroll}
      >
        <ReasoningMarkdown text={revealedText} theme={theme} styles={styles} />
      </ScrollView>
      {preview.truncated ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(!showAll)}
          style={styles.showMoreButton}
        >
          <Text style={styles.showMoreText}>
            {showAll
              ? "Show less"
              : `Show all (${preview.totalLines} lines, ${preview.totalChars.toLocaleString()} chars)`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActivityHeader({
  icon,
  iconColor,
  title,
  summary,
  status,
  statusColor,
  stats,
  expanded,
  onPress,
  styles,
}: {
  icon: string;
  iconColor: string;
  title: string;
  summary?: string;
  status?: ToolCallData["status"];
  statusColor?: string;
  stats?: ToolCallData["presentation"]["diffStats"];
  expanded: boolean;
  onPress: () => void;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  return (
    <Pressable
      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.headerButton}
    >
      <View style={styles.iconBadge}>
        <Icon name={icon} color={iconColor} size={12} />
      </View>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {summary ? (
        <Text numberOfLines={1} style={styles.summary}>
          {summary}
        </Text>
      ) : null}
      {stats ? (
        <View style={styles.stats}>
          <Text style={styles.additions}>+{stats.additions}</Text>
          <Text style={styles.deletions}>-{stats.deletions}</Text>
        </View>
      ) : null}
      {status ? (
        <View style={styles.status}>
          <Icon name={statusIcon(status)} color={statusColor ?? styles.title.color} size={12} />
        </View>
      ) : null}
      <Icon
        name={expanded ? "ChevronDown" : "ChevronRight"}
        color={styles.summary.color}
        size={12}
      />
    </Pressable>
  );
}

function GroupSubItem({
  agentId,
  subItem,
  theme,
  palette,
  styles,
}: {
  agentId: string;
  subItem: GroupItemData;
  theme: Theme;
  palette: ActivityPalette;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  const [subExpanded, setSubExpanded] = useActivityDisclosure(agentId, subItem.id);

  if (subItem.type === "reasoning" && subItem.reasoningData) {
    return (
      <View style={styles.card}>
        <ActivityHeader
          icon="Sparkles"
          iconColor={palette.categoryColors.reasoning}
          title="Thinking"
          expanded={subExpanded ?? false}
          onPress={() => setSubExpanded(!subExpanded)}
          styles={styles}
        />
        {subExpanded ? (
          <View style={styles.details}>
            <ReasoningText
              text={subItem.reasoningData.text}
              phase={subItem.reasoningData.phase}
              theme={theme}
              styles={styles}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (subItem.type === "tool_call" && subItem.toolCallData) {
    const data = subItem.toolCallData;
    const categoryColor = palette.categoryColors[data.presentation.category];
    const statusColor = palette.statusColors[data.status];
    const detail = asToolCallDetail(data.detail);
    const subAgentDetail = detail?.type === "sub_agent" ? detail : null;

    return (
      <View style={styles.card}>
        <ActivityHeader
          icon={data.presentation.icon}
          iconColor={categoryColor}
          title={data.presentation.label}
          summary={data.presentation.summary}
          status={data.status}
          statusColor={statusColor}
          stats={data.presentation.diffStats}
          expanded={subExpanded ?? false}
          onPress={() => setSubExpanded(!subExpanded)}
          styles={styles}
        />
        {subAgentDetail ? <SubAgentProgress detail={subAgentDetail} styles={styles} /> : null}
        {subExpanded ? (
          <View style={styles.details}>
            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <DetailBody data={data} theme={theme} palette={palette} styles={styles} />
              {data.errorText ? (
                <View style={styles.section}>
                  <DetailLabel style={styles.detailLabel}>Error</DetailLabel>
                  <Text
                    selectable
                    style={{ ...styles.detailText, color: theme.colors.statusDanger }}
                  >
                    {data.errorText}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }

  return null;
}

function FoldedActivityGroup({
  group,
  agentId,
  theme,
  palette,
  styles,
}: {
  group: TurnGroup;
  agentId: string;
  theme: Theme;
  palette: ActivityPalette;
  styles: ReturnType<typeof useActivityStyles>;
}) {
  // Module-level so an explicit choice survives the virtual list recycling this row.
  const [expanded, setExpanded] = useActivityDisclosure(agentId, `group:${group.leaderId}`);
  const headerRef = useRef<View>(null);

  const summaryText = formatGroupSummary(group);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (!next) scrollActivityIntoView(headerRef.current);
  }, [expanded, setExpanded]);

  const groupHeaderStyle: ViewStyle = useMemo(
    () => ({
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      alignSelf: "stretch",
      paddingVertical: 1,
      paddingHorizontal: 2,
      minHeight: 20,
      gap: 6,
      cursor: "pointer",
    }),
    [],
  );

  const summaryTextStyle: TextStyle = useMemo(
    () => ({
      color: theme.colors.foregroundMuted,
      fontSize: 12.5,
      fontWeight: "500",
      lineHeight: 16,
      flexShrink: 1,
    }),
    [theme.colors.foregroundMuted],
  );

  const detailsContainerStyle: ViewStyle = useMemo(
    () => ({
      borderLeftWidth: 2,
      borderLeftColor: theme.colors.border,
      marginLeft: 10,
      paddingLeft: 10,
      marginTop: 4,
      marginBottom: 6,
      gap: 6,
    }),
    [theme.colors.border],
  );

  const containerStyle: ViewStyle = useMemo(
    () => ({
      width: "100%",
      alignSelf: "stretch",
      marginVertical: 0,
    }),
    [],
  );

  return (
    <View testID="folded-activity-group" style={containerStyle}>
      <Pressable
        ref={headerRef}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${summaryText}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={toggle}
        style={groupHeaderStyle}
      >
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          color={theme.colors.foregroundMuted}
          size={12}
        />
        <Text numberOfLines={1} style={summaryTextStyle}>
          {summaryText}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={detailsContainerStyle}>
          {group.items.map((entry) => {
            if (entry.type === "reasoning" && entry.reasoningData?.text?.trim())
              return (
                <ReasoningText
                  key={entry.id}
                  text={entry.reasoningData.text}
                  phase={entry.reasoningData.phase}
                  theme={theme}
                  styles={styles}
                />
              );
            if (entry.type === "tool_call" && entry.toolCallData)
              return (
                <GroupSubItem
                  key={entry.id}
                  agentId={agentId}
                  subItem={entry}
                  theme={theme}
                  palette={palette}
                  styles={styles}
                />
              );
            return null;
          })}
        </View>
      ) : null}
    </View>
  );
}

function singleActivityGroup(
  timestamp: Date,
  data: ReasoningItemData | ToolCallItemData,
): TurnGroup {
  const tool = "name" in data;
  const id = activityDataKey(data, timestamp);
  const group = createActivityGroup(timestamp.getTime(), id, timestamp.getTime(), [
    {
      id,
      timestamp: timestamp.getTime(),
      type: tool ? "tool_call" : "reasoning",
      ...(tool ? { toolCallData: data } : { reasoningData: data }),
    },
  ]);
  updateGroupStats(group);
  return group;
}

export function ColorfulReasoning({
  agentId,
  item,
  theme,
  timestamp,
  ...hostProps
}: PluginTimelineItemProps<ReasoningItemData>) {
  const settings = useSettings(activitySettings);
  const mode = settings.status === "ready" ? settings.values.displayMode : DEFAULT_DISPLAY_MODE;
  const palette = usePalette(theme);
  const styles = useActivityStyles(theme, palette);
  const activity = useActivityGroup(agentId, timestamp, item.data, mode === "folded");
  if (mode === "folded") {
    if (activity && !activity.isLeader)
      return <View testID="folded-activity-follower" style={{ height: 0 }} />;
    if (activity && activity.isLeader) {
      return (
        <FoldedActivityGroup
          group={activity.group}
          agentId={agentId}
          theme={theme}
          palette={palette}
          styles={styles}
        />
      );
    }
    // 历史非活跃条目未就绪时默认静默，杜绝单卡片撑开刷屏
    if (item.data.phase !== "streaming") {
      return <View testID="folded-activity-follower" style={{ height: 0 }} />;
    }
    return (
      <FoldedActivityGroup
        group={singleActivityGroup(timestamp, item.data)}
        agentId={agentId}
        theme={theme}
        palette={palette}
        styles={styles}
      />
    );
  }
  return (
    <DetailedColorfulReasoning
      {...hostProps}
      agentId={agentId}
      item={item}
      theme={theme}
      timestamp={timestamp}
    />
  );
}

function DetailedColorfulReasoning({
  agentId,
  item,
  theme,
  timestamp,
}: PluginTimelineItemProps<ReasoningItemData>) {
  const palette = usePalette(theme);
  const styles = useActivityStyles(theme, palette);
  const isStreaming = item.data.phase === "streaming";
  const isLatest = useIsLatestMarker(latestReasoningMarker, agentId, timestamp, isStreaming);
  const [userExpanded, setUserExpanded] = useActivityDisclosure(
    agentId,
    activityDataKey(item.data, timestamp),
  );
  const expanded = getActivityExpansionState(isStreaming, isLatest, userExpanded ?? null);
  const toggle = useCallback(() => setUserExpanded(!expanded), [expanded, setUserExpanded]);
  return (
    <View style={styles.card}>
      <ActivityHeader
        icon="Sparkles"
        iconColor={palette.categoryColors.reasoning}
        title="Thinking"
        expanded={expanded}
        onPress={toggle}
        styles={styles}
      />
      {expanded ? (
        <View style={styles.details}>
          <ReasoningText
            text={item.data.text}
            phase={item.data.phase}
            theme={theme}
            styles={styles}
          />
        </View>
      ) : null}
    </View>
  );
}

export function ColorfulToolCall({
  agentId,
  item,
  theme,
  timestamp,
  ...hostProps
}: PluginTimelineItemProps<ToolCallItemData>) {
  const settings = useSettings(activitySettings);
  const mode = settings.status === "ready" ? settings.values.displayMode : DEFAULT_DISPLAY_MODE;
  const palette = usePalette(theme);
  const styles = useActivityStyles(theme, palette);
  const activity = useActivityGroup(agentId, timestamp, item.data, mode === "folded");
  if (mode === "folded") {
    if (activity && !activity.isLeader)
      return <View testID="folded-activity-follower" style={{ height: 0 }} />;
    if (activity && activity.isLeader) {
      return (
        <FoldedActivityGroup
          group={activity.group}
          agentId={agentId}
          theme={theme}
          palette={palette}
          styles={styles}
        />
      );
    }
    // 历史非活跃条目未就绪时默认静默，杜绝几十行单条展开刷屏
    if (item.data.status !== "running") {
      return <View testID="folded-activity-follower" style={{ height: 0 }} />;
    }
    return (
      <FoldedActivityGroup
        group={singleActivityGroup(timestamp, item.data)}
        agentId={agentId}
        theme={theme}
        palette={palette}
        styles={styles}
      />
    );
  }
  return (
    <DetailedColorfulToolCall
      {...hostProps}
      agentId={agentId}
      item={item}
      theme={theme}
      timestamp={timestamp}
    />
  );
}

function DetailedColorfulToolCall({
  agentId,
  item,
  theme,
  timestamp,
}: PluginTimelineItemProps<ToolCallItemData>) {
  const palette = usePalette(theme);
  const styles = useActivityStyles(theme, palette);
  const isRunning = item.data.status === "running";
  const isLatest = useIsLatestMarker(latestToolCallMarker, agentId, timestamp, isRunning);
  const detail = asToolCallDetail(item.data.detail);
  const [userExpanded, setUserExpanded] = useActivityDisclosure(
    agentId,
    activityDataKey(item.data, timestamp),
  );
  const categoryColor = palette.categoryColors[item.data.presentation.category];
  const statusColor = palette.statusColors[item.data.status];
  const expanded = getActivityExpansionState(isRunning, isLatest, userExpanded ?? null);
  const toggle = useCallback(() => {
    if (!isRunning) setUserExpanded(!expanded);
  }, [expanded, isRunning, setUserExpanded]);
  const subAgentDetail = detail?.type === "sub_agent" ? detail : null;
  return (
    <View style={styles.card}>
      <ActivityHeader
        icon={item.data.presentation.icon}
        iconColor={categoryColor}
        title={item.data.presentation.label}
        summary={item.data.presentation.summary}
        status={item.data.status}
        statusColor={statusColor}
        stats={item.data.presentation.diffStats}
        expanded={expanded}
        onPress={toggle}
        styles={styles}
      />
      {subAgentDetail ? <SubAgentProgress detail={subAgentDetail} styles={styles} /> : null}
      {expanded ? (
        <View style={styles.details}>
          <ScrollView
            style={styles.detailsScroll}
            contentContainerStyle={styles.detailsContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <DetailBody data={item.data} theme={theme} palette={palette} styles={styles} />
            {item.data.errorText ? (
              <View style={styles.section}>
                <DetailLabel style={styles.detailLabel}>Error</DetailLabel>
                <Text selectable style={{ ...styles.detailText, color: theme.colors.statusDanger }}>
                  {item.data.errorText}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
