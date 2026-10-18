import React from "react";

import { toolFamily } from "../../../../shared/chat-view/activity/tool-presentation";
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
  const family = toolFamily(data.name);
  if (family === "github") {
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
  if (family === "exa") {
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
  if (family === "paseo") {
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
