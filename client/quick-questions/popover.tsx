import { tr, useLocale } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useAgent, useRpc, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { sendQuestion } from "../../shared/quick-questions/contracts";
import { getComposerAccess } from "../chat-view/enhance/dom";
import { getDraftComposerAccess, sendDraftComposer } from "./draft-composer";
import { useQuestions } from "./queries";
import { Label, Surface, useColors } from "./ui";

/**
 * React Native Web drops `title` from View's prop whitelist, so write it on the host node. Native
 * views have no hover effect and no `setAttribute`, which the guard skips.
 */
function useTooltip(text: string) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node = ref.current as unknown as { setAttribute?(name: string, value: string): void };
    node?.setAttribute?.("title", text);
    return () => {
      node?.setAttribute?.("title", "");
    };
  }, [text]);
  return ref;
}

export function QuickQuestionsPopover(
  props: PluginButtonContentProps & { openMaintenance(): void },
) {
  useLocale();
  return (
    <Surface theme={props.theme} compact>
      <Content {...props} />
    </Surface>
  );
}

function Content(props: PluginButtonContentProps & { openMaintenance(): void }) {
  const colors = useColors();
  const toast = useToast();
  const query = useQuestions(props.host.id, props.workspaceId);
  const isDraft = props.context === "workspace";
  const agentId = props.context === "agent" ? props.agentId : "";
  const status = useAgent(agentId, (agent) => agent.status);
  const send = useRpc(sendQuestion);
  const mutation = useMutation({
    mutationFn: (text: string) => send({ workspaceId: props.workspaceId, agentId, text }),
    onSuccess: () => props.close(),
  });
  const available = query.data?.enabled === true && query.data.featureEnabled;
  const canSend = available && !mutation.isPending && (isDraft || status === "idle");
  const canEdit = available && !mutation.isPending;

  function copyFallback(text: string) {
    void copyText(text).then(
      () => toast.error(tr("无法写入输入框，已复制到剪贴板。")),
      () => toast.error(tr("无法写入输入框。")),
    );
  }

  function fillComposer(text: string) {
    const access = isDraft ? getDraftComposerAccess(props.workspaceId) : getComposerAccess();
    if (access?.write(text)) {
      props.close();
      return;
    }
    copyFallback(text);
  }

  function sendNow(text: string) {
    if (isDraft) {
      if (sendDraftComposer(props.workspaceId, text)) {
        props.close();
        return;
      }
      copyFallback(text);
      return;
    }
    mutation.reset();
    mutation.mutate(text);
  }

  const questions = query.data?.questions ?? [];

  return (
    <View style={{ gap: 8, width: props.layout.compact ? "100%" : 340, maxWidth: "100%" }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.foregroundMuted,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {tr("快捷提问")}
        </Text>
        <IconButton icon="Settings2" label={tr("设置快捷提问")} onPress={props.openMaintenance} />
      </View>
      {query.isPending && (
        <ActivityIndicator
          size="small"
          color={colors.foregroundMuted}
          accessibilityLabel={tr("正在读取问题")}
        />
      )}
      {query.isError && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Label error>{tr(query.error.message)}</Label>
          </View>
          <IconButton
            icon="RotateCw"
            label={tr("重试读取")}
            onPress={() => {
              void query.refetch();
            }}
          />
        </View>
      )}
      {query.data && (!query.data.enabled || !query.data.featureEnabled) && (
        <Label muted>{tr("已停用")}</Label>
      )}
      {query.data?.enabled && query.data.featureEnabled && (
        <ScrollView
          style={{ maxHeight: 240 }}
          contentContainerStyle={{ gap: 2 }}
          keyboardShouldPersistTaps="handled"
        >
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              text={q.text}
              canSend={canSend}
              canEdit={canEdit}
              pending={!isDraft && mutation.isPending && mutation.variables === q.text}
              onSend={() => sendNow(q.text)}
              onEdit={() => fillComposer(q.text)}
            />
          ))}
          {!questions.length && (
            <View style={{ padding: 8 }}>
              <Label muted>{tr("暂无问题")}</Label>
            </View>
          )}
        </ScrollView>
      )}
      {mutation.isError && <Label error>{tr(mutation.error.message)}</Label>}
    </View>
  );
}

function QuestionRow({
  text,
  canSend,
  canEdit,
  pending,
  onSend,
  onEdit,
}: {
  text: string;
  canSend: boolean;
  canEdit: boolean;
  pending: boolean;
  onSend(): void;
  onEdit(): void;
}) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);
  const sendRef = useTooltip(tr("点击问题直接发送"));
  const hover = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 6,
        backgroundColor: hovered ? colors.surface1 : "transparent",
      }}
    >
      <Pressable
        ref={sendRef}
        accessibilityRole="button"
        accessibilityLabel={tr("直接发送：{0}", { "0": text })}
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={onSend}
        {...hover}
        style={{
          flex: 1,
          paddingHorizontal: 8,
          paddingVertical: 8,
          minHeight: 36,
          justifyContent: "center",
          opacity: canSend ? 1 : 0.5,
        }}
      >
        <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
          {text}
        </Text>
      </Pressable>
      <IconButton
        icon="Pencil"
        label={tr("编辑后发送")}
        title={tr("点击铅笔可先编辑")}
        active={hovered}
        disabled={!canEdit}
        pending={pending}
        onPress={onEdit}
        {...hover}
      />
    </View>
  );
}

interface IconButtonProps {
  icon: string;
  label: string;
  /** Hover tooltip. Defaults to `label`, which is also the accessibility label. */
  title?: string;
  onPress(): void;
  disabled?: boolean;
  pending?: boolean;
  primary?: boolean;
  active?: boolean;
  onHoverIn?(): void;
  onHoverOut?(): void;
}

function IconButton({
  icon,
  label,
  title,
  onPress,
  disabled = false,
  pending = false,
  primary = false,
  active = false,
  onHoverIn,
  onHoverOut,
}: IconButtonProps) {
  const colors = useColors();
  const ref = useTooltip(title ?? label);
  const color = primary
    ? colors.accentForeground
    : active
      ? colors.foreground
      : colors.foregroundMuted;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: pending }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      hitSlop={4}
      style={{
        width: 34,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        backgroundColor: primary ? colors.accent : "transparent",
        opacity: disabled && !pending ? 0.4 : 1,
      }}
    >
      {pending ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Icon name={icon} size={16} color={color} />
      )}
    </Pressable>
  );
}
