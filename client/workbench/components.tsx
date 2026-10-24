import { createContext, useContext, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { tr } from "../i18n";

export const WorkbenchTheme = createContext<PluginTheme | null>(null);
export function useWorkbenchTheme() {
  const theme = useContext(WorkbenchTheme);
  if (!theme) throw new Error("Workbench theme missing");
  return theme;
}
export function Copy({
  children,
  muted = false,
  size = 14,
  strong = false,
  danger = false,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
  strong?: boolean;
  danger?: boolean;
}) {
  const { colors } = useWorkbenchTheme();
  return (
    <Text
      selectable
      style={{
        color: danger ? colors.statusDanger : muted ? colors.foregroundMuted : colors.foreground,
        fontSize: size,
        lineHeight: size * 1.55,
        fontWeight: strong ? "600" : "400",
      }}
    >
      {children}
    </Text>
  );
}
export function Row({ children, between = false }: { children: ReactNode; between?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        ...(between ? { justifyContent: "space-between" } : {}),
      }}
    >
      {children}
    </View>
  );
}
export function Card({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  const { colors } = useWorkbenchTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: accent ? colors.accent : colors.border,
        borderRadius: 12,
        padding: 20,
        gap: 12,
        minWidth: 0,
      }}
    >
      {children}
    </View>
  );
}
export function Action({
  children,
  onPress,
  primary = false,
  disabled = false,
  selected = false,
  label,
}: {
  children: ReactNode;
  onPress(): void;
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
}) {
  const { colors } = useWorkbenchTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary || selected ? colors.accent : colors.border,
        backgroundColor: primary
          ? colors.accent
          : selected || pressed
            ? colors.surface2
            : colors.surface1,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text
        style={{
          color: primary ? colors.accentForeground : selected ? colors.accent : colors.foreground,
          fontSize: 13,
          fontWeight: primary || selected ? "600" : "400",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field(props: TextInputProps & { label?: string }) {
  const { colors } = useWorkbenchTheme();
  const { label, ...input } = props;
  return (
    <View style={{ gap: 7, minWidth: 0 }}>
      {label && <Copy strong>{label}</Copy>}
      <TextInput
        {...input}
        accessibilityLabel={label ?? props.accessibilityLabel}
        placeholderTextColor={colors.foregroundMuted}
        style={[
          {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface0,
            color: colors.foreground,
            paddingHorizontal: 13,
            paddingVertical: 12,
            borderRadius: 8,
            fontSize: 15,
            minHeight: 46,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 24, gap: 10, alignItems: "center" }}>
      <Copy muted>{children}</Copy>
    </View>
  );
}
export function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ gap: 14 }}>
      <Row between>
        <View style={{ gap: 3 }}>
          <Copy size={19} strong>
            {tr(title)}
          </Copy>
          {detail && (
            <Copy muted size={12}>
              {detail}
            </Copy>
          )}
        </View>
        {children}
      </Row>
    </View>
  );
}
