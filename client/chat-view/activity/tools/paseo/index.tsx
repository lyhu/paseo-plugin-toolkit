import type { ReactNode } from "react";
import { View } from "react-native";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import { paseoToolResult } from "../../../../../shared/chat-view/activity/tool-presentation";
import {
  paseoToolFamily,
  paseoToolLeafName,
  type PaseoToolFamily,
} from "../../../../../shared/chat-view/activity/paseo-tools";
import type { ActivityStyles } from "../../styles";
import { PaseoFields, StatusPill, asRecord } from "../shared";
import { AgentTool } from "./agent";
import { BrowserTool } from "./browser";
import type { PaseoProps, PaseoRenderProps } from "./parts";
import { ProviderTool } from "./provider";
import { ScheduleTool } from "./schedule";
import { SpeakTool } from "./speak";
import { TerminalTool } from "./terminal";
import { WorkspaceTool } from "./workspace";

/** 家族 → 渲染模块：加一个家族只改这一行，加一个叶子只改 shared/activity/paseo-tools.ts 的行表。 */
const FAMILY_RENDERERS: Record<PaseoToolFamily, (props: PaseoRenderProps) => ReactNode> = {
  agent: AgentTool,
  workspace: WorkspaceTool,
  terminal: TerminalTool,
  schedule: ScheduleTool,
  provider: ProviderTool,
  browser: BrowserTool,
  speak: SpeakTool,
};

function PaseoFailure({
  result,
  palette,
  styles,
}: {
  result: unknown;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  const failure = asRecord(result);
  const error = asRecord(failure?.error);
  return (
    <View style={styles.paseoStack}>
      <StatusPill value="Failed" palette={palette} styles={styles} />
      <PaseoFields
        fields={[
          ["Code", error?.code],
          ["Error", error?.message ?? failure?.error],
          ["Retryable", error?.retryable],
        ]}
        palette={palette}
        styles={styles}
      />
    </View>
  );
}

export function PaseoToolDetail({ toolName, input, output, theme, palette, styles }: PaseoProps) {
  const leaf = paseoToolLeafName(toolName);
  const family = paseoToolFamily(toolName);
  if (!leaf || !family) return null;
  const result = paseoToolResult(output);
  if (asRecord(result)?.ok === false) {
    return <PaseoFailure result={result} palette={palette} styles={styles} />;
  }
  const Renderer = FAMILY_RENDERERS[family];
  return (
    <Renderer
      leaf={leaf}
      input={input}
      output={output}
      result={result}
      theme={theme}
      palette={palette}
      styles={styles}
    />
  );
}
