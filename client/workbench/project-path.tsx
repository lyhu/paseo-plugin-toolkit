import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { copyText } from "@getpaseo/plugin/client/ui";
import { Action, useWorkbenchTheme } from "./components";
import { mountPathTooltip } from "./path-tooltip";
import { tr } from "../i18n";

export function ProjectPath({ path }: { path: string }) {
  const { colors } = useWorkbenchTheme();
  const ref = useRef<View>(null);
  const [status, setStatus] = useState<"" | "copied" | "failed">("");
  const copy = async () => {
    try {
      await copyText(path);
      setStatus("copied");
    } catch (error) {
      setStatus("failed");
      throw error;
    }
  };
  const copyRef = useRef(copy);
  copyRef.current = copy;
  useEffect(() => {
    setStatus("");
    return mountPathTooltip(ref.current, path, colors, () => copyRef.current());
  }, [path, colors.surface2, colors.foreground, colors.border]);
  return (
    <View
      ref={ref}
      testID="workbench-project-path"
      style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          lineHeight: 19,
          color: colors.foregroundMuted,
        }}
      >
        {path}
      </Text>
      <View style={{ flexShrink: 0 }}>
        <Action
          quiet
          compact
          icon={status === "copied" ? "Check" : status === "failed" ? "AlertCircle" : "Copy"}
          label={`${tr(status === "copied" ? "已复制" : status === "failed" ? "复制失败" : "复制路径")} · ${path}`}
          onPress={() => {
            void copy().catch(() => {});
          }}
        />
      </View>
    </View>
  );
}
