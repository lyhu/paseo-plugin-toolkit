import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { WorkbenchScreen } from "./screen";
import { workbenchThemes } from "./themes";
import type { WorkbenchModelHook } from "./types";
import { tr, useLocale } from "../i18n";
export function registerWorkbench(client: PluginClientContext, useModel: WorkbenchModelHook) {
  function Screen(props: PluginScreenProps) {
    return <WorkbenchScreen {...props} model={useModel(props)} />;
  }
  function Sidebar(props: PluginSidebarItemProps) {
    useLocale();
    return (
      <SidebarRow
        {...props}
        label={tr("工作台")}
        active={props.currentScreen?.screenId === "workbench"}
        onPress={() => props.openScreen({ screenId: "workbench" })}
      />
    );
  }
  const cleanups = [
    client.addScreen({ id: "workbench", title: "Workbench", Component: Screen }),
    client.addSidebarHeaderItem({ id: "workbench", title: "Workbench", Component: Sidebar }),
    ...workbenchThemes.map((theme) => client.addTheme(theme)),
  ];
  return async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
  };
}
