import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  applyTitle,
  cancelTitle,
  listTitles,
  readTitle,
  startTitle,
  working,
  type TitleJob,
} from "../../shared/session-title/contracts";
import { tr, useLocale } from "../i18n";
import { Button, Card, Field, Label, Row, Surface, useColors } from "../quick-questions/ui";

const phases: Record<TitleJob["phase"], string> = {
  queued: "已排队",
  reading: "读取历史",
  summarizing: "生成标题",
  applying: "写回标题",
  done: "已完成",
  error: "失败",
  canceled: "已取消",
};
const sources: Record<TitleJob["source"], string> = {
  automatic: "轮次触发",
  command: "手动命名",
  archive: "总结归档",
};
function time(at?: string | null) {
  return at ? new Date(at).toLocaleString() : tr("暂无记录");
}

export function SessionTitlePanel(props: PluginWorkspacePanelProps) {
  useLocale();
  const list = useRpc(listTitles);
  const query = useQuery({
    queryKey: ["toolkit", "title-list", props.host.id, props.workspaceId],
    queryFn: () => list({ workspaceId: props.workspaceId }),
    refetchInterval: 3000,
  });
  const [agentId, select] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [narrow, setNarrow] = useState(props.layout.compact);
  const sessions = query.data ?? [];
  const filtered = sessions.filter((entry) =>
    `${entry.title ?? ""} ${entry.agentId}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const current = sessions.find((entry) => entry.agentId === agentId) ?? sessions[0];
  return (
    <ScrollView style={{ flex: 1 }}>
      <Surface theme={props.theme} compact={props.layout.compact}>
        <View
          onLayout={(event) => setNarrow(event.nativeEvent.layout.width < 680)}
          style={{ gap: 14 }}
        >
          <Text style={{ color: props.theme.colors.foreground, fontSize: 18, fontWeight: "600" }}>
            {tr("智能命名")}
          </Text>
          <Label muted>{tr("会话命名与归档记录，后台处理不会打断对话。")}</Label>
          {query.isError ? (
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
          ) : null}
          <View
            style={{ flexDirection: narrow ? "column" : "row", gap: 16, alignItems: "stretch" }}
          >
            <View style={{ gap: 10, width: narrow ? "100%" : 240 }}>
              <Label strong>{tr("会话列表（{0}）", { "0": String(sessions.length) })}</Label>
              <Field value={search} onChangeText={setSearch} placeholder={tr("搜索会话")} />
              <ScrollView style={{ maxHeight: narrow ? 200 : 460 }}>
                <View style={{ gap: 6 }}>
                  {filtered.map((entry) => (
                    <SessionRow
                      key={entry.agentId}
                      title={entry.title || tr("未命名会话")}
                      selected={entry.agentId === current?.agentId}
                      detail={`${entry.archived ? tr("已归档") : tr("会话中")} · ${tr("{0} 次记录", { "0": String(entry.runs) })}${entry.phase ? ` · ${tr(phases[entry.phase])}` : ""}`}
                      onPress={() => select(entry.agentId)}
                    />
                  ))}
                  {!filtered.length ? (
                    <Label muted>
                      {tr(
                        query.isPending
                          ? "正在读取会话总结…"
                          : "暂无匹配会话；命名后会出现在这里。",
                      )}
                    </Label>
                  ) : null}
                </View>
              </ScrollView>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              {current ? (
                <>
                  <Label strong>{current.title || tr("未命名会话")}</Label>
                  <TitleContent
                    key={current.agentId}
                    agentId={current.agentId}
                    hostId={props.host.id}
                  />
                </>
              ) : (
                <Label muted>{tr("选择会话后查看当次命名结果与历史记录。")}</Label>
              )}
            </View>
          </View>
        </View>
      </Surface>
    </ScrollView>
  );
}
function SessionRow({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress(): void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        padding: 10,
        gap: 4,
        borderWidth: 1,
        borderRadius: 8,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
        {title}
      </Text>
      <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>{detail}</Text>
    </Pressable>
  );
}
export function TitleContent({ agentId, hostId }: { agentId: string; hostId: string }) {
  const read = useRpc(readTitle),
    start = useRpc(startTitle),
    cancel = useRpc(cancelTitle),
    apply = useRpc(applyTitle);
  const [runId, selectRun] = useState<string | null>(null);
  const [details, showDetails] = useState(false);
  const cache = useQueryClient();
  const key = ["toolkit", "session-title", hostId, agentId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => read({ agentId }),
    refetchInterval: (query) => (working(query.state.data?.job) ? 600 : 3000),
  });
  const mutation = useMutation({
    mutationFn: async (action: "start" | "cancel" | "apply") => {
      if (action === "start") {
        selectRun(null);
        await start({ agentId });
      }
      if (action === "cancel") await cancel({ agentId });
      if (action === "apply" && query.data?.result)
        await apply({ agentId, resultId: query.data.result.id });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: key });
      await cache.invalidateQueries({ queryKey: ["toolkit", "title-list", hostId] });
    },
  });
  if (query.isPending) return <Label>{tr("正在读取会话总结…")}</Label>;
  if (query.isError)
    return (
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
    );
  const { job, rounds, protected: protectedTitle } = query.data;
  const history = (query.data.history ?? []).map((entry) => (entry.id === job?.id ? job : entry));
  if (job && !history.some((entry) => entry.id === job.id)) history.push(job);
  const selected = (runId ? history.find((entry) => entry.id === runId) : job) ?? history.at(-1);
  const latest = !runId || selected?.id === job?.id;
  const result = selected ? selected.result : query.data.result;
  const error = selected?.error ?? (latest ? query.data.error : null);
  const busy = working(job);
  return (
    <>
      <Row>
        <Button disabled={busy || mutation.isPending} onPress={() => mutation.mutate("start")}>
          {tr("重新命名")}
        </Button>
        {busy ? (
          <Button disabled={mutation.isPending} onPress={() => mutation.mutate("cancel")}>
            {tr("取消总结")}
          </Button>
        ) : null}
      </Row>
      {history.length ? (
        <>
          <Label strong>{tr("命名记录")}</Label>
          <ScrollView horizontal>
            <Row>
              {[...history].reverse().map((entry) => (
                <Button
                  key={entry.id}
                  primary={selected?.id === entry.id}
                  onPress={() => selectRun(entry.id)}
                >{`${time(entry.at)} · ${tr(phases[entry.phase])}`}</Button>
              ))}
            </Row>
          </ScrollView>
        </>
      ) : null}
      <Row>
        <Label muted>{selected ? tr(sources[selected.source]) : tr("历史结果")}</Label>
        <Label strong>{selected ? tr(phases[selected.phase]) : tr("暂无记录")}</Label>
      </Row>
      {selected?.phase === "summarizing" ? (
        <Label>
          {tr("正在总结分段 {0}/{1}", {
            "0": String(Math.min(selected.completed + 1, selected.total || 1)),
            "1": String(selected.total),
          })}
        </Label>
      ) : null}
      {error ? (
        <Card>
          <Label error>{tr(error)}</Label>
        </Card>
      ) : null}
      {mutation.isError ? <Label error>{tr(mutation.error.message)}</Label> : null}
      {mutation.isSuccess && mutation.variables === "apply" ? (
        <Label>{tr("标题已应用。")}</Label>
      ) : null}
      {result ? (
        <>
          <Card>
            <Label muted>
              {tr("原有标题：{0}", { "0": result.previousTitle ?? tr("未命名会话") })}
            </Label>
            <Label strong>{tr("生成标题：{0}", { "0": result.analysis.title })}</Label>
            <Label muted>{result.analysis.reason}</Label>
            <Label muted>{tr(result.applied ? "当次标题已设置" : "当次标题未写回")}</Label>
            {latest && !result.applied ? (
              <Button
                primary
                disabled={busy || mutation.isPending}
                onPress={() => mutation.mutate("apply")}
              >
                {tr("应用推荐标题")}
              </Button>
            ) : null}
          </Card>
          <Card>
            <Label strong>{tr("会话摘要")}</Label>
            <Label>{result.analysis.summary}</Label>
          </Card>
        </>
      ) : null}
      <Button onPress={() => showDetails(!details)}>{tr(details ? "收起详情" : "详细信息")}</Button>
      {details ? (
        <Card>
          <Label muted>{tr("会话 ID：{0}", { "0": agentId })}</Label>
          <Label muted>{tr("已处理自动轮数：{0}", { "0": String(rounds ?? 0) })}</Label>
          {protectedTitle ? (
            <Label muted>{tr("此会话已暂停自动命名，以保护人工标题或无法确认的轮次边界。")}</Label>
          ) : null}
          {result ? (
            <>
              <Label muted>
                {tr("覆盖 {0} 条用户与助手消息 · 截至位置 {1}", {
                  "0": String(result.messages),
                  "1": String(result.through),
                })}
              </Label>
              <Label muted>{time(result.at)}</Label>
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
