import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import React, { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle } from "react-native";
import type { ActivityPalette } from "../../../../shared/chat-view/activity/palette";
import { formatUnknownValue, previewText } from "../../../../shared/chat-view/activity/text";
import {
  asRecord,
  fieldString,
  stringValue,
  type JsonRecord,
} from "../../../../shared/chat-view/activity/tool-output";
import { useHighlightTokens, type HighlightToken } from "../highlight";
import type { ActivityStyles, Theme } from "../styles";

/** Generic value coercers and status colours shared by every tool detail panel. */
export { asRecord, fieldString, stringValue, type JsonRecord };

/** 先命中的第一个键：同一个字段在宿主载荷里可能写 snake_case 或 camelCase。 */
export function fieldValue(record: JsonRecord | null, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** 下面几个读取器都按同一个规则取值：第一个类型/形状对得上的键，跳过空的与不符的。 */
export function fieldNumber(record: JsonRecord | null, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

export function fieldBoolean(record: JsonRecord | null, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

export function fieldArray(record: JsonRecord | null, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function scalarText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return formatUnknownValue(value);
}

export function stableItemKey(value: unknown, prefix: string): string {
  const record = asRecord(value);
  const identity =
    record?.id ??
    record?.agentId ??
    record?.workspaceId ??
    record?.browserId ??
    record?.node_id ??
    record?.number ??
    record?.name ??
    record?.path ??
    record?.url;
  if (typeof identity === "string" || typeof identity === "number") {
    return `${prefix}-${identity}`;
  }
  try {
    return `${prefix}-${JSON.stringify(value)}`;
  } catch {
    return prefix;
  }
}

export function statusColor(status: string | undefined, palette: ActivityPalette): string {
  switch (status?.toLowerCase()) {
    case "running":
    case "initializing":
      return palette.statusColors.running;
    case "completed":
    case "idle":
    case "active":
    case "succeeded":
    case "healthy":
    case "success":
      return palette.statusColors.completed;
    case "failed":
    case "error":
    case "unhealthy":
      return palette.statusColors.failed;
    case "canceled":
    case "paused":
    case "stopped":
    case "closed":
      return palette.statusColors.canceled;
    default:
      return palette.categoryColors.unknown;
  }
}

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const sentence = words.join(" ").toLowerCase();
  return `${sentence[0]?.toUpperCase() ?? ""}${sentence.slice(1)}`;
}

/** Presentation primitives shared by the tool detail panels. */
export function Section({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
  styles: ActivityStyles;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.detailLabel}>{title}</Text>
      {children}
    </View>
  );
}

export function StatusPill({
  value,
  palette,
  styles,
}: {
  value: string;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const color = statusColor(value, palette);
  return (
    <View style={styles.paseoStatus}>
      <Text style={[styles.paseoStatusText, { color }]}>{value}</Text>
    </View>
  );
}

export function PaseoFieldValue({
  value,
  palette,
  styles,
  depth = 0,
}: {
  value: unknown;
  palette: ActivityPalette;
  styles: ActivityStyles;
  depth?: number;
}) {
  if (depth > 2)
    return (
      <Text selectable style={styles.paseoValue}>
        {scalarText(value)}
      </Text>
    );
  const record = asRecord(value);
  if (record) {
    const entries = Object.entries(record).filter(([, child]) => child !== undefined);
    if (entries.length === 0) return <Text style={styles.paseoValue}>—</Text>;
    return (
      <View style={styles.paseoRows}>
        {entries.map(([key, child]) => (
          <PaseoField
            key={`${key}-${stableItemKey(child, key)}`}
            label={humanizeKey(key)}
            value={child}
            palette={palette}
            styles={styles}
            depth={depth + 1}
          />
        ))}
      </View>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <Text style={styles.paseoValue}>—</Text>;
    return (
      <View style={styles.paseoRows}>
        {value.map((child) => (
          <PaseoFieldValue
            key={stableItemKey(child, "item")}
            value={child}
            palette={palette}
            styles={styles}
            depth={depth + 1}
          />
        ))}
      </View>
    );
  }
  return (
    <Text selectable style={styles.paseoValue}>
      {scalarText(value)}
    </Text>
  );
}

export function PaseoField({
  label,
  value,
  palette,
  styles,
  depth = 0,
}: {
  label: string;
  value: unknown;
  palette: ActivityPalette;
  styles: ActivityStyles;
  depth?: number;
}) {
  return (
    <View style={styles.paseoRow}>
      <Text style={styles.paseoKey}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <PaseoFieldValue value={value} palette={palette} styles={styles} depth={depth} />
      </View>
    </View>
  );
}

export function PaseoFields({
  fields,
  palette,
  styles,
}: {
  fields: Array<[string, unknown]>;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const visible = fields.filter(([, value]) => value !== undefined);
  if (visible.length === 0) return <Text style={styles.empty}>No details returned.</Text>;
  return (
    <View style={styles.paseoRows}>
      {visible.map(([label, value]) => (
        <PaseoField
          key={`${label}-${stableItemKey(value, label)}`}
          label={label}
          value={value}
          palette={palette}
          styles={styles}
        />
      ))}
    </View>
  );
}

export function PaseoHero({
  icon,
  title,
  subtitle,
  status,
  palette,
  color,
  styles,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  status?: string;
  palette?: ActivityPalette;
  color: string;
  styles: ActivityStyles;
}) {
  return (
    <View style={[styles.paseoHero, { borderLeftColor: color }]}>
      <View style={styles.paseoHeroRow}>
        <View style={styles.paseoHeroIcon}>
          <Icon name={icon} color={color} size={12} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.paseoHeroTitle}>{title}</Text>
          {subtitle || status ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {subtitle ? (
                <Text numberOfLines={1} style={styles.paseoHeroSubtitle}>
                  {subtitle}
                </Text>
              ) : null}
              {status && palette ? (
                <Text
                  numberOfLines={1}
                  style={[styles.paseoHeroSubtitle, { color: statusColor(status, palette) }]}
                >
                  {status}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function PromptBlock({
  text,
  label = "Prompt",
  styles,
  compact = false,
}: {
  text: string | undefined;
  label?: string;
  styles: ActivityStyles;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const prompt = compact ? (
    <Pressable
      accessibilityLabel={`${expanded ? "Collapse" : "Expand"} prompt: ${text}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded((current) => !current)}
    >
      <Text numberOfLines={expanded ? undefined : 2} selectable style={styles.paseoPrompt}>
        {text}
      </Text>
    </Pressable>
  ) : (
    <Text selectable style={styles.paseoPrompt}>
      {text}
    </Text>
  );
  return label ? (
    <Section title={label} styles={styles}>
      {prompt}
    </Section>
  ) : (
    prompt
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

export function PaseoCodeBlock({
  code,
  language,
  label,
  theme,
  styles,
}: {
  code: string;
  language: string;
  label?: string;
  theme: Theme;
  styles: ActivityStyles;
}) {
  const [showAll, setShowAll] = useState(false);
  const preview = useMemo(() => previewText(code), [code]);
  const displayCode = showAll ? code : preview.text;
  const tokens = useHighlightTokens(displayCode, language, theme.colors);
  return (
    <Section title={label ?? "Output"} styles={styles}>
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
    </Section>
  );
}
