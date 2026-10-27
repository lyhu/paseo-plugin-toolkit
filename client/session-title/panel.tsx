import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePaseo, useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/react-native";
import type { PaseoAgent } from "@getpaseo/client";
import {
  ActivityIndicator,
  FlatList,
  Modal as NativeModal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import {
  countSessionTurns,
  listTitles,
  startTitle,
  renameTitle,
  deleteSession,
  type TitleJob,
} from "../../shared/session-title/contracts";
import { tr, useLocale } from "../i18n";
import { Button, Field, Label, Surface } from "../quick-questions/ui";
import {
  formatSessionTime,
  readWorkspaceSessions,
  sessionTime,
  sessionActionError,
} from "./sessions";

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
      (await listStatus({ workspaceId: props.workspaceId })).map(({ agentId, at, phase }) => ({
        agentId,
        at,
        phase,
      })),
    refetchInterval: (query) =>
      query.state.data?.some((entry) => busyPhase(entry.phase)) ? 600 : 3000,
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: props.theme.colors.foreground,
              fontSize: 14,
              fontWeight: "500",
              flexShrink: 1,
            }}
          >
            {tr("会话列表（{0}）", { "0": sessions.length })}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            {(
              [
                ["all", "全部"],
                ["active", "进行中"],
                ["archived", "已归档"],
                ["refresh", "刷新"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === value }}
                onPress={() => {
                  if (value !== "refresh") {
                    setFilter(value);
                    return;
                  }
                  void query.refetch();
                  void status.refetch();
                  void cache.invalidateQueries({
                    queryKey: ["toolkit", "session-turns", props.host.id, props.workspaceId],
                  });
                }}
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 7,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor:
                    filter === value ? props.theme.colors.accent : props.theme.colors.border,
                  backgroundColor: filter === value ? props.theme.colors.surface2 : "transparent",
                }}
              >
                <Text
                  style={{
                    color:
                      filter === value
                        ? props.theme.colors.accent
                        : props.theme.colors.foregroundMuted,
                    fontSize: 12,
                  }}
                >
                  {tr(label)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
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
  const cache = useQueryClient();
  const [hovered, hover] = useState(false);
  const [menu, setMenu] = useState(false);
  const trigger = useRef<View>(null);
  const window = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState("");
  const rename = useRpc(renameTitle);
  const remove = useRpc(deleteSession);
  const changed = () => {
    void cache.invalidateQueries({
      queryKey: ["toolkit", "workspace-sessions", props.host.id, props.workspaceId],
    });
    void cache.invalidateQueries({
      queryKey: ["toolkit", "session-naming-status", props.host.id, props.workspaceId],
    });
  };
  const action = useMutation({
    mutationFn: async (kind: "rename" | "delete" | "copy") => {
      if (kind === "copy") return copyText(agent.title ?? "");
      const scope = {
        agentId: agent.id,
        workspaceId: props.workspaceId,
        previousTitle: agent.title,
      };
      if (kind === "rename") return rename({ ...scope, title: draft.trim() });
      return remove({ ...scope, confirmed: true });
    },
    onSuccess: (_result, kind) => {
      setMenu(false);
      setDialog(null);
      if (kind !== "copy") changed();
    },
  });
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
  const phase =
    naming.data && (!status?.at || (naming.data.at && status.at < naming.data.at))
      ? naming.data.phase
      : status?.phase;
  const priorPhase = useRef(phase);
  useEffect(() => {
    if (busyPhase(priorPhase.current) && phase === "done") changed();
    priorPhase.current = phase;
  }, [phase]);
  const busy = naming.isPending || busyPhase(phase);
  const unavailable = !!agent.activeTurn || (!agent.archivedAt && agent.status !== "idle");
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
  const closeMenu = () => {
    if (action.isPending) return;
    setMenu(false);
    setDialog(null);
  };
  const popupWidth = dialog === "rename" ? 576 : dialog === "delete" ? 220 : 160;
  return (
    <View
      onPointerEnter={() => hover(true)}
      onPointerLeave={() => hover(false)}
      style={{
        marginBottom: 6,
        borderWidth: 1,
        borderRadius: 8,
        borderColor: selected || hovered ? colors.accent : colors.border,
        backgroundColor: selected || hovered ? colors.surface1 : colors.surface0,
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
            {time} · {tr("{0} 轮", { "0": turns.data?.count ?? "—" })} ·{" "}
            {tr(agent.archivedAt ? "已归档" : "进行中")}
          </Text>
          {busy ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.foregroundMuted, fontSize: 11 }}>
                {tr("正在生成标题...")}
              </Text>
            </View>
          ) : null}
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
          ref={trigger}
          accessibilityRole="button"
          accessibilityLabel={tr("更多：{0}", { "0": title })}
          aria-haspopup="menu"
          accessibilityState={{ expanded: menu }}
          disabled={action.isPending}
          onPress={() => {
            action.reset();
            trigger.current?.measureInWindow((x, y, width, height) =>
              setAnchor({ x, y, width, height }),
            );
            setMenu(!menu);
          }}
          style={{
            padding: 8,
            borderRadius: 6,
            backgroundColor: menu ? colors.surface2 : "transparent",
          }}
        >
          <Icon
            name="Ellipsis"
            size={16}
            color={hovered || menu ? colors.accent : colors.foregroundMuted}
          />
        </Pressable>
      </View>
      <NativeModal
        visible={menu || dialog !== null}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("关闭更多菜单")}
            onPress={closeMenu}
            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
          />
          <View
            role={dialog === "rename" ? "dialog" : undefined}
            accessibilityRole={dialog === "delete" ? "alert" : "menu"}
            accessibilityLabel={tr("会话操作：{0}", { "0": title })}
            style={{
              position: "absolute",
              width: Math.min(popupWidth, window.width - 16),
              left: Math.max(
                8,
                Math.min(anchor.x + anchor.width - popupWidth, window.width - popupWidth - 8),
              ),
              top: Math.max(8, Math.min(anchor.y + anchor.height + 4, window.height - 216)),
              padding: 6,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface1,
              elevation: 8,
              boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            }}
          >
            {dialog === "rename" ? (
              <Surface theme={props.theme} compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Icon name="Pencil" size={15} color={colors.foregroundMuted} />
                  <Label strong>{tr("重新命名")}</Label>
                </View>
                <Field
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={tr("会话标题")}
                  disabled={action.isPending}
                />
                {action.isError ? (
                  <Label error>{tr(sessionActionError(action.error.message))}</Label>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <Button disabled={action.isPending} onPress={closeMenu}>
                    {tr("取消")}
                  </Button>
                  <Button
                    primary
                    disabled={
                      action.isPending ||
                      !draft.trim() ||
                      draft.trim().length > 200 ||
                      /[\r\n]/.test(draft)
                    }
                    onPress={() => action.mutate("rename")}
                  >
                    {tr(action.isPending ? "正在处理…" : "保存")}
                  </Button>
                </View>
              </Surface>
            ) : dialog === "delete" ? (
              <View style={{ padding: 6, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Icon name="Trash2" size={15} color={colors.statusDanger} />
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                    {tr("永久删除会话")}
                  </Text>
                </View>
                <Text
                  numberOfLines={2}
                  style={{ color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}
                >
                  {title}
                </Text>
                <Text style={{ color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>
                  {tr("同时删除 Provider 原始历史，无法撤销。项目文件保留。")}
                </Text>
                {action.isError ? (
                  <Text style={{ color: colors.statusDanger, fontSize: 12 }}>
                    {tr(sessionActionError(action.error.message))}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={action.isPending}
                    onPress={closeMenu}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontSize: 12 }}>{tr("取消")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr("确认永久删除")}
                    disabled={action.isPending}
                    onPress={() => action.mutate("delete")}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: colors.statusDanger,
                      opacity: action.isPending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: colors.statusDanger, fontSize: 12 }}>
                      {tr(action.isPending ? "正在处理…" : "删除")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <MenuItem
                  colors={colors}
                  icon={busy ? undefined : "Sparkles"}
                  disabled={busy || unavailable || action.isPending}
                  onPress={() => {
                    setMenu(false);
                    naming.mutate();
                  }}
                >
                  {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>
                    {tr(busy ? stage : "生成标题")}
                  </Text>
                </MenuItem>
                <MenuItem
                  colors={colors}
                  icon="Copy"
                  disabled={!agent.title || action.isPending}
                  onPress={() => action.mutate("copy")}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>{tr("复制标题")}</Text>
                </MenuItem>
                <MenuItem
                  colors={colors}
                  icon="Pencil"
                  disabled={unavailable || action.isPending}
                  onPress={() => {
                    action.reset();
                    setDraft(agent.title ?? "");
                    setDialog("rename");
                    setMenu(false);
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>{tr("重新命名")}</Text>
                </MenuItem>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                <MenuItem
                  colors={colors}
                  icon="Trash2"
                  destructive
                  disabled={unavailable || action.isPending}
                  onPress={() => {
                    action.reset();
                    setDialog("delete");
                    setMenu(false);
                  }}
                >
                  <Text style={{ color: colors.statusDanger, fontSize: 14 }}>{tr("永久删除")}</Text>
                </MenuItem>
              </>
            )}
          </View>
        </View>
      </NativeModal>
      {action.isSuccess && action.variables === "copy" ? (
        <Text style={{ color: colors.foregroundMuted, padding: 8 }}>{tr("标题已复制")}</Text>
      ) : null}
      {action.isError && !dialog ? (
        <Text style={{ color: colors.statusDanger, padding: 8 }}>{tr("操作失败，请重试。")}</Text>
      ) : null}
      {!busy && (naming.isError || phase === "error") ? (
        <Text style={{ color: colors.statusDanger, paddingHorizontal: 12, paddingBottom: 8 }}>
          {tr("命名失败，请重试。")}
        </Text>
      ) : null}
    </View>
  );
}
function MenuItem({
  colors,
  icon,
  destructive,
  disabled,
  onPress,
  children,
}: {
  colors: PluginWorkspacePanelProps["theme"]["colors"];
  icon?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
  children: import("react").ReactNode;
}) {
  const [hovered, hover] = useState(false);
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => hover(true)}
      onHoverOut={() => hover(false)}
      onFocus={() => hover(true)}
      onBlur={() => hover(false)}
      style={{
        minHeight: 40,
        paddingHorizontal: 10,
        paddingVertical: 9,
        borderRadius: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: hovered ? colors.surface2 : "transparent",
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={16}
          color={destructive ? colors.statusDanger : colors.foregroundMuted}
        />
      ) : null}
      {children}
    </Pressable>
  );
}
