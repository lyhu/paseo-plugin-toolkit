import { tr, useLocale } from "../i18n";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useAgent, useRpc, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { sendQuestion } from "../../shared/quick-questions/contracts";
import { useQuestions } from "./queries";
import { Label, Surface, useColors } from "./ui";

interface Draft {
  questionId: string;
  text: string;
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
  const query = useQuestions(props.host.id, props.workspaceId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const agentId = props.context === "agent" ? props.agentId : "";
  const status = useAgent(agentId, (agent) => agent.status);
  const send = useRpc(sendQuestion);
  const mutation = useMutation({
    mutationFn: (text: string) => send({ workspaceId: props.workspaceId, agentId, text }),
    onSuccess: () => props.close(),
  });
  const canSend =
    status === "idle" &&
    !mutation.isPending &&
    query.data?.enabled === true &&
    query.data.featureEnabled;
  const questions =
    query.data?.questions.filter((q) =>
      q.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) ?? [];
  return (
    <View style={{ gap: 8, width: props.layout.compact ? "100%" : 340, maxWidth: "100%" }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: colors.surface1,
            borderRadius: 6,
            paddingHorizontal: 9,
          }}
        >
          <Icon name="Search" size={14} color={colors.foregroundMuted} />
          <TextInput
            accessibilityLabel={tr("搜索问题")}
            placeholder={tr("搜索问题")}
            placeholderTextColor={colors.foregroundMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 14,
              paddingVertical: 7,
              minHeight: 34,
            }}
          />
        </View>
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
            <View
              key={q.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderRadius: 6,
                backgroundColor: draft?.questionId === q.id ? colors.surface2 : colors.surface0,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={q.text}
                accessibilityState={{ selected: draft?.questionId === q.id }}
                disabled={mutation.isPending}
                onPress={() => {
                  mutation.reset();
                  setDraft({ questionId: q.id, text: q.text });
                }}
                style={{
                  flex: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  minHeight: 36,
                  justifyContent: "center",
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}
                >
                  {q.text}
                </Text>
              </Pressable>
              <IconButton
                icon="Send"
                label={tr("直接发送：{0}", { "0": q.text })}
                disabled={!canSend}
                pending={mutation.isPending && mutation.variables === q.text}
                onPress={() => mutation.mutate(q.text)}
              />
            </View>
          ))}
          {!questions.length && (
            <View style={{ padding: 8 }}>
              <Label muted>{search ? tr("无匹配结果") : tr("暂无问题")}</Label>
            </View>
          )}
        </ScrollView>
      )}
      {draft && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 8,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <TextInput
            accessibilityLabel={tr("编辑问题")}
            placeholder={tr("编辑问题")}
            placeholderTextColor={colors.foregroundMuted}
            value={draft.text}
            onChangeText={(text) => setDraft({ ...draft, text })}
            editable={!mutation.isPending}
            multiline
            style={{
              flex: 1,
              color: colors.foreground,
              fontSize: 14,
              lineHeight: 20,
              backgroundColor: colors.surface1,
              borderRadius: 6,
              padding: 8,
              minHeight: 48,
              maxHeight: 100,
              textAlignVertical: "top",
            }}
          />
          <IconButton
            icon="ArrowUp"
            label={tr("发送编辑后的问题")}
            primary
            disabled={!canSend || !draft.text.trim()}
            pending={mutation.isPending && mutation.variables === draft.text}
            onPress={() => mutation.mutate(draft.text)}
          />
        </View>
      )}
      {mutation.isError && <Label error>{tr(mutation.error.message)}</Label>}
    </View>
  );
}
interface IconButtonProps {
  icon: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  pending?: boolean;
  primary?: boolean;
}
function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  pending = false,
  primary = false,
}: IconButtonProps) {
  const colors = useColors();
  const color = primary ? colors.accentForeground : colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: pending }}
      disabled={disabled}
      onPress={onPress}
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
