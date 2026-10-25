import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { Action, useWorkbenchTheme } from "./components";
import { openWorkbenchProjectMenu, openWorkbenchWorkspaceMenu } from "../web";
import type { WorkbenchProject, WorkbenchWorkspace } from "./types";
import { tr } from "../i18n";

export function NativeActions({
  project,
  workspace,
  disabled,
  organize,
  onError,
}: {
  project: WorkbenchProject;
  workspace?: WorkbenchWorkspace;
  disabled: boolean;
  organize(): void;
  onError(message: string): void;
}) {
  const { colors } = useWorkbenchTheme();
  const ref = useRef<View>(null);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cleanup.current?.(), []);
  return (
    <View ref={ref} style={{ flexShrink: 0 }}>
      <Action
        quiet
        compact
        icon="Ellipsis"
        disabled={disabled || Platform.OS !== "web"}
        label={`${workspace?.name ?? project.name} · ${tr(workspace ? "工作区操作" : "项目操作")}`}
        onPress={() => {
          cleanup.current?.();
          const fail = () => onError(tr("原生项目操作暂不可用，请切换原生视图后重试。"));
          if (workspace) {
            void openWorkbenchWorkspaceMenu(
              ref.current,
              { ...workspace, cwd: workspace.path },
              project.nativeGroup,
            )
              .then((opened) => {
                if (!opened) fail();
              })
              .catch((error) => onError(String(error)));
          } else {
            cleanup.current = project.nativeGroup
              ? openWorkbenchProjectMenu(
                  ref.current,
                  project.nativeGroup,
                  colors,
                  organize,
                  onError,
                )
              : undefined;
            if (!cleanup.current) fail();
          }
        }}
      />
    </View>
  );
}
