import { Text, View } from "react-native";
import { PaseoListSection } from "../list";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  PaseoCodeBlock,
  PaseoFields,
  PaseoHero,
  Section,
  StatusPill,
  asRecord,
  fieldArray,
  fieldString,
  scalarText,
  stableItemKey,
} from "../shared";
import { ActionResult, FallbackPaseo } from "./parts";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import type { PaseoRenderProps } from "./parts";

function ScriptList({
  scripts,
  palette,
  styles,
}: {
  scripts: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Scripts (${scripts.length})`}
      empty="No workspace scripts returned."
      styles={styles}
      rows={scripts.map((script) => {
        const record = asRecord(script);
        const lifecycle = fieldString(record, "lifecycle");
        return {
          key: stableItemKey(script, "script"),
          title: fieldString(record, "scriptName") ?? "Script",
          badge: lifecycle ? (
            <StatusPill value={lifecycle} palette={palette} styles={styles} />
          ) : null,
          lines: [
            [
              fieldString(record, "type"),
              fieldString(record, "health"),
              fieldString(record, "port"),
            ]
              .filter(Boolean)
              .join(" · "),
            fieldString(record, "proxyUrl") ?? fieldString(record, "localProxyUrl"),
          ],
        };
      })}
    />
  );
}

function TerminalList({
  terminals,
  palette,
  styles,
}: {
  terminals: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Terminals (${terminals.length})`}
      empty="No terminals returned."
      styles={styles}
      rows={terminals.map((terminal) => {
        const record = asRecord(terminal);
        return {
          key: stableItemKey(terminal, "terminal"),
          title: fieldString(record, "name") ?? fieldString(record, "id") ?? "Terminal",
          badge: <Icon name="SquareTerminal" color={palette.categoryColors.shell} size={12} />,
          lines: [fieldString(record, "cwd"), fieldString(record, "id")],
        };
      })}
    />
  );
}

export function TerminalTool({ leaf, input, result, theme, palette, styles }: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(result);
  switch (leaf) {
    case "list_workspace_scripts":
    case "start_workspace_script":
    case "stop_workspace_script": {
      const scriptResult = asRecord(result)?.script ?? result;
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Workspace", inputRecord?.workspaceId],
              ["Script", inputRecord?.scriptName],
            ]}
            palette={palette}
            styles={styles}
          />
          {leaf === "list_workspace_scripts" ? (
            <ScriptList
              scripts={fieldArray(outputRecord, "scripts")}
              palette={palette}
              styles={styles}
            />
          ) : (
            <Section title="Script" styles={styles}>
              <ScriptList scripts={[scriptResult]} palette={palette} styles={styles} />
            </Section>
          )}
        </View>
      );
    }
    case "list_terminals":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Working directory", inputRecord?.cwd],
              ["All directories", inputRecord?.all],
            ]}
            palette={palette}
            styles={styles}
          />
          <TerminalList
            terminals={fieldArray(outputRecord, "terminals")}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "create_terminal":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Working directory", inputRecord?.cwd],
              ["Workspace", inputRecord?.workspaceId],
              ["Name", inputRecord?.name],
            ]}
            palette={palette}
            styles={styles}
          />
          <Section title="Terminal" styles={styles}>
            <TerminalList terminals={[result]} palette={palette} styles={styles} />
          </Section>
        </View>
      );
    case "capture_terminal": {
      const lines = fieldArray(outputRecord, "lines").map(scalarText).join("\n");
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Terminal", inputRecord?.terminalId],
              ["Start", inputRecord?.start],
              ["End", inputRecord?.end],
              ["Scrollback", inputRecord?.scrollback],
              ["Strip ANSI", inputRecord?.stripAnsi],
              ["Total lines", outputRecord?.totalLines],
            ]}
            palette={palette}
            styles={styles}
          />
          {lines ? (
            <PaseoCodeBlock
              code={lines}
              language="ansi"
              label="Captured output"
              theme={theme}
              styles={styles}
            />
          ) : (
            <Text style={styles.empty}>No terminal output returned.</Text>
          )}
        </View>
      );
    }
    case "send_terminal_keys":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Terminal", inputRecord?.terminalId],
              ["Keys", inputRecord?.keys],
              ["Literal", inputRecord?.literal],
            ]}
            palette={palette}
            styles={styles}
          />
          <ActionResult result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    case "kill_terminal":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="CircleX"
            title={fieldString(inputRecord, "terminalId") ?? "Terminal"}
            color={palette.categoryColors.shell}
            styles={styles}
          />
          <ActionResult result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    default:
      return <FallbackPaseo input={input} result={result} palette={palette} styles={styles} />;
  }
}
