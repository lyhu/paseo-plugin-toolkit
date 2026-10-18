import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Text, View } from "react-native";
import type { ActivityStyles } from "../styles";
import {
  exaOutputText,
  exaToolKind,
  parseExaSearchResults,
  type ExaSearchResult,
} from "../../../../shared/chat-view/activity/exa";
import { formatUnknownValue } from "../../../../shared/chat-view/activity/text";
import { PaseoCodeBlock, PromptBlock, Section, asRecord, fieldString } from "./shared";

type Theme = PluginTimelineItemProps["theme"];

function ExaResultList({
  results,
  styles,
}: {
  results: ExaSearchResult[];
  styles: ActivityStyles;
}) {
  return (
    <Section title={`Results (${results.length})`} styles={styles}>
      <View style={styles.paseoList}>
        {results.map((result) => (
          <View key={result.url ?? result.title} style={styles.paseoListItem}>
            <Text selectable style={styles.paseoListItemTitle}>
              {result.title}
            </Text>
            {result.url ? (
              <Text selectable style={styles.paseoListItemMeta}>
                {result.url}
              </Text>
            ) : null}
            {result.published || result.author ? (
              <Text style={styles.paseoListItemMeta}>
                {[result.published, result.author].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {result.highlights ? (
              <Text selectable style={styles.paseoListItemMeta}>
                {result.highlights}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Section>
  );
}

export function ExaToolDetail({
  toolName,
  input,
  output,
  theme,
  styles,
}: {
  toolName: string;
  input: unknown;
  output: unknown;
  theme: Theme;
  styles: ActivityStyles;
}) {
  const kind = exaToolKind(toolName);
  if (!kind) return null;
  const results = kind === "search" ? parseExaSearchResults(output) : [];
  const outputText = exaOutputText(output);
  const inputRecord = asRecord(input);
  const query = fieldString(inputRecord, "query");
  const url = fieldString(inputRecord, "url");
  const prompt = fieldString(inputRecord, "prompt");
  return (
    <View style={styles.paseoStack}>
      {query ? <PromptBlock text={query} label="Query" styles={styles} /> : null}
      {url ? <PromptBlock text={url} label="URL" styles={styles} /> : null}
      {prompt ? <PromptBlock text={prompt} label="Prompt" styles={styles} /> : null}
      {results.length > 0 ? (
        <ExaResultList results={results} styles={styles} />
      ) : outputText ? (
        <PaseoCodeBlock
          code={outputText}
          language="markdown"
          label="Output"
          theme={theme}
          styles={styles}
        />
      ) : (
        <PaseoCodeBlock
          code={formatUnknownValue(output)}
          language="json"
          label="Output"
          theme={theme}
          styles={styles}
        />
      )}
    </View>
  );
}
