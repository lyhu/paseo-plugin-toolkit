import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import {
  createReasoningData,
  createToolCallData,
  isSpeakToolCall,
  REASONING_RENDERER_KIND,
  REASONING_RENDERER_VERSION,
  TOOL_CALL_RENDERER_KIND,
  TOOL_CALL_RENDERER_VERSION,
} from "../../../shared/chat-view/activity/timeline";

export const transformReasoning: PluginTimelineTransformerContribution<"reasoning">["transform"] =
  ({ item, phase }) => ({
    items: [
      {
        type: "plugin",
        kind: REASONING_RENDERER_KIND,
        version: REASONING_RENDERER_VERSION,
        data: createReasoningData(item, phase),
      },
    ],
  });

export const transformToolCall: PluginTimelineTransformerContribution<"tool_call">["transform"] = ({
  item,
}) => {
  if (isSpeakToolCall(item)) return undefined;
  return {
    items: [
      {
        type: "plugin",
        kind: TOOL_CALL_RENDERER_KIND,
        version: TOOL_CALL_RENDERER_VERSION,
        data: createToolCallData(item),
      },
    ],
  };
};
