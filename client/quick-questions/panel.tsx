import { tr, useLocale } from "../i18n";
import { useReducer } from "react";
import { ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import {
  questionKey,
  saveQuestions,
  saveSummarySettings,
  type Question,
  type Workspace,
} from "../../shared/quick-questions/contracts";
import { useQuestions, workspaceKey } from "./queries";
import { Summary } from "./summary";
import { QuestionActions } from "./question-actions";
import { PromptSettings } from "./prompt-settings";
import { ModelConfiguration } from "../models/settings";
import { Button, Card, Field, Label, Row, Surface } from "./ui";

interface EditorState {
  revision: number;
  questions: Question[];
  enabled: boolean;
  newText: string;
  notice: string;
  source: "none" | "manual" | "history";
  modelOpen: boolean;
  promptOpen: boolean;
  summaryPrompt: string;
  editingId: string | null;
  deletingId: string | null;
}
function initial(data: Workspace): EditorState {
  return {
    revision: data.revision,
    questions: data.questions,
    enabled: data.enabled,
    newText: "",
    notice: "",
    source: "none",
    modelOpen: false,
    promptOpen: false,
    summaryPrompt: data.summaryPrompt,
    editingId: null,
    deletingId: null,
  };
}
export function QuickQuestionsPanel(props: PluginWorkspacePanelProps) {
  useLocale();
  const query = useQuestions(props.host.id, props.workspaceId);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}
      keyboardShouldPersistTaps="handled"
    >
      <Surface theme={props.theme}>
        {query.isPending && <Label>{tr("正在读取快捷提问…")}</Label>}
        {query.isError && (
          <>
            <Label error>{tr(query.error.message)}</Label>
            <Button
              onPress={() => {
                void query.refetch();
              }}
            >
              {tr("重试")}
            </Button>
          </>
        )}
        {query.data && (
          <Editor key={`${props.host.id}:${props.workspaceId}`} {...props} data={query.data} />
        )}
      </Surface>
    </ScrollView>
  );
}
function Editor(props: PluginWorkspacePanelProps & { data: Workspace }) {
  const [state, patch] = useReducer(
    (previous: EditorState, update: Partial<EditorState>) => ({ ...previous, ...update }),
    props.data,
    initial,
  );
  const cache = useQueryClient();
  const save = useRpc(saveQuestions);
  const configureSummary = useRpc(saveSummarySettings);
  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        workspaceId: props.workspaceId,
        revision: state.revision,
        enabled: state.enabled,
        questions: state.questions,
      }),
    onSuccess: (data) => {
      patch({ revision: data.revision, notice: tr("快捷提问已保存，各设备将同步更新。") });
      cache.setQueryData(workspaceKey(props.host.id, props.workspaceId), data);
    },
  });
  const promptMutation = useMutation({
    mutationFn: () =>
      configureSummary({
        workspaceId: props.workspaceId,
        revision: state.revision,
        historyLimit: props.data.historyLimit,
        summaryPrompt: state.summaryPrompt,
      }),
    onSuccess: (data) => {
      patch({
        revision: data.revision,
        summaryPrompt: data.summaryPrompt,
        notice: tr("总结提示词已保存。"),
      });
      cache.setQueryData(workspaceKey(props.host.id, props.workspaceId), data);
    },
  });
  const busy = saveMutation.isPending || promptMutation.isPending;
  function edit(id: string, text: string) {
    patch({
      questions: state.questions.map((q) => (q.id === id ? { ...q, text } : q)),
      notice: "",
    });
  }
  function move(index: number, offset: number) {
    const questions = [...state.questions];
    const destination = index + offset;
    [questions[index], questions[destination]] = [questions[destination], questions[index]];
    patch({ questions, notice: "" });
  }
  function add(questions: Question[]) {
    const keys = new Set(state.questions.map((q) => questionKey(q.text)));
    const added: Question[] = [];
    for (const q of questions) {
      const key = questionKey(q.text);
      if (keys.has(key)) continue;
      keys.add(key);
      added.push({ ...q, id: `question-${Date.now()}-${Math.random().toString(36).slice(2)}` });
    }
    patch({
      questions: [...state.questions, ...added],
      newText: "",
      source: state.source === "manual" ? "none" : state.source,
      notice: tr("已加入 {0} 条，跳过 {1} 条重复话术。请保存。", {
        "0": added.length,
        "1": questions.length - added.length,
      }),
    });
  }
  const invalid = state.questions.some((q) => !q.text.trim() || q.text.length > 8000);
  const modelConfigured = Boolean(props.data.model.baseUrl && props.data.model.model);
  const dirty =
    state.enabled !== props.data.enabled ||
    JSON.stringify(state.questions) !== JSON.stringify(props.data.questions);
  return (
    <View style={{ gap: 18, maxWidth: 840, width: "100%", alignSelf: "center" }}>
      <Row>
        <View style={{ flex: 1, minWidth: 160, gap: 4 }}>
          <Label strong>
            {tr("快捷提问 ·")}
            {state.questions.length}
          </Label>
          <Label muted>{tr("当前工作空间的话术库")}</Label>
        </View>
        <Button primary disabled={busy || invalid || !dirty} onPress={() => saveMutation.mutate()}>
          {saveMutation.isPending ? tr("正在保存…") : dirty ? tr("保存修改") : tr("已保存")}
        </Button>
      </Row>
      <Row>
        <Button
          disabled={busy}
          onPress={() => patch({ source: state.source === "manual" ? "none" : "manual" })}
        >
          {tr("＋ 手动添加")}
        </Button>
        <Button onPress={() => patch({ source: state.source === "history" ? "none" : "history" })}>
          {tr("从工作区对话总结")}
        </Button>
        <Button onPress={() => patch({ modelOpen: !state.modelOpen })}>
          {state.modelOpen ? tr("收起模型设置") : tr("模型设置")}
        </Button>
      </Row>
      {state.notice !== "" && <Label>{tr(state.notice)}</Label>}
      {saveMutation.isError && (
        <Row>
          <Label error>{tr(saveMutation.error.message)}</Label>
          <Button disabled={busy || invalid} onPress={() => saveMutation.mutate()}>
            {tr("重试保存")}
          </Button>
        </Row>
      )}
      {props.data.revision !== state.revision && (
        <Card>
          <Label error>
            {tr("其他设备已更新。当前草稿仍保留，请复制需要的内容后载入最新版本。")}
          </Label>
          <Button
            disabled={busy}
            onPress={() => {
              patch(initial(props.data));
              saveMutation.reset();
              promptMutation.reset();
            }}
          >
            {tr("放弃草稿并载入最新版本")}
          </Button>
        </Card>
      )}
      {!modelConfigured && state.source !== "history" && (
        <Row>
          <Label error>{tr("尚未配置 Toolkit 模型，暂时无法从历史生成问题。")}</Label>
          <Button onPress={() => patch({ modelOpen: true })}>{tr("配置模型")}</Button>
        </Row>
      )}
      {state.modelOpen && (
        <ModelConfiguration
          hostId={props.host.id}
          workspaceId={props.workspaceId}
          onClose={() => patch({ modelOpen: false })}
        />
      )}
      {state.source === "manual" && (
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Label strong>{tr("添加快捷提问")}</Label>
            </View>
            <Button onPress={() => patch({ source: "none" })}>{tr("取消")}</Button>
          </Row>
          <Field
            disabled={busy}
            value={state.newText}
            onChangeText={(newText) => patch({ newText })}
            placeholder={tr("例如：检查当前服务器集群的健康状态")}
            multiline
          />
          <Button
            disabled={busy || !state.newText.trim() || state.newText.length > 8000}
            onPress={() =>
              add([
                {
                  id: "new",
                  text: state.newText.trim(),
                  origin: "custom",
                  frequency: 0,
                  sources: [],
                },
              ])
            }
          >
            {tr("添加到问题库")}
          </Button>
        </Card>
      )}
      <Summary
        {...props}
        expanded={state.source === "history"}
        onToggle={() => patch({ source: state.source === "history" ? "none" : "history" })}
        modelConfigured={modelConfigured}
        onConfigure={() => patch({ modelOpen: true })}
        onAdd={add}
        promptSettings={
          state.promptOpen ? (
            <PromptSettings
              value={state.summaryPrompt}
              savedValue={props.data.summaryPrompt}
              onChange={(summaryPrompt) => {
                patch({ summaryPrompt });
                promptMutation.reset();
              }}
              onSave={() => promptMutation.mutate()}
              onClose={() => patch({ promptOpen: false })}
              busy={busy}
              saving={promptMutation.isPending}
              error={promptMutation.error?.message ?? null}
            />
          ) : (
            <Row>
              <Button onPress={() => patch({ promptOpen: true })}>{tr("总结提示词")}</Button>
            </Row>
          )
        }
        settings={{
          revision: state.revision,
          historyLimit: props.data.historyLimit,
        }}
        onSettingsSaved={(data) => {
          patch({ revision: data.revision });
          cache.setQueryData(workspaceKey(props.host.id, props.workspaceId), data);
        }}
      />
      {!props.data.featureEnabled && (
        <Label muted>{tr("主机已停用快捷提问，可在 Toolkit 功能设置中启用。")}</Label>
      )}
      {invalid && <Label error>{tr("话术不能为空，且每条不超过 8000 字符。")}</Label>}
      {!state.questions.length && (
        <Card>
          <Label strong>{tr("还没有快捷提问")}</Label>
          <Label muted>{tr("点击上方“手动添加”，或者从工作区对话中总结候选问题。")}</Label>
        </Card>
      )}
      {state.questions.map((q, index) => (
        <Card key={q.id}>
          <Row>
            <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
              <Label>
                {index + 1}. {q.text}
              </Label>
              <Label muted>
                {q.origin === "history"
                  ? tr("来自历史总结 · 约 {0} 次", { "0": q.frequency })
                  : tr("手动添加")}
              </Label>
            </View>
            <QuestionActions
              index={index}
              editing={state.editingId === q.id}
              confirming={state.deletingId === q.id}
              busy={busy}
              onEdit={() =>
                patch({ editingId: state.editingId === q.id ? null : q.id, deletingId: null })
              }
              onRequestDelete={() => patch({ deletingId: q.id })}
              onCancel={() => patch({ deletingId: null })}
              onConfirm={() =>
                patch({
                  questions: state.questions.filter((item) => item.id !== q.id),
                  editingId: state.editingId === q.id ? null : state.editingId,
                  deletingId: null,
                  notice: tr("已从草稿移除，请保存修改。"),
                })
              }
            />
          </Row>
          {state.editingId === q.id && (
            <View style={{ gap: 10 }}>
              <Field
                disabled={busy}
                value={q.text}
                onChangeText={(text) => edit(q.id, text)}
                placeholder={tr("快捷提问话术")}
                multiline
              />
              <Row>
                <Button disabled={busy || index === 0} onPress={() => move(index, -1)}>
                  {tr("上移")}
                </Button>
                <Button
                  disabled={busy || index === state.questions.length - 1}
                  onPress={() => move(index, 1)}
                >
                  {tr("下移")}
                </Button>
              </Row>
            </View>
          )}
        </Card>
      ))}
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Label muted>
            {modelConfigured ? tr("模型：{0}", { "0": props.data.model.model }) : tr("总结模型")}
          </Label>
        </View>
        <Button disabled={busy} onPress={() => patch({ enabled: !state.enabled, notice: "" })}>
          {state.enabled ? tr("快捷入口已启用") : tr("快捷入口已停用")}
        </Button>
      </Row>
    </View>
  );
}
