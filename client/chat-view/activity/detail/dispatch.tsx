import React from "react";

import { exaToolKind } from "../../../../shared/chat-view/activity/exa";
import { githubToolKind } from "../../../../shared/chat-view/activity/github";
import { paseoToolLeafName } from "../../../../shared/chat-view/activity/paseo-tools";
import { extractCodeInput, formatUnknownValue } from "../../../../shared/chat-view/activity/text";
import { ExaToolDetail } from "../tools/exa";
import { GithubToolDetail } from "../tools/github";
import { PaseoToolDetail } from "../tools/paseo/index";
import { DetailRenderProps, HighlightedCodeBlock } from "./parts";

/** Unknown payloads: hand them to the tool-specific panels, or show raw JSON. */
export function UnknownDetail({
  data,
  detail,
  theme,
  palette,
  styles,
}: DetailRenderProps<"unknown">) {
  if (githubToolKind(data.name)) {
    return (
      <GithubToolDetail
        toolName={data.name}
        input={detail.input}
        output={detail.output}
        theme={theme}
        palette={palette}
        styles={styles}
      />
    );
  }
  if (exaToolKind(data.name)) {
    return (
      <ExaToolDetail
        toolName={data.name}
        input={detail.input}
        output={detail.output}
        theme={theme}
        styles={styles}
      />
    );
  }
  if (paseoToolLeafName(data.name)) {
    return (
      <PaseoToolDetail
        toolName={data.name}
        input={detail.input}
        output={detail.output}
        theme={theme}
        palette={palette}
        styles={styles}
      />
    );
  }
  const codeInput = extractCodeInput(data.name, detail.input);
  if (codeInput) {
    return (
      <>
        <HighlightedCodeBlock
          code={codeInput.code}
          language={codeInput.language}
          label="Input"
          styles={styles}
          theme={theme}
        />
        <HighlightedCodeBlock
          code={formatUnknownValue(detail.output)}
          language="json"
          label="Output"
          styles={styles}
          theme={theme}
        />
      </>
    );
  }
  return (
    <>
      <HighlightedCodeBlock
        code={formatUnknownValue(detail.input)}
        language="json"
        label="Input"
        styles={styles}
        theme={theme}
      />
      <HighlightedCodeBlock
        code={formatUnknownValue(detail.output)}
        language="json"
        label="Output"
        styles={styles}
        theme={theme}
      />
    </>
  );
}
