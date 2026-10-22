import { useSummary, summaryKey } from "./queries";
import { tr } from "../i18n";
import { useReducer, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import {
  cancelSummary,
  isWorking,
  historyLimitSchema,
  saveSummarySettings,
  removeCandidate,
  startSummary,
  type Job,
  type Question,
  type Workspace,
} from "../../shared/quick-questions/contracts";
import { Button, Card, Field, Label, Row, useColors } from "./ui";

interface SummaryProps extends PluginWorkspacePanelProps {
  onAdd(questions: Question[]): void;
  promptSettings: ReactNode;
  expanded: boolean;
  onToggle(): void;
  modelConfigured: boolean;
  onConfigure(): void;
  settings: Pick<Workspace, "revision" | "historyLimit">;
  onSettingsSaved(settings: Workspace): void;
}
export function Summary({
  workspaceId,
  host,
  navigation,
  onAdd,
  promptSettings,
  expanded,
  onToggle,
  modelConfigured,
  onConfigure,
  settings,
  onSettingsSaved,
}: SummaryProps) {
  const [limitText, setLimitText] = useReducer(
    (_previous: string, value: string) => value,
    String(settings.historyLimit),
  );
  const limit = Number(limitText);
  const validLimit = historyLimitSchema.safeParse(limit).success;
  const settingsChanged = limit !== settings.historyLimit;
  const saveLimit = useRpc(saveSummarySettings);
  const limitMutation = useMutation({
    mutationFn: () =>
      saveLimit({
        workspaceId,
        revision: settings.revision,
        historyLimit: limit,
      }),
    onSuccess: onSettingsSaved,
  });
  const start = useRpc(startSummary);
  const cancel = useRpc(cancelSummary);
  const cache = useQueryClient();
  const queryKey = summaryKey(host.id, workspaceId);
  const job = useSummary(host.id, workspaceId, expanded);
  const startMutation = useMutation({
    mutationFn: async () => {
      if (settingsChanged) await limitMutation.mutateAsync();
      return start({ workspaceId });
    },
    onSuccess: (data) => {
      cache.setQueryData(queryKey, data);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancel({ workspaceId }),
    onSuccess: () => {
      void job.refetch();
    },
  });
  const working = isWorking(job.data);
  const labels = {
    reading: tr("读取历史"),
    summarizing: tr("分批总结"),
    merging: tr("合并候选"),
    done: tr("候选问题已就绪"),
    error: tr("总结失败"),
    canceled: tr("总结已取消"),
  };
  let startLabel = tr("开始总结");
  if (job.data?.phase === "error" || startMutation.isError) startLabel = tr("重试总结");
  else if (job.data?.phase === "canceled") startLabel = tr("重新开始");
  else if (job.data?.phase === "done")
    startLabel = job.data.failed.length ? tr("重试总结（含失败对话）") : tr("重新总结");
  let detailsLabel = tr("查看详情");
  if (working) detailsLabel = tr("查看进度");
  else if (job.data?.phase === "done") detailsLabel = tr("查看候选");
  if (!expanded && !job.data && !job.isError) return null;
  return (
    <Card>
      <Row>
        <View style={{ flex: 1, minWidth: 160, gap: 4 }}>
          <Label strong>{tr("从工作区对话总结")}</Label>
          {!expanded && job.data && (
            <Label muted>
              {labels[job.data.phase]} · {job.data.completed}/{job.data.total}
            </Label>
          )}
        </View>
        <Button onPress={onToggle}>{expanded ? tr("收起") : detailsLabel}</Button>
      </Row>
      {expanded && (
        <View style={{ gap: 12 }}>
          <Label muted>{tr("从当前工作空间（含归档）最近的用户提问中提炼最多 20 条候选。")}</Label>
          <Row>
            <Label>{tr("最近")}</Label>
            <View style={{ width: 80 }}>
              <Field
                value={limitText}
                onChangeText={(value) => {
                  setLimitText(value);
                  limitMutation.reset();
                }}
                placeholder={tr("历史条数")}
                disabled={working || startMutation.isPending || limitMutation.isPending}
              />
            </View>
            <Label>{tr("条用户提问")}</Label>
            <Button
              disabled={
                !validLimit ||
                !settingsChanged ||
                working ||
                startMutation.isPending ||
                limitMutation.isPending
              }
              onPress={() => limitMutation.mutate()}
            >
              {limitMutation.isPending
                ? tr("保存中…")
                : settingsChanged
                  ? tr("保存设置")
                  : tr("已保存")}
            </Button>
          </Row>
          {!validLimit && <Label error>{tr("历史条数必须为正整数。")}</Label>}
          {limitMutation.isError && !startMutation.isError && (
            <Label error>{tr(limitMutation.error.message)}</Label>
          )}
          {promptSettings}
          {!modelConfigured && (
            <Row>
              <Label error>{tr("尚未配置总结模型。")}</Label>
              <Button onPress={onConfigure}>{tr("配置模型")}</Button>
            </Row>
          )}
          <Row>
            {!working && (
              <Button
                disabled={
                  !modelConfigured ||
                  !validLimit ||
                  limitMutation.isPending ||
                  startMutation.isPending ||
                  job.isPending
                }
                onPress={() => {
                  cancelMutation.reset();
                  startMutation.mutate();
                }}
              >
                {startMutation.isPending ? tr("正在启动…") : startLabel}
              </Button>
            )}
            {working && (
              <Button disabled={cancelMutation.isPending} onPress={() => cancelMutation.mutate()}>
                {cancelMutation.isPending ? tr("正在取消…") : tr("取消总结")}
              </Button>
            )}
          </Row>
          {job.isError && (
            <>
              <Label error>
                {tr("任务状态读取失败：")}
                {tr(job.error.message)}
              </Label>
              <Button
                onPress={() => {
                  void job.refetch();
                }}
              >
                {tr("重试读取进度")}
              </Button>
            </>
          )}
          {startMutation.isError && <Label error>{tr(startMutation.error.message)}</Label>}
          {cancelMutation.isError && <Label error>{tr(cancelMutation.error.message)}</Label>}
          {job.data && <Progress job={job.data} />}
          {job.data?.phase === "error" && (
            <Label muted>
              {tr("点击“重试总结”将重新读取历史并生成候选，已保存的问题不受影响。")}
            </Label>
          )}
          {job.data?.phase === "done" && (
            <Candidates
              key={job.data.id}
              workspaceId={workspaceId}
              hostId={host.id}
              job={job.data}
              onAdd={onAdd}
              openSource={
                navigation
                  ? (agentId) => navigation.openAgent({ agentId, serverId: host.id })
                  : undefined
              }
            />
          )}
          <Label muted>
            {tr("用户提问和必要的相邻助手文本会发送到已配置的模型服务；频次为分批归并后的估算值。")}
          </Label>
        </View>
      )}
    </Card>
  );
}
function Progress({ job }: { job: Job }) {
  const colors = useColors();
  const [detailsOpen, toggleDetails] = useReducer((open: boolean) => !open, true);
  const progress = job.total ? Math.min(100, Math.round((job.completed / job.total) * 100)) : 0;
  return (
    <View style={{ gap: 10 }}>
      <Label error={job.phase === "error"}>{tr(job.activity)}</Label>
      {isWorking(job) && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: job.total || 1, now: job.completed }}
          style={{ height: 4, backgroundColor: colors.surface2, borderRadius: 2 }}
        >
          <View
            style={{
              height: 4,
              width: `${progress}%`,
              backgroundColor: colors.accent,
              borderRadius: 2,
            }}
          />
        </View>
      )}
      <Label muted>
        {tr("当前阶段 {0}/{1} · 读取成功 {2} 个对话 · 用户提问 {3} 条 · 失败 {4} 个", {
          "0": job.completed,
          "1": job.total,
          "2": job.read,
          "3": job.messageCount,
          "4": job.failed.length,
        })}
      </Label>
      {job.failed.map((failure) => (
        <View key={failure.agentId} style={{ gap: 2 }}>
          <Label error>
            {tr("未读取：")}
            {failure.title}
          </Label>
          <Label muted>{tr(failure.reason)}</Label>
        </View>
      ))}
      <Button onPress={toggleDetails}>
        {detailsOpen ? tr("收起执行详情") : tr("展开执行详情")}
      </Button>
      {detailsOpen && (
        <ScrollView
          style={{ maxHeight: 180 }}
          contentContainerStyle={{ gap: 6 }}
          nestedScrollEnabled
        >
          <Label muted>{tr("最近 100 条记录 · 新记录在前")}</Label>
          {[...job.events].reverse().map((event, index) => (
            <Label
              key={`${event.at}-${index}`}
              error={event.level === "error"}
              muted={event.level !== "error"}
            >
              {new Date(event.at).toLocaleTimeString()} · {tr(event.message)}
            </Label>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
interface CandidateState {
  questions: Question[];
  selected: Set<string>;
  message: string;
}
interface CandidateAction {
  type: "toggle" | "edit" | "first" | "added" | "remove";
  id?: string;
  text?: string;
  count?: number;
  message?: string;
}
function reduceCandidates(state: CandidateState, action: CandidateAction): CandidateState {
  if (action.type === "added")
    return { ...state, message: tr("候选已加入问题库，请点击顶部“保存修改”。") };
  if (action.type === "remove") {
    const selected = new Set(state.selected);
    if (action.id) selected.delete(action.id);
    return {
      ...state,
      questions: state.questions.filter((q) => q.id !== action.id),
      selected,
      message: "",
    };
  }
  if (action.type === "edit")
    return {
      ...state,
      questions: state.questions.map((q) =>
        q.id === action.id ? { ...q, text: action.text ?? "" } : q,
      ),
      message: "",
    };
  if (action.type === "first")
    return {
      ...state,
      selected: new Set(state.questions.slice(0, action.count).map((q) => q.id)),
      message: "",
    };
  const selected = new Set(state.selected);
  if (action.id) {
    if (selected.has(action.id)) selected.delete(action.id);
    else selected.add(action.id);
  }
  return { ...state, selected, message: "" };
}
function Candidates({
  workspaceId,
  hostId,
  job,
  onAdd,
  openSource,
}: {
  workspaceId: string;
  hostId: string;
  job: Job;
  onAdd(questions: Question[]): void;
  openSource?: (id: string) => void;
}) {
  const [state, dispatch] = useReducer(reduceCandidates, {
    questions: job.candidates,
    selected: new Set<string>(),
    message: "",
  });
  const remove = useRpc(removeCandidate);
  const cache = useQueryClient();
  const removeMutation = useMutation({
    mutationFn: (candidateId: string) => remove({ workspaceId, jobId: job.id, candidateId }),
    onSuccess: (data, id) => {
      dispatch({ type: "remove", id });
      cache.setQueryData(["toolkit", "summary", hostId, workspaceId], data);
    },
  });
  const [count, setCount] = useReducer(
    (_previous: string, next: string) => next,
    String(Math.min(10, job.candidates.length)),
  );
  const n = Number(count);
  const validCount = Number.isInteger(n) && n >= 1 && n <= state.questions.length;
  const selected = state.questions.filter((q) => state.selected.has(q.id));
  const invalid = selected.some((q) => !q.text.trim() || q.text.length > 8000);
  return (
    <View style={{ gap: 12 }}>
      {!state.questions.length && <Label muted>{tr("暂无候选提问，可重新总结或手动添加。")}</Label>}
      <Row>
        <View style={{ width: 80 }}>
          <Field value={count} onChangeText={setCount} placeholder="TopN" />
        </View>
        <Button disabled={!validCount} onPress={() => dispatch({ type: "first", count: n })}>
          {tr("选择前 N 条")}
        </Button>
        <Button
          disabled={!selected.length || invalid}
          onPress={() => {
            onAdd(selected);
            dispatch({ type: "added" });
          }}
        >
          {tr("加入所选")}
          {selected.length} {tr("条")}
        </Button>
      </Row>
      {state.message && <Label>{tr(state.message)}</Label>}
      {removeMutation.isError && <Label error>{tr(removeMutation.error.message)}</Label>}
      <View style={{ gap: 4 }}>
        {state.questions.map((q, index) => (
          <CandidateRow
            key={q.id}
            question={q}
            index={index}
            selected={state.selected.has(q.id)}
            onToggle={() => dispatch({ type: "toggle", id: q.id })}
            onEdit={(text) => dispatch({ type: "edit", id: q.id, text })}
            onAdd={() => {
              onAdd([q]);
              dispatch({ type: "added" });
            }}
            onRemove={() => removeMutation.mutate(q.id)}
            removing={removeMutation.isPending}
            openSource={openSource}
          />
        ))}
      </View>
    </View>
  );
}
function CandidateRow({
  question: q,
  index,
  selected,
  onToggle,
  onEdit,
  onAdd,
  onRemove,
  removing,
  openSource,
}: {
  question: Question;
  index: number;
  selected: boolean;
  onToggle(): void;
  onEdit(text: string): void;
  onAdd(): void;
  onRemove(): void;
  removing: boolean;
  openSource?: (id: string) => void;
}) {
  const colors = useColors();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [height, setHeight] = useState(40);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text
          style={{ width: 20, textAlign: "right", color: colors.foregroundMuted, fontSize: 13 }}
        >
          {index + 1}.
        </Text>
        <CandidateAction
          alignStart
          icon={selected ? "SquareCheck" : "Square"}
          label={tr("{0}第 {1} 条 · 约 {2} 次", {
            "0": selected ? tr("取消选择") : tr("选择"),
            "1": index + 1,
            "2": q.frequency,
          })}
          onPress={onToggle}
        />
        <TextInput
          accessibilityLabel={tr("候选问题 {0}", { "0": index + 1 })}
          value={q.text}
          onChangeText={onEdit}
          multiline
          onContentSizeChange={(event) =>
            setHeight(Math.max(40, Math.min(100, event.nativeEvent.contentSize.height)))
          }
          placeholder={tr("候选问题")}
          placeholderTextColor={colors.foregroundMuted}
          style={{
            flex: 1,
            minWidth: 0,
            height,
            paddingHorizontal: 10,
            paddingVertical: 9,
            borderRadius: 6,
            backgroundColor: colors.surface1,
            color: colors.foreground,
            fontSize: 14,
            lineHeight: 21,
            textAlignVertical: "top",
          }}
        />
        <CandidateAction
          icon="Plus"
          label={tr("添加第 {0} 条到快捷提问", { "0": index + 1 })}
          disabled={!q.text.trim() || q.text.length > 8000}
          onPress={onAdd}
        />
        <CandidateAction
          icon="MessagesSquare"
          label={tr("{0}原始对话（{1}）", {
            "0": sourcesOpen ? tr("收起") : tr("查看"),
            "1": q.sources.length,
          })}
          disabled={!q.sources.length}
          onPress={() => setSourcesOpen(!sourcesOpen)}
        />
        <CandidateAction
          icon="Minus"
          label={tr("从候选中移除第 {0} 条", { "0": index + 1 })}
          disabled={removing}
          onPress={onRemove}
        />
      </View>
      {sourcesOpen && (
        <View
          style={{
            marginLeft: 38,
            padding: 8,
            gap: 6,
            borderLeftWidth: 1,
            borderColor: colors.border,
          }}
        >
          {q.sources.map((source, sourceIndex) => (
            <View
              key={`${source.agentId}-${sourceIndex}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                style={{ flex: 1, color: colors.foregroundMuted, fontSize: 13, lineHeight: 19 }}
              >
                {source.question}
              </Text>
              {openSource && (
                <CandidateAction
                  icon="ExternalLink"
                  label={tr("打开原始对话 {0}", { "0": sourceIndex + 1 })}
                  onPress={() => openSource(source.agentId)}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
function CandidateAction({
  icon,
  label,
  onPress,
  disabled = false,
  alignStart = false,
}: {
  icon: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  alignStart?: boolean;
}) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);
  return (
    <View style={{ zIndex: hovered ? 1 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          width: 34,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          backgroundColor: hovered && !disabled ? colors.surface2 : "transparent",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name={icon} size={16} color={colors.foregroundMuted} />
      </Pressable>
      {hovered && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 42,
            ...(alignStart ? { left: 0 } : { right: 0 }),
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 5,
            paddingHorizontal: 8,
            paddingVertical: 4,
            minWidth: 160,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12 }}>{label}</Text>
        </View>
      )}
    </View>
  );
}
