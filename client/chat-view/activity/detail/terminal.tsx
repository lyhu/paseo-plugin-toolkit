import React from "react";
import { Text } from "react-native";

import { DetailRenderProps, HighlightedCodeBlock } from "./parts";

/** Command execution and the worktree setup that precedes it. */
export function ShellDetail({ detail, theme, styles }: DetailRenderProps<"shell">) {
  return (
    <>
      <HighlightedCodeBlock
        code={`$ ${detail.command}`}
        language="bash"
        label="Command"
        styles={styles}
        theme={theme}
      />
      {detail.output ? (
        <HighlightedCodeBlock
          code={detail.output}
          language="ansi"
          label="Output"
          styles={styles}
          theme={theme}
        />
      ) : null}
      {detail.exitCode !== undefined && detail.exitCode !== null ? (
        <Text style={styles.mutedText}>Exit code {detail.exitCode}</Text>
      ) : null}
    </>
  );
}

export function WorktreeSetupDetail({
  detail,
  theme,
  styles,
}: DetailRenderProps<"worktree_setup">) {
  return (
    <>
      <Text style={styles.detailText}>Branch: {detail.branchName}</Text>
      <Text style={styles.mutedText}>Path: {detail.worktreePath}</Text>
      {detail.log ? (
        <HighlightedCodeBlock
          code={detail.log}
          language="ansi"
          label="Setup log"
          styles={styles}
          theme={theme}
        />
      ) : null}
    </>
  );
}
