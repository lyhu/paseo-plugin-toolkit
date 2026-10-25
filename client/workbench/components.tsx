import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { tr } from "../i18n";
import { mountWideWorkbenchModal } from "../web";

export const WorkbenchTheme = createContext<PluginTheme | null>(null);
export function useWorkbenchTheme() {
  const theme = useContext(WorkbenchTheme);
  if (!theme) throw new Error("Workbench theme missing");
  return theme;
}
export function WorkbenchModal({
  title,
  children,
  onClose,
  wide = false,
  maxWidth,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
  maxWidth?: number;
}) {
  const theme = useWorkbenchTheme();
  return (
    <Modal
      title={title}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content>
        {/* Compact host sheets bridge host contexts, so the plugin theme must travel with the content. */}
        <WorkbenchTheme.Provider value={theme}>
          {wide || maxWidth ? (
            <WideModalBody maxWidth={maxWidth}>{children}</WideModalBody>
          ) : (
            children
          )}
        </WorkbenchTheme.Provider>
      </Modal.Content>
    </Modal>
  );
}
function WideModalBody({ children, maxWidth = 960 }: { children: ReactNode; maxWidth?: number }) {
  const ref = useRef<View>(null);
  useEffect(() => mountWideWorkbenchModal(ref.current, maxWidth), [maxWidth]);
  return (
    <View ref={ref} style={{ gap: 16 }}>
      {children}
    </View>
  );
}
export function Copy({
  children,
  muted = false,
  size = 15,
  strong = false,
  danger = false,
  lines,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
  strong?: boolean;
  danger?: boolean;
  lines?: number;
}) {
  const { colors } = useWorkbenchTheme();
  return (
    <Text
      selectable
      numberOfLines={lines}
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
        padding: 18,
        gap: 10,
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
  quiet = false,
  compact = false,
  icon,
}: {
  children?: ReactNode;
  onPress(): void;
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
  quiet?: boolean;
  compact?: boolean;
  icon?: string;
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
        minHeight: compact ? 32 : quiet ? 36 : 40,
        minWidth: 0,
        maxWidth: "100%",
        flexShrink: 1,
        justifyContent: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: compact || quiet ? 10 : 13,
        paddingVertical: compact ? 4 : quiet ? 7 : 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: quiet ? "transparent" : primary || selected ? colors.accent : colors.border,
        backgroundColor: primary
          ? colors.accent
          : selected || pressed
            ? colors.surface2
            : quiet
              ? "transparent"
              : colors.surface1,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {icon && (
        <Icon
          name={icon}
          size={16}
          color={
            primary ? colors.accentForeground : selected ? colors.accent : colors.foregroundMuted
          }
        />
      )}
      {children != null && (
        <Text
          style={{
            color: primary
              ? colors.accentForeground
              : selected
                ? colors.accent
                : quiet
                  ? colors.foregroundMuted
                  : colors.foreground,
            fontSize: 14,
            fontWeight: primary || selected ? "600" : "400",
          }}
        >
          {children}
        </Text>
      )}
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
export function Badge({ children, icon }: { children: ReactNode; icon?: string }) {
  const { colors } = useWorkbenchTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: colors.surface2,
        paddingVertical: 4,
        paddingHorizontal: 7,
        borderRadius: 5,
        maxWidth: "100%",
      }}
    >
      {icon && <Icon name={icon} size={13} color={colors.foregroundMuted} />}
      <Copy muted size={12} lines={1}>
        {children}
      </Copy>
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
