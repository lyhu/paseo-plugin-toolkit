import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { FeatureDomain } from "../feature";
import {
  REASONING_RENDERER_KIND,
  TOOL_CALL_RENDERER_KIND,
  reasoningItemDataSchema,
  toolCallItemDataSchema,
} from "../../../shared/chat-view/activity/timeline";
import { ColorfulReasoning, ColorfulToolCall } from "./Activity";
import { cleanupActivityDisclosure } from "./disclosure";
import { setupCompactActivityStyles } from "./dom";
import { cleanupActivityHistory } from "./history";
import { transformReasoning, transformToolCall } from "./transform";

/** Each installation owns its registrations; disabling restores the host's native renderers. */
function registerActivity(client: PluginClientContext) {
  const removeStyles = setupCompactActivityStyles();
  const removeReasoningRenderer = client.addTimelineRenderer({
    kind: REASONING_RENDERER_KIND,
    version: 1,
    schema: reasoningItemDataSchema,
    Component: ColorfulReasoning,
  });
  const removeToolRenderer = client.addTimelineRenderer({
    kind: TOOL_CALL_RENDERER_KIND,
    version: 1,
    schema: toolCallItemDataSchema,
    Component: ColorfulToolCall,
  });
  const removeReasoning = client.addTimelineTransformer({
    id: "reasoning",
    query: { itemType: "reasoning" },
    transform: transformReasoning,
  });
  const removeTools = client.addTimelineTransformer({
    id: "tool-calls",
    query: { itemType: "tool_call" },
    transform: transformToolCall,
  });
  return () => {
    removeReasoning();
    removeTools();
    removeReasoningRenderer();
    removeToolRenderer();
    removeStyles();
  };
}

export function createActivityDomain(
  client: PluginClientContext,
): FeatureDomain<"compactActivityEnabled"> {
  let detach: (() => void) | undefined;
  return {
    settingKey: "compactActivityEnabled",
    setEnabled(enabled) {
      if (enabled === (detach !== undefined)) return;
      if (detach) {
        detach();
        detach = undefined;
        return;
      }
      detach = registerActivity(client);
    },
    dispose() {
      // Deliberately not in the detach handle: mounted rows release their history in effect cleanup,
      // and React can batch a rapid off/on without unmounting them, so disposing on disable would
      // leave a mounted row holding dead history.
      cleanupActivityHistory(client.paseo);
      cleanupActivityDisclosure(client.paseo);
      detach?.();
      detach = undefined;
    },
  };
}
