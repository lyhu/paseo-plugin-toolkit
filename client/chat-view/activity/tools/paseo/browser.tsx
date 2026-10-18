import { Text, View } from "react-native";
import { PaseoListSection } from "../list";
import {
  PaseoCodeBlock,
  PaseoFields,
  PaseoHero,
  StatusPill,
  asRecord,
  fieldArray,
  fieldBoolean,
  fieldNumber,
  fieldString,
  humanizeKey,
  stableItemKey,
  statusColor,
} from "../shared";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import type { JsonRecord, PaseoRenderProps } from "./parts";

export function BrowserTool({
  leaf,
  input,
  output,
  result,
  theme,
  palette,
  styles,
}: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(output);
  const resultRecord = asRecord(result);
  const browserResult = resultRecord?.ok === true ? asRecord(resultRecord.result) : resultRecord;
  const browserFailure =
    outputRecord?.ok === false ? outputRecord : resultRecord?.ok === false ? resultRecord : null;
  if (browserFailure) {
    const error = asRecord(browserFailure.error);
    return (
      <View style={styles.paseoStack}>
        <PaseoFields
          fields={[
            ["Browser tab", inputRecord?.browserId],
            ["Error", error?.message],
            ["Retryable", error?.retryable],
          ]}
          palette={palette}
          styles={styles}
        />
        <StatusPill value="Failed" palette={palette} styles={styles} />
      </View>
    );
  }
  switch (leaf) {
    case "browser_list_tabs":
      return (
        <BrowserTabList
          tabs={fieldArray(asRecord(browserResult), "tabs")}
          palette={palette}
          styles={styles}
        />
      );
    case "browser_new_tab":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="Globe2"
            title={
              fieldString(asRecord(browserResult), "url") ??
              fieldString(inputRecord, "url") ??
              "New browser tab"
            }
            subtitle={fieldString(asRecord(browserResult), "browserId")}
            color={palette.categoryColors.search}
            styles={styles}
          />
          <PaseoFields
            fields={[
              ["Browser tab", asRecord(browserResult)?.browserId],
              ["Workspace", asRecord(browserResult)?.workspaceId],
              ["URL", asRecord(browserResult)?.url],
            ]}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "browser_snapshot":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Browser tab", browserResult?.browserId],
              ["URL", browserResult?.url],
              ["Title", browserResult?.title],
              ["Format", browserResult?.format],
              ["Truncated", browserResult?.truncated],
              ["Statistics", browserResult?.stats],
            ]}
            palette={palette}
            styles={styles}
          />
          {fieldString(browserResult, "snapshot") ? (
            <PaseoCodeBlock
              code={fieldString(browserResult, "snapshot")!}
              language="yaml"
              label="Page snapshot"
              theme={theme}
              styles={styles}
            />
          ) : null}
        </View>
      );
    case "browser_screenshot":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Browser tab", browserResult?.browserId],
              ["MIME type", browserResult?.mimeType],
              ["Width", browserResult?.width],
              ["Height", browserResult?.height],
              ["Full page", inputRecord?.fullPage],
            ]}
            palette={palette}
            styles={styles}
          />
          <Text style={styles.mutedText}>
            Screenshot data is available to the host as an image attachment.
          </Text>
        </View>
      );
    case "browser_logs":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Browser tab", browserResult?.browserId],
              ["Maximum entries", inputRecord?.maxEntries],
            ]}
            palette={palette}
            styles={styles}
          />
          <BrowserLogs
            consoleEntries={fieldArray(browserResult, "console")}
            networkEntries={fieldArray(browserResult, "network")}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "browser_evaluate":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Browser tab", browserResult?.browserId],
              ["Element", inputRecord?.ref],
            ]}
            palette={palette}
            styles={styles}
          />
          {fieldString(inputRecord, "function") ? (
            <PaseoCodeBlock
              code={fieldString(inputRecord, "function")!}
              language="javascript"
              label="Function"
              theme={theme}
              styles={styles}
            />
          ) : null}
          {fieldString(browserResult, "resultJson") ? (
            <PaseoCodeBlock
              code={fieldString(browserResult, "resultJson")!}
              language="json"
              label="Result"
              theme={theme}
              styles={styles}
            />
          ) : null}
        </View>
      );
    default:
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={browserInputFields(leaf, inputRecord)}
            palette={palette}
            styles={styles}
          />
          <PaseoFields
            fields={browserOutputFields(leaf, browserResult)}
            palette={palette}
            styles={styles}
          />
        </View>
      );
  }
}

function browserInputFields(leaf: string, input: JsonRecord | null): Array<[string, unknown]> {
  if (!input) return [];
  const labels: Record<string, string> = {
    browserId: "Browser tab",
    ref: "Element",
    sourceRef: "Source element",
    targetRef: "Target element",
    url: "URL",
    value: "Value",
    text: "Text",
    key: "Key",
    button: "Button",
    doubleClick: "Double click",
    modifiers: "Modifiers",
    filePaths: "Files",
    fullPage: "Full page",
    maxEntries: "Maximum entries",
    timeoutMs: "Timeout",
    deltaX: "Horizontal delta",
    deltaY: "Vertical delta",
    width: "Width",
    height: "Height",
    function: "Function",
  };
  const excluded = new Set(["browserId"]);
  return Object.entries(input)
    .filter(
      ([key, value]) => value !== undefined && (!excluded.has(key) || leaf === "browser_list_tabs"),
    )
    .map(([key, value]) => [labels[key] ?? humanizeKey(key), value]);
}

function browserOutputFields(leaf: string, result: JsonRecord | null): Array<[string, unknown]> {
  if (!result) return [];
  const excluded = new Set([
    "command",
    "browserId",
    "snapshot",
    "console",
    "network",
    "resultJson",
  ]);
  return Object.entries(result)
    .filter(([key, value]) => value !== undefined && !excluded.has(key))
    .map(([key, value]) => [humanizeKey(key), value]);
}

function BrowserTabList({
  tabs,
  palette,
  styles,
}: {
  tabs: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Browser tabs (${tabs.length})`}
      empty="No browser tabs returned."
      styles={styles}
      rows={tabs.map((tab) => {
        const record = asRecord(tab);
        return {
          key: stableItemKey(tab, "tab"),
          title: fieldString(record, "title") ?? "Untitled page",
          badge: fieldBoolean(record, "isActive") ? (
            <StatusPill value="Active" palette={palette} styles={styles} />
          ) : null,
          lines: [fieldString(record, "url"), fieldString(record, "browserId")],
        };
      })}
    />
  );
}

function BrowserLogs({
  consoleEntries,
  networkEntries,
  palette,
  styles,
}: {
  consoleEntries: unknown[];
  networkEntries: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <View style={styles.paseoStack}>
      <PaseoListSection
        title={`Console (${consoleEntries.length})`}
        styles={styles}
        rows={consoleEntries.map((entry) => {
          const record = asRecord(entry);
          const level = fieldString(record, "level") ?? "log";
          return {
            key: stableItemKey(entry, "console"),
            title: level,
            titleColor: statusColor(level, palette),
            badge: <Text style={styles.paseoListItemMeta}>{fieldString(record, "source")}</Text>,
            selectable: true,
            lines: [fieldString(record, "message")],
          };
        })}
      />
      <PaseoListSection
        title={`Network (${networkEntries.length})`}
        styles={styles}
        rows={networkEntries.map((entry) => {
          const record = asRecord(entry);
          return {
            key: stableItemKey(entry, "network"),
            title: `${fieldString(record, "method") ?? "Request"} ${fieldNumber(record, "status") ?? ""}`,
            badge: (
              <Text style={styles.paseoListItemMeta}>{fieldNumber(record, "duration")} ms</Text>
            ),
            lines: [fieldString(record, "url")],
          };
        })}
      />
    </View>
  );
}
