import { tr } from "../i18n";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { summaryPromptSchema } from "../../shared/quick-questions/contracts";
import { DEFAULT_SUMMARY_PROMPT } from "../../shared/quick-questions/summary-prompt";
import { Button, Card, Field, Label, Row, useColors } from "./ui";

export function PromptSettings({
  value,
  savedValue,
  onChange,
  onSave,
  onClose,
  busy,
  saving,
  error,
}: {
  value: string;
  savedValue: string;
  onChange(value: string): void;
  onSave(): void;
  onClose(): void;
  busy: boolean;
  saving: boolean;
  error: string | null;
}) {
  const colors = useColors();
  const [resetHovered, setResetHovered] = useState(false);
  const valid = summaryPromptSchema.safeParse(value).success;
  return (
    <Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Label strong>{tr("总结提示词")}</Label>
        </View>
        <Button onPress={onClose}>{tr("收起提示词")}</Button>
      </Row>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder={tr("总结提示词内容")}
        multiline
        minHeight={220}
        disabled={busy}
      />
      {!valid && <Label error>{tr("总结提示词不能为空，且不超过 8000 字符。")}</Label>}
      {error && <Label error>{tr(error)}</Label>}
      <Label muted>{tr("保存后用于下一次总结；JSON 格式和来源校验由插件固定。")}</Label>
      <Row>
        <Button disabled={busy || !valid || value.trim() === savedValue} onPress={onSave}>
          {saving ? tr("正在保存…") : tr("保存提示词")}
        </Button>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("还原默认")}
            accessibilityState={{ disabled: busy || value === DEFAULT_SUMMARY_PROMPT }}
            disabled={busy || value === DEFAULT_SUMMARY_PROMPT}
            onPress={() => onChange(DEFAULT_SUMMARY_PROMPT)}
            onHoverIn={() => setResetHovered(true)}
            onHoverOut={() => setResetHovered(false)}
            style={{
              width: 36,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              backgroundColor: resetHovered ? colors.surface2 : "transparent",
              opacity: busy || value === DEFAULT_SUMMARY_PROMPT ? 0.4 : 1,
            }}
          >
            <Icon name="RotateCcw" size={16} color={colors.foregroundMuted} />
          </Pressable>
          {resetHovered && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: 42,
                left: 0,
                minWidth: 80,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 5,
                backgroundColor: colors.surface2,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12 }}>{tr("还原默认")}</Text>
            </View>
          )}
        </View>
      </Row>
    </Card>
  );
}
