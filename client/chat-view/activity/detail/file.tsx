import React from "react";
import { Text } from "react-native";

import { MAX_DIFF_CHARS } from "../../../../shared/chat-view/activity/diff";
import { DetailRenderProps, DiffBlock, HighlightedCodeBlock, PathRow } from "./parts";

/** Everything that shows file contents: reads, writes, and edits as a diff. */
export function ReadDetail({ data, detail, theme, styles }: DetailRenderProps<"read">) {
  return (
    <>
      <PathRow icon={data.presentation.fileIcon ?? "Eye"} path={detail.filePath} styles={styles} />
      {detail.content ? (
        <HighlightedCodeBlock
          code={detail.content}
          language={data.presentation.language ?? "text"}
          label="Contents"
          styles={styles}
          theme={theme}
        />
      ) : (
        <Text style={styles.empty}>No file contents returned.</Text>
      )}
    </>
  );
}

export function WriteDetail({ data, detail, theme, styles }: DetailRenderProps<"write">) {
  return (
    <>
      <PathRow
        icon={data.presentation.fileIcon ?? "Pencil"}
        path={detail.filePath}
        styles={styles}
      />
      {detail.content ? (
        <HighlightedCodeBlock
          code={detail.content}
          language={data.presentation.language ?? "text"}
          label="Written contents"
          styles={styles}
          theme={theme}
        />
      ) : null}
    </>
  );
}

export function EditDetail({ data, detail, theme, styles, palette }: DetailRenderProps<"edit">) {
  const isOversized =
    (detail.unifiedDiff?.length ??
      (detail.oldString?.length ?? 0) + (detail.newString?.length ?? 0)) > MAX_DIFF_CHARS;

  if (isOversized && detail.unifiedDiff === undefined) {
    return (
      <>
        <PathRow
          icon={data.presentation.fileIcon ?? "Pencil"}
          path={detail.filePath}
          styles={styles}
        />
        {detail.oldString ? (
          <HighlightedCodeBlock
            code={detail.oldString}
            language={data.presentation.language ?? "text"}
            label="Before"
            styles={styles}
            theme={theme}
          />
        ) : null}
        {detail.newString ? (
          <HighlightedCodeBlock
            code={detail.newString}
            language={data.presentation.language ?? "text"}
            label="After"
            styles={styles}
            theme={theme}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PathRow
        icon={data.presentation.fileIcon ?? "Pencil"}
        path={detail.filePath}
        styles={styles}
      />
      <DiffBlock detail={detail} palette={palette} styles={styles} />
    </>
  );
}
