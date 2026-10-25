import { createContext, useContext, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";

const Colors = createContext<PluginHostProps["theme"]["colors"] | null>(null);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: PluginHostProps["theme"];
  children: ReactNode;
}) {
  return <Colors.Provider value={theme.colors}>{children}</Colors.Provider>;
}

export function Surface({
  theme,
  children,
  compact = false,
}: {
  theme: PluginHostProps["theme"];
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <ThemeProvider theme={theme}>
      <View style={{ gap: 14, padding: compact ? 10 : 16, backgroundColor: theme.colors.surface0 }}>
        {children}
      </View>
    </ThemeProvider>
  );
}
export function useColors() {
  const colors = useContext(Colors);
  if (!colors) throw new Error("Toolkit surface is missing its theme");
  return colors;
}
export function Label({
  children,
  muted = false,
  error = false,
  strong = false,
}: {
  children: ReactNode;
  muted?: boolean;
  error?: boolean;
  strong?: boolean;
}) {
  const colors = useColors();
  return (
    <Text
      style={{
        color: error ? colors.statusDanger : muted ? colors.foregroundMuted : colors.foreground,
        fontSize: 14,
        fontWeight: strong ? "500" : "400",
        lineHeight: 21,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  children,
  onPress,
  disabled = false,
  primary = false,
}: {
  children: ReactNode;
  onPress(): void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary ? colors.accent : colors.border,
        backgroundColor: primary ? colors.accent : colors.surface1,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? colors.accentForeground : colors.foreground,
          fontSize: 14,
          lineHeight: 21,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  value,
  onChangeText,
  placeholder,
  secure = false,
  multiline = false,
  minHeight,
  disabled = false,
}: {
  value: string;
  onChangeText(value: string): void;
  placeholder: string;
  secure?: boolean;
  multiline?: boolean;
  minHeight?: number;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <TextInput
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      placeholderTextColor={colors.foregroundMuted}
      value={value}
      editable={!disabled}
      onChangeText={onChangeText}
      secureTextEntry={secure}
      multiline={multiline}
      autoCapitalize="none"
      autoCorrect={false}
      style={{
        color: colors.foreground,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        minHeight: minHeight ?? (multiline ? 90 : 44),
        textAlignVertical: "top",
      }}
    />
  );
}
export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {children}
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={{ gap: 9, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}
    >
      {children}
    </View>
  );
}
