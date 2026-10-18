import { Text, View } from "react-native";
import { PaseoListSection } from "../list";
import {
  PaseoFieldValue,
  PaseoFields,
  Section,
  StatusPill,
  asRecord,
  fieldString,
  stableItemKey,
} from "../shared";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";

export type Theme = PluginTimelineItemProps["theme"];

export type JsonRecord = Record<string, unknown>;

export type PaseoProps = {
  toolName: string;
  input: unknown;
  output: unknown;
  theme: Theme;
  palette: ActivityPalette;
  styles: ActivityStyles;
};

/** 每个家族渲染函数看到的同一组入参；家族只解构自己用得到的那几个。 */
export type PaseoRenderProps = Omit<PaseoProps, "toolName"> & {
  leaf: string;
  result: unknown;
};

export function OutputFields({
  result,
  fields,
  palette,
  styles,
}: {
  result: JsonRecord | null;
  fields: Array<[string, string]>;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const values = fields.map(([key, label]) => [label, result?.[key]] as [string, unknown]);
  return (
    <Section title="Result" styles={styles}>
      <PaseoFields fields={values} palette={palette} styles={styles} />
    </Section>
  );
}

export function ActionResult({
  result,
  palette,
  styles,
  fields = [],
}: {
  result: JsonRecord | null;
  palette: ActivityPalette;
  styles: ActivityStyles;
  fields?: Array<[string, string]>;
}) {
  const visibleFields = fields
    .map(([key, label]) => [label, result?.[key]] as [string, unknown])
    .filter(([, value]) => value !== undefined);
  const success = result?.success;
  return (
    <Section title="Result" styles={styles}>
      <View style={styles.paseoRows}>
        {typeof success === "boolean" ? (
          <StatusPill value={success ? "Success" : "Failed"} palette={palette} styles={styles} />
        ) : null}
        <PaseoFields fields={visibleFields} palette={palette} styles={styles} />
      </View>
    </Section>
  );
}

export function ModeList({
  modes,
  palette,
  styles,
}: {
  modes: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title="Available modes"
      styles={styles}
      rows={modes.map((mode) => {
        const record = asRecord(mode);
        const id = fieldString(record, "id");
        return {
          key: stableItemKey(mode, "mode"),
          title: fieldString(record, "label") ?? id ?? "Mode",
          badge: id ? (
            <Text style={[styles.paseoListItemMeta, { color: palette.categoryColors.agent }]}>
              {id}
            </Text>
          ) : null,
          lines: [fieldString(record, "description")],
        };
      })}
    />
  );
}

export function FallbackPaseo({
  input,
  result,
  palette,
  styles,
}: {
  input: unknown;
  result: unknown;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <View style={styles.paseoStack}>
      <Section title="Input" styles={styles}>
        <PaseoFieldValue value={input} palette={palette} styles={styles} />
      </Section>
      <Section title="Result" styles={styles}>
        <PaseoFieldValue value={result} palette={palette} styles={styles} />
      </Section>
    </View>
  );
}
