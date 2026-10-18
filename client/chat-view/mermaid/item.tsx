import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRevealedText } from "@getpaseo/plugin/client/react-native";
import React from "react";
import { View } from "react-native";
import { Markdown } from "./markdown";
import { DiagramViewer } from "./viewer";

export interface TextData {
  text: string;
  phase?: "streaming" | "complete";
}

export interface DiagramData {
  source: string;
}

export function TextItem({ item, theme, layout }: PluginTimelineItemProps<TextData>) {
  const text = useRevealedText(item.data.text, item.data.phase ?? "complete");
  return <Markdown text={text} theme={theme} compact={layout.compact} />;
}

export function DiagramItem({ item, theme, layout }: PluginTimelineItemProps<DiagramData>) {
  return (
    <View style={{ paddingVertical: 4 }}>
      <DiagramViewer source={item.data.source} theme={theme} compact={layout.compact} />
    </View>
  );
}
