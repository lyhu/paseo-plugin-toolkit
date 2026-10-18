import React from "react";
import { Text } from "react-native";

import { FetchDetail, SearchDetail } from "./search";
import { EditDetail, ReadDetail, WriteDetail } from "./file";
import { ShellDetail, WorktreeSetupDetail } from "./terminal";
import { PlainTextDetail, PlanDetail, SubAgentDetail } from "./texts";
import { UnknownDetail } from "./dispatch";
import { asToolCallDetail, type DetailRenderProps } from "./parts";

/** The detail module's surface: the dispatcher plus the primitives the activity rows reuse. */
export { DetailLabel, HighlightedCodeBlock, asToolCallDetail } from "./parts";

/**
 * One renderer per detail type, so a new protocol detail cannot be forgotten: the record stops
 * compiling until it is registered.
 */
const RENDERERS: {
  [K in DetailRenderProps["detail"]["type"]]: (props: DetailRenderProps<K>) => React.ReactNode;
} = {
  shell: ShellDetail,
  read: ReadDetail,
  write: WriteDetail,
  edit: EditDetail,
  search: SearchDetail,
  fetch: FetchDetail,
  worktree_setup: WorktreeSetupDetail,
  sub_agent: SubAgentDetail,
  plain_text: PlainTextDetail,
  plan: PlanDetail,
  unknown: UnknownDetail,
};

export function DetailBody(props: Omit<DetailRenderProps, "detail">): React.ReactNode {
  const detail = asToolCallDetail(props.data.detail);
  if (!detail) return <Text style={props.styles.empty}>Tool details unavailable.</Text>;
  const render = RENDERERS[detail.type] as (props: DetailRenderProps) => React.ReactNode;
  return render({ ...props, detail });
}
