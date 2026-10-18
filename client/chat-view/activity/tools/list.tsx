import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Section } from "./shared";
import type { ActivityStyles } from "../styles";

/** 一行的 meta 文本：直接给字符串，或带颜色（失败行用）。 */
export type PaseoListLine = string | { text: string; color?: string };

/** 列表里一行的全部内容。取不到的字段留空即可，空行会被丢掉。 */
export interface PaseoListRow {
  key: string;
  /** 行标题；没有标题也没有 badge 时不渲染表头（例如整行就是一个字段块）。 */
  title?: string;
  /** 标题右侧的标记，如 StatusPill 或 Icon。 */
  badge?: ReactNode;
  /** 标题颜色覆盖，如控制台按 level 上色。 */
  titleColor?: string;
  /** 行内文本整体可选中（notes、output、message 这类可复制的正文）。 */
  selectable?: boolean;
  /** 行体不是文本行时用（如 PaseoFields），排在 meta 文本行之前。 */
  body?: ReactNode;
  lines?: ReadonlyArray<PaseoListLine | undefined>;
}

function lineText(line: PaseoListLine | undefined): string {
  if (line === undefined) return "";
  return typeof line === "string" ? line : line.text;
}

function PaseoListRowView({ row, styles }: { row: PaseoListRow; styles: ActivityStyles }) {
  const lines = (row.lines ?? []).filter(
    (line): line is PaseoListLine => lineText(line).trim() !== "",
  );
  return (
    <View style={styles.paseoListItem}>
      {row.title === undefined && !row.badge ? null : (
        <View style={styles.paseoListItemHeader}>
          {row.title === undefined ? null : (
            <Text
              numberOfLines={1}
              style={
                row.titleColor
                  ? [styles.paseoListItemTitle, { color: row.titleColor }]
                  : styles.paseoListItemTitle
              }
            >
              {row.title}
            </Text>
          )}
          {row.badge ?? null}
        </View>
      )}
      {row.body}
      {lines.map((line, index) => (
        <Text
          key={index}
          numberOfLines={2}
          selectable={row.selectable}
          style={
            typeof line !== "string" && line.color
              ? [styles.paseoListItemMeta, { color: line.color }]
              : styles.paseoListItemMeta
          }
        >
          {lineText(line)}
        </Text>
      ))}
    </View>
  );
}

/** 一个列表小节：小节标题 + 若干行。空列表显示 empty，或整段不渲染。 */
export function PaseoListSection({
  title,
  rows,
  empty,
  styles,
}: {
  /** 如 `Agents (3)`；不给就不套 Section（权限列表直接铺开）。 */
  title?: string;
  rows: readonly PaseoListRow[];
  /** 空列表时的文字；不给就整段不渲染。 */
  empty?: string;
  styles: ActivityStyles;
}) {
  if (rows.length === 0) {
    return empty === undefined ? null : <Text style={styles.empty}>{empty}</Text>;
  }
  const list = (
    <View style={styles.paseoList}>
      {rows.map((row) => (
        <PaseoListRowView key={row.key} row={row} styles={styles} />
      ))}
    </View>
  );
  if (title === undefined) return list;
  return (
    <Section title={title} styles={styles}>
      {list}
    </Section>
  );
}
