import React from "react";
import { Text, View } from "react-native";

import { fileIconForPath } from "../../../../shared/chat-view/activity/file-kind";
import { DetailRenderProps, HighlightedCodeBlock, PathRow } from "./parts";

/** Search and fetch results, including web hits and page bodies. */
export function SearchDetail({ detail, theme, styles }: DetailRenderProps<"search">) {
  return (
    <>
      <Text style={styles.detailText}>Query: {detail.query}</Text>
      {detail.filePaths?.map((filePath) => (
        <PathRow key={filePath} icon={fileIconForPath(filePath)} path={filePath} styles={styles} />
      ))}
      {detail.content ? (
        <HighlightedCodeBlock code={detail.content} language="text" styles={styles} theme={theme} />
      ) : null}
      {detail.webResults?.map((result) => (
        <View key={result.url} style={styles.section}>
          <Text selectable style={styles.detailText}>
            {result.title}
          </Text>
          <Text selectable style={styles.mutedText}>
            {result.url}
          </Text>
        </View>
      ))}
      {detail.annotations?.map((annotation, index) => (
        <Text key={`${annotation}-${index}`} selectable style={styles.mutedText}>
          {annotation}
        </Text>
      ))}
    </>
  );
}

export function FetchDetail({ detail, theme, styles }: DetailRenderProps<"fetch">) {
  return (
    <>
      <Text selectable style={styles.detailText}>
        {detail.url}
      </Text>
      {detail.result ? (
        <HighlightedCodeBlock
          code={detail.result}
          language="text"
          label="Result"
          styles={styles}
          theme={theme}
        />
      ) : null}
      {detail.code !== undefined ? (
        <Text style={styles.mutedText}>
          HTTP {detail.code} {detail.codeText ?? ""}
        </Text>
      ) : null}
    </>
  );
}
