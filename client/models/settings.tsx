import { tr, useLocale } from "../i18n";
import { useReducer } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  inheritModel,
  readModels,
  saveModel,
  type ModelState,
  type ModelScope,
} from "../../shared/models/contracts";
import { Button, Label, Row, Surface } from "../quick-questions/ui";
import { TOOLKIT_VERSION } from "../../shared/version";
import { ModelConnectionForm, type ModelDraft } from "./form";

export function ModelsScreen(props: PluginSurfaceProps) {
  useLocale();
  return (
    <Surface theme={props.theme}>
      <ModelConfiguration hostId={props.host.id} />
      <Text
        style={{
          color: props.theme.colors.foregroundMuted,
          fontSize: 12,
          lineHeight: 18,
          paddingTop: 4,
          paddingBottom: 20,
          textAlign: "center",
        }}
      >
        {tr("Toolkit 版本 v{0}", { "0": TOOLKIT_VERSION })}
      </Text>
    </Surface>
  );
}
export function ModelConfiguration({
  hostId,
  workspaceId,
  onClose,
}: {
  hostId: string;
  workspaceId?: string;
  onClose?(): void;
}) {
  const read = useRpc(readModels);
  const query = useQuery({
    queryKey: ["toolkit", "models", hostId, workspaceId ?? "host"],
    queryFn: () => read({ workspaceId }),
    refetchInterval: 5000,
  });
  const [selectedScope, selectScope] = useReducer(
    (_previous: ModelScope | null, next: ModelScope) => next,
    null,
  );
  if (query.isPending) return <Label>{tr("正在读取模型配置…")}</Label>;
  if (query.isError)
    return (
      <View style={{ gap: 8 }}>
        <Label error>{tr(query.error.message)}</Label>
        <Button
          onPress={() => {
            void query.refetch();
          }}
        >
          {tr("重试读取模型配置")}
        </Button>
      </View>
    );
  const scope = selectedScope ?? query.data.source;
  return (
    <View style={{ gap: 10 }}>
      <Label strong>{tr("Toolkit 模型设置")}</Label>
      <Label muted>
        {tr("历史总结和增强共用。当前使用：")}
        {query.data.source === "host" ? tr("主机默认") : tr("工作区独立配置")}
      </Label>
      {workspaceId && (
        <Row>
          <Button primary={scope === "host"} onPress={() => selectScope("host")}>
            {tr("主机默认（所有工作区）")}
          </Button>
          <Button primary={scope === "workspace"} onPress={() => selectScope("workspace")}>
            {tr("当前工作区单独配置")}
          </Button>
        </Row>
      )}
      <ModelEditor
        key={`${scope}:${workspaceId ?? "host"}`}
        data={query.data}
        scope={scope}
        hostId={hostId}
        workspaceId={workspaceId}
        onClose={onClose}
      />
    </View>
  );
}
function initial(data: ModelState, scope: ModelScope) {
  const model = scope === "host" ? data.defaultModel : (data.overrideModel ?? data.defaultModel);
  return { revision: data.revision, ...model, apiKey: "", clearKey: false };
}
function ModelEditor({
  data,
  scope,
  hostId,
  workspaceId,
  onClose,
}: {
  data: ModelState;
  scope: ModelScope;
  hostId: string;
  workspaceId?: string;
  onClose?(): void;
}) {
  const [draft, patch] = useReducer(
    (
      previous: ModelDraft & { revision: number },
      update: Partial<ModelDraft & { revision: number }>,
    ) => ({ ...previous, ...update }),
    initial(data, scope),
  );
  const configure = useRpc(saveModel);
  const inherit = useRpc(inheritModel);
  const cache = useQueryClient();
  function saved(next: ModelState) {
    patch(initial(next, scope));
    cache.setQueryData(["toolkit", "models", hostId, workspaceId ?? "host"], next);
    void cache.invalidateQueries({ queryKey: ["toolkit", "models", hostId] });
    void cache.invalidateQueries({ queryKey: ["toolkit", "quick-questions", hostId] });
  }
  const save = useMutation({
    mutationFn: () => configure({ ...draft, scope, workspaceId }),
    onSuccess: saved,
  });
  const reset = useMutation({
    mutationFn: () => {
      if (!workspaceId) throw new Error(tr("请选择工作区。"));
      return inherit({ workspaceId, revision: draft.revision });
    },
    onSuccess: saved,
  });
  const stale = draft.revision !== data.revision;
  return (
    <View style={{ gap: 8 }}>
      {stale && (
        <Row>
          <Label error>{tr("模型配置已更新，当前草稿保留。")}</Label>
          <Button
            onPress={() => {
              patch(initial(data, scope));
              save.reset();
              reset.reset();
            }}
          >
            {tr("载入最新模型配置")}
          </Button>
        </Row>
      )}
      <ModelConnectionForm
        scope={scope}
        workspaceId={workspaceId}
        values={draft}
        onChange={(update) => {
          patch(update);
          save.reset();
          reset.reset();
        }}
        busy={save.isPending || reset.isPending || stale}
        saving={save.isPending}
        error={save.error?.message ?? reset.error?.message ?? null}
        onSave={() => save.mutate()}
        onClose={onClose}
      />
      {save.isSuccess && <Label>{tr("模型配置已保存。")}</Label>}
      {reset.isSuccess && <Label>{tr("已恢复使用主机默认模型。")}</Label>}
      {scope === "workspace" && data.overrideModel && (
        <Button
          disabled={save.isPending || reset.isPending || stale}
          onPress={() => reset.mutate()}
        >
          {reset.isPending ? tr("正在恢复…") : tr("恢复使用主机默认模型")}
        </Button>
      )}
    </View>
  );
}
