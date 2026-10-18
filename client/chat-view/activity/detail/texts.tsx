import React from "react";
import { Text } from "react-native";

import { DetailRenderProps, HighlightedCodeBlock } from "./parts";

/** Details that are text themselves: sub-agent runs, plain messages, and plans. */
export function SubAgentDetail({ detail, theme, styles }: DetailRenderProps<"sub_agent">) {
  return (
    <>
      {detail.subAgentType ? <Text style={styles.detailText}>{detail.subAgentType}</Text> : null}
      {detail.description ? <Text style={styles.mutedText}>{detail.description}</Text> : null}
      {detail.childSessionId ? (
        <Text style={styles.mutedText}>Session {detail.childSessionId}</Text>
      ) : null}
      {detail.log ? (
        <HighlightedCodeBlock
          code={detail.log}
          language="ansi"
          label="Activity log"
          styles={styles}
          theme={theme}
        />
      ) : null}
    </>
  );
}

export function PlainTextDetail({ detail, styles }: DetailRenderProps<"plain_text">) {
  return (
    <Text selectable style={styles.detailText}>
      {detail.text ?? ""}
    </Text>
  );
}

export function PlanDetail({ detail, styles }: DetailRenderProps<"plan">) {
  return (
    <Text selectable style={styles.detailText}>
      {detail.text}
    </Text>
  );
}
