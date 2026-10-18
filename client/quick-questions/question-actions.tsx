import { tr } from "../i18n";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useColors } from "./ui";

export function QuestionActions({
  index,
  editing,
  confirming,
  busy,
  onEdit,
  onRequestDelete,
  onCancel,
  onConfirm,
}: {
  index: number;
  editing: boolean;
  confirming: boolean;
  busy: boolean;
  onEdit(): void;
  onRequestDelete(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  const [remaining, setRemaining] = useState(2);
  useEffect(() => {
    setRemaining(2);
    if (!confirming) return;
    const deadline = Date.now() + 2000;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [confirming]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {confirming ? (
        <>
          <Action
            icon="Check"
            label={
              remaining
                ? tr("确认删除第 {0} 条（{1} 秒后可用）", { "0": index + 1, "1": remaining })
                : tr("确认删除第 {0} 条", { "0": index + 1 })
            }
            tooltip={remaining ? tr("{0} 秒后可确认删除", { "0": remaining }) : tr("确认删除")}
            danger
            countdown={remaining}
            disabled={busy || remaining > 0}
            onPress={onConfirm}
          />
          <Action
            icon="X"
            label={tr("取消删除第 {0} 条", { "0": index + 1 })}
            tooltip={tr("取消删除")}
            disabled={busy}
            onPress={onCancel}
          />
        </>
      ) : (
        <>
          <Action
            icon={editing ? "Check" : "Pencil"}
            label={tr("{0}第 {1} 条", {
              "0": editing ? tr("完成编辑") : tr("编辑"),
              "1": index + 1,
            })}
            tooltip={editing ? tr("完成编辑") : tr("编辑")}
            disabled={busy}
            onPress={onEdit}
          />
          <Action
            icon="Trash2"
            label={tr("删除第 {0} 条", { "0": index + 1 })}
            tooltip={tr("删除")}
            disabled={busy}
            onPress={onRequestDelete}
          />
        </>
      )}
    </View>
  );
}
function Action({
  icon,
  label,
  tooltip,
  disabled,
  danger = false,
  countdown = 0,
  onPress,
}: {
  icon: string;
  label: string;
  tooltip: string;
  disabled: boolean;
  danger?: boolean;
  countdown?: number;
  onPress(): void;
}) {
  const colors = useColors();
  const [hovered, setHovered] = useState(false);
  const color = danger ? colors.statusDanger : colors.foregroundMuted;
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
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          backgroundColor: hovered ? colors.surface2 : "transparent",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Icon name={icon} size={16} color={color} />
        {countdown > 0 && (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              color: colors.statusDanger,
              fontSize: 10,
              fontWeight: "500",
            }}
          >
            {countdown}
          </Text>
        )}
      </Pressable>
      {hovered && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 38,
            right: 0,
            minWidth: 80,
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: 5,
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 12 }}>{tooltip}</Text>
        </View>
      )}
    </View>
  );
}
