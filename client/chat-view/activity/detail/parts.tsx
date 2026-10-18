import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import React, { useMemo, useState, type ReactNode } from "react";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View, type TextStyle } from "react-native";

import type { ActivityPalette } from "../../../../shared/chat-view/activity/palette";
import { diffLinesForDetail, type DiffLine } from "../../../../shared/chat-view/activity/diff";
import { PREVIEW_LINES, previewText } from "../../../../shared/chat-view/activity/text";
import type { ToolCallItemData } from "../../../../shared/chat-view/activity/timeline";
import { useHighlightTokens, type HighlightToken } from "../highlight";
import { useActivityStyles, type Theme } from "../styles";

export type ActivityStyles = ReturnType<typeof useActivityStyles>;

/** Everything a per-case detail renderer needs; `detail` is narrowed to the case it renders. */
export interface DetailRenderProps<K extends ToolCallDetail["type"] = ToolCallDetail["type"]> {
  data: ToolCallItemData;
  detail: Extract<ToolCallDetail, { type: K }>;
  theme: Theme;
  palette: ActivityPalette;
  styles: ActivityStyles;
}

/** Detail payloads arrive from the wire, so the shape is only known after a runtime check. */
export function asToolCallDetail(value: ToolCallItemData["detail"]): ToolCallDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = Reflect.get(value, "type");
  if (typeof type !== "string") return null;
  return value as unknown as ToolCallDetail;
}

export function DetailLabel({ children, style }: { children: ReactNode; style: TextStyle }) {
  return <Text style={style}>{children}</Text>;
}

export function PathRow({
  icon,
  path,
  styles,
}: {
  icon: string;
  path: string;
  styles: ActivityStyles;
}) {
  return (
    <View style={styles.pathRow}>
      <Icon name={icon} color={styles.pathText.color} size={12} />
      <Text selectable style={styles.pathText}>
        {path}
      </Text>
    </View>
  );
}

function TokenizedLines({ lines, styles }: { lines: HighlightToken[][]; styles: ActivityStyles }) {
  return (
    <View>
      {lines.map((line, lineIndex) => (
        <Text key={`line-${lineIndex}`} selectable style={styles.codeLine}>
          {line.length === 0
            ? " "
            : line.map((token, tokenIndex) => {
                const tokenStyle: TextStyle = {
                  color: token.color ?? styles.codeLine.color,
                  ...(token.fontStyle && token.fontStyle & 1 ? { fontStyle: "italic" } : {}),
                  ...(token.fontStyle && token.fontStyle & 2 ? { fontWeight: "700" } : {}),
                  ...(token.fontStyle && token.fontStyle & 4
                    ? { textDecorationLine: "underline" }
                    : {}),
                };
                return (
                  <Text key={`${lineIndex}-${tokenIndex}`} style={tokenStyle}>
                    {token.content}
                  </Text>
                );
              })}
        </Text>
      ))}
    </View>
  );
}

export function HighlightedCodeBlock({
  code,
  language,
  theme,
  label,
  styles,
}: {
  code: string;
  language: string;
  theme: Theme;
  label?: string;
  styles: ActivityStyles;
}) {
  const [showAll, setShowAll] = useState(false);
  const preview = useMemo(() => previewText(code), [code]);
  const displayCode = showAll ? code : preview.text;
  const tokens = useHighlightTokens(displayCode, language, theme.colors);

  return (
    <View style={styles.section}>
      {label ? <DetailLabel style={styles.detailLabel}>{label}</DetailLabel> : null}
      <ScrollView horizontal nestedScrollEnabled style={styles.codeScroll}>
        <View style={styles.codeSurface}>
          {tokens ? (
            <TokenizedLines lines={tokens} styles={styles} />
          ) : (
            <Text selectable style={styles.codeLine}>
              {displayCode || " "}
            </Text>
          )}
        </View>
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

export function DiffBlock({
  detail,
  palette,
  styles,
}: {
  detail: Extract<ToolCallDetail, { type: "edit" }>;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const [showAll, setShowAll] = useState(false);
  const lines = useMemo(() => diffLinesForDetail(detail), [detail]);
  const isTruncated = lines.length > PREVIEW_LINES;
  const displayLines = showAll || !isTruncated ? lines : lines.slice(0, PREVIEW_LINES);

  return (
    <View style={styles.section}>
      <DetailLabel style={styles.detailLabel}>Diff</DetailLabel>
      <ScrollView horizontal nestedScrollEnabled style={styles.codeScroll}>
        <View style={styles.diffSurface}>
          {displayLines.length === 0 ? (
            <Text style={styles.empty}>No changed lines.</Text>
          ) : (
            displayLines.map((line, index) => (
              <DiffRow
                key={`${line.kind}-${index}`}
                line={line}
                palette={palette}
                styles={styles}
              />
            ))
          )}
        </View>
      </ScrollView>
      {isTruncated ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(!showAll)}
          style={styles.showMoreButton}
        >
          <Text style={styles.showMoreText}>
            {showAll ? "Show less" : `Show all (${lines.length} lines)`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DiffRow({
  line,
  palette,
  styles,
}: {
  line: DiffLine;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const rowStyle =
    line.kind === "add"
      ? styles.diffAdded
      : line.kind === "remove"
        ? styles.diffRemoved
        : line.kind === "meta"
          ? styles.diffMeta
          : undefined;
  const marker =
    line.kind === "add" ? "+" : line.kind === "remove" ? "-" : line.kind === "meta" ? "" : " ";
  const markerColor =
    line.kind === "add"
      ? palette.statusColors.completed
      : line.kind === "remove"
        ? palette.statusColors.failed
        : line.kind === "meta"
          ? palette.categoryColors.search
          : palette.categoryColors.unknown;
  return (
    <View style={[styles.diffLine, rowStyle]}>
      <Text style={[styles.diffMarker, { color: markerColor }]}>{marker}</Text>
      <Text
        selectable
        style={[
          styles.diffText,
          { color: line.kind === "meta" ? markerColor : styles.codeLine.color },
        ]}
      >
        {line.text || " "}
      </Text>
    </View>
  );
}
