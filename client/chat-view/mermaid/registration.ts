import type { PluginClientContext } from "@getpaseo/plugin/client";
import { z } from "zod";
import { DiagramItem, TextItem } from "./item";
import { DIAGRAM_KIND, split, TEXT_KIND } from "../../../shared/chat-view/mermaid/transform";

export function registerMermaid(client: PluginClientContext) {
  const removeDiagram = client.addTimelineRenderer({
    kind: DIAGRAM_KIND,
    version: 1,
    schema: z.object({ source: z.string() }),
    Component: DiagramItem,
  });
  const removeText = client.addTimelineRenderer({
    kind: TEXT_KIND,
    version: 1,
    schema: z.object({
      text: z.string(),
      phase: z.enum(["streaming", "complete"]).default("complete"),
    }),
    Component: TextItem,
  });
  const removeTransformer = client.addTimelineTransformer({
    id: "mermaid-assistant",
    query: { itemType: "assistant_message" },
    transform: ({ item, phase }) => split(item.text, phase),
  });
  return () => {
    removeTransformer();
    removeDiagram();
    removeText();
  };
}
