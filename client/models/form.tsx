import { tr } from "../i18n";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { listModels, testModel } from "../../shared/models/contracts";
import { Button, Card, Field, Label, Row, useColors } from "../quick-questions/ui";

export interface ModelDraft {
  baseUrl: string;
  model: string;
  apiKey: string;
  clearKey: boolean;
  hasKey: boolean;
}
interface ModelSettingsProps {
  scope: "host" | "workspace";
  workspaceId?: string;
  values: ModelDraft;
  onChange(update: Partial<ModelDraft>): void;
  busy: boolean;
  saving: boolean;
  error: string | null;
  onSave(): void;
  onClose?(): void;
}
export function ModelConnectionForm({
  scope,
  workspaceId,
  values,
  onChange,
  busy,
  saving,
  error,
  onSave,
  onClose,
}: ModelSettingsProps) {
  const colors = useColors();
  const fetchList = useRpc(listModels);
  const test = useRpc(testModel);
  const [listOpen, setListOpen] = useState(false);
  const [search, setSearch] = useState("");
  const list = useMutation({
    mutationFn: () =>
      fetchList({
        workspaceId,
        scope,
        baseUrl: values.baseUrl.trim(),
        apiKey: values.apiKey,
        clearKey: values.clearKey,
      }),
    onSuccess: () => {
      setSearch("");
      setListOpen(true);
    },
  });
  const probe = useMutation({
    mutationFn: () =>
      test({
        workspaceId,
        scope,
        baseUrl: values.baseUrl.trim(),
        model: values.model.trim(),
        apiKey: values.apiKey,
        clearKey: values.clearKey,
      }),
  });
  const pending = busy || list.isPending || probe.isPending;
  const canConnect = Boolean(values.baseUrl.trim());
  const canTest = canConnect && Boolean(values.model.trim());
  const models =
    list.data?.models.filter((id) => id.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ??
    [];
  function change(update: Partial<ModelDraft>) {
    probe.reset();
    if (
      update.baseUrl !== undefined ||
      update.apiKey !== undefined ||
      update.clearKey !== undefined
    ) {
      list.reset();
      setListOpen(false);
    }
    onChange(update);
  }
  return (
    <Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Label strong>{tr("模型连接")}</Label>
        </View>
        {onClose && <Button onPress={onClose}>{tr("收起设置")}</Button>}
      </Row>
      <Field
        disabled={pending}
        value={values.baseUrl}
        onChangeText={(baseUrl) => change({ baseUrl })}
        placeholder={tr("API 地址，例如 https://api.example.com/v1")}
      />
      <Field
        disabled={pending}
        value={values.apiKey}
        onChangeText={(apiKey) => change({ apiKey, clearKey: false })}
        placeholder={values.hasKey ? tr("API Key 已保存，留空保留") : tr("API Key（可选）")}
        secure
      />
      <Field
        disabled={pending}
        value={values.model}
        onChangeText={(model) => change({ model })}
        placeholder={tr("模型名称")}
      />
      <Row>
        <Button disabled={pending || !canConnect} onPress={() => list.mutate()}>
          {list.isPending ? tr("正在获取…") : tr("获取模型列表")}
        </Button>
        {list.data && !listOpen && (
          <Button disabled={pending} onPress={() => setListOpen(true)}>
            {tr("选择模型")}
          </Button>
        )}
        <Button disabled={pending || !canTest} onPress={() => probe.mutate()}>
          {probe.isPending ? tr("正在测试…") : tr("测试连接")}
        </Button>
      </Row>
      {list.isError && <Label error>{tr(list.error.message)}</Label>}
      {listOpen && list.data && (
        <View style={{ gap: 8 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Label muted>
                {list.data.models.length} {tr("个模型 · 也可手动填写")}
              </Label>
            </View>
            <Button onPress={() => setListOpen(false)}>{tr("收起列表")}</Button>
          </Row>
          <Field value={search} onChangeText={setSearch} placeholder={tr("搜索模型")} />
          <ScrollView
            style={{ maxHeight: 180 }}
            contentContainerStyle={{ gap: 2 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {models.map((id) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={tr("选择模型 {0}", { "0": id })}
                accessibilityState={{ selected: values.model === id }}
                onPress={() => {
                  change({ model: id });
                  setListOpen(false);
                }}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  backgroundColor: values.model === id ? colors.surface2 : colors.surface0,
                }}
              >
                <Text style={{ color: colors.foreground, fontSize: 14 }}>{id}</Text>
              </Pressable>
            ))}
            {!models.length && <Label muted>{tr("无匹配模型，可手动填写。")}</Label>}
          </ScrollView>
        </View>
      )}
      {probe.isError && <Label error>{tr(probe.error.message)}</Label>}
      {probe.isSuccess && (
        <Label>
          {tr("连接正常 ·")}
          {probe.data.latencyMs} {tr("ms · JSON 测试通过")}
        </Label>
      )}
      {error && <Label error>{tr(error)}</Label>}
      <Row>
        <Button disabled={pending || !canTest} onPress={onSave}>
          {saving ? tr("正在保存…") : error ? tr("重试保存模型") : tr("保存模型配置")}
        </Button>
        {values.hasKey && (
          <Button
            disabled={pending}
            onPress={() => change({ clearKey: !values.clearKey, apiKey: "" })}
          >
            {values.clearKey ? tr("将清除凭据 · 撤销") : tr("清除已保存凭据")}
          </Button>
        )}
      </Row>
    </Card>
  );
}
