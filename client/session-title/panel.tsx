import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePaseo, useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent } from "@getpaseo/client";
import { ActivityIndicator, FlatList, Pressable, Text, View, type ViewToken } from "react-native";
import { countSessionTurns, listTitles, startTitle, type TitleJob } from "../../shared/session-title/contracts";
import { tr, useLocale } from "../i18n";
import { Button, Field, Label, Row, Surface } from "../quick-questions/ui";
import { formatSessionTime, readWorkspaceSessions, sessionTime } from "./sessions";

type Filter = "all" | "active" | "archived";
type NamingStatus = { agentId: string; at: string | null; phase: TitleJob["phase"] | null };
const busyPhase = (phase?: TitleJob["phase"] | null) =>
  phase === "queued" || phase === "reading" || phase === "summarizing" || phase === "applying";
export function SessionTitlePanel(props: PluginWorkspacePanelProps) {
  const locale = useLocale();
  const paseo = usePaseo();
  const cache = useQueryClient();
  const listStatus = useRpc(listTitles);
  const statusKey = ["toolkit", "session-naming-status", props.host.id, props.workspaceId];
  const status = useQuery({
    queryKey: statusKey,
    queryFn: async (): Promise<NamingStatus[]> =>
      (await listStatus({ workspaceId: props.workspaceId })).map(({ agentId, at, phase }) => ({ agentId, at, phase })),
    refetchInterval: (query) => query.state.data?.some((entry) => busyPhase(entry.phase)) ? 600 : 3000,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["toolkit", "workspace-sessions", props.host.id, props.workspaceId],
    queryFn: ({ signal }) => readWorkspaceSessions(paseo, props.workspaceId, signal),
    refetchInterval: 5000,
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, select] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<PaseoAgent>[] }) =>
    setVisible(new Set(viewableItems.map(({ item }) => item.id))),
  ).current;
  const sessions = (query.data ?? []).filter(
    (agent) =>
      (filter === "all" || Boolean(agent.archivedAt) === (filter === "archived")) &&
      `${agent.title ?? ""} ${agent.id}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const open = (agentId: string) =>
    props.navigation?.openAgent({ agentId, serverId: props.host.id });
  return (
    <View style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}>
      <Surface theme={props.theme} compact={props.layout.compact}>
        <Label strong>{tr("会话列表（{0}）", { "0": sessions.length })}</Label>
        <Row>
          {(
            [
              ["all", "全部"],
              ["active", "进行中"],
              ["archived", "已归档"],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} primary={filter === value} onPress={() => setFilter(value)}>
              {tr(label)}
            </Button>
          ))}
          <Button
            onPress={() => {
              void query.refetch();
              void status.refetch();
              void cache.invalidateQueries({
                queryKey: ["toolkit", "session-turns", props.host.id, props.workspaceId],
              });
            }}
          >
            {tr("刷新")}
          </Button>
        </Row>
        <Field value={search} onChangeText={setSearch} placeholder={tr("搜索会话")} />
        {query.isError ? <Label error>{tr("会话列表读取失败，请刷新重试。")}</Label> : null}
        {!props.navigation ? (
          <Label error>{tr("当前客户端不支持会话导航，请更新 Paseo。")}</Label>
        ) : null}
      </Surface>
      <FlatList
        data={sessions}
        keyExtractor={(agent) => agent.id}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={5}
        onViewableItemsChanged={viewable}
        contentContainerStyle={{
          paddingHorizontal: props.layout.compact ? 10 : 16,
          paddingBottom: 16,
        }}
        ListEmptyComponent={
          <Text style={{ color: props.theme.colors.foregroundMuted, padding: 12 }}>
            {tr(query.isPending ? "正在读取会话列表…" : "暂无匹配会话")}
          </Text>
        }
        renderItem={({ item, index }) => (
          <SessionRow
            key={`${props.host.id}:${item.id}`}
            agent={item}
            index={index}
            props={props}
            time={formatSessionTime(sessionTime(item), now, locale)}
            status={status.data?.find((entry) => entry.agentId === item.id)}
            started={(job) => {
              cache.setQueryData<NamingStatus[]>(statusKey, (old = []) => [
                ...old.filter((entry) => entry.agentId !== item.id),
                { agentId: item.id, at: job.at ?? new Date().toISOString(), phase: job.phase },
              ]);
              void status.refetch();
            }}
            selected={selected === item.id}
            visible={visible.has(item.id) || (!visible.size && index < 12)}
            select={() => select(item.id)}
            open={() => open(item.id)}
          />
        )}
      />
    </View>
  );
}
function SessionRow({
  agent,
  index,
  props,
  time,
  status,
  started,
  selected,
  visible,
  select,
  open,
}: {
  agent: PaseoAgent;
  index: number;
  props: PluginWorkspacePanelProps;
  time: string;
  status?: NamingStatus;
  started(job: TitleJob): void;
  selected: boolean;
  visible: boolean;
  select(): void;
  open(): void;
}) {
  const colors = props.theme.colors;
  const count = useRpc(countSessionTurns);
  const start = useRpc(startTitle);
  const lastPress = useRef<number | null>(null);
  const turns = useQuery({
    queryKey: [
      "toolkit",
      "session-turns",
      props.host.id,
      props.workspaceId,
      agent.id,
      agent.lastUserMessageAt ?? agent.updatedAt,
      agent.updatedAt,
    ],
    queryFn: () => count({ agentId: agent.id, workspaceId: props.workspaceId }),
    enabled: visible,
    staleTime: Infinity,
    retry: false,
  });
  const naming = useMutation({
    mutationFn: () => start({ agentId: agent.id }),
    onSuccess: started,
  });
  const phase = naming.data && (!status?.at || (naming.data.at && status.at < naming.data.at))
    ? naming.data.phase
    : status?.phase;
  const busy = naming.isPending || busyPhase(phase);
  const stage = phase === "summarizing" || phase === "applying" ? "生成标题" : "总结对话";
  const title = agent.title?.trim() || tr("未命名会话");
  const press = () => {
    select();
    const now = Date.now();
    if (lastPress.current !== null && now - lastPress.current < 400) {
      lastPress.current = null;
      open();
    } else lastPress.current = now;
  };
  return (
    <View
      style={{
        marginBottom: 6,
        borderWidth: 1,
        borderRadius: 8,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.surface1 : colors.surface0,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 6 }}>
        <Text
          style={{ width: 28, textAlign: "center", color: colors.foregroundMuted, fontSize: 12 }}
        >
          {index + 1}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={tr("双击打开会话")}
          accessibilityState={{ selected }}
          onPress={press}
          style={{ flex: 1, minWidth: 0, padding: 6, gap: 5 }}
        >
          <Text
            numberOfLines={2}
            style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}
          >
            {title}
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
            {time} ·{" "}
            {tr("{0} 轮", { "0": turns.data?.count ?? "—" })} ·{" "}
            {tr(agent.archivedAt ? "已归档" : "进行中")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("打开会话：{0}", { "0": title })}
          disabled={!props.navigation}
          onPress={open}
          style={{ padding: 8 }}
        >
          <Icon name="ArrowUpRight" size={16} color={colors.foregroundMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("智能命名：{0}", { "0": title })}
          accessibilityState={{ busy, disabled: busy || !!agent.activeTurn || (!agent.archivedAt && agent.status !== "idle") }}
          disabled={
            busy || !!agent.activeTurn || (!agent.archivedAt && agent.status !== "idle")
          }
          onPress={() => naming.mutate()}
          style={{ padding: 8, alignItems: "center", gap: 4 }}
        >
          {busy ? (
            <>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>{tr(stage)}</Text>
            </>
          ) : <Icon name="NotebookPen" size={16} color={colors.foregroundMuted} />}
        </Pressable>
      </View>
      {naming.isError || phase === "error" ? (
        <Text style={{ color: colors.statusDanger, paddingHorizontal: 12, paddingBottom: 8 }}>
          {tr("命名失败，请重试。")}
        </Text>
      ) : null}
    </View>
  );
}
