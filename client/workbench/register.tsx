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
  function BoundScreen(props: PluginScreenProps) {
    return (
      <WorkbenchScreen
        {...props}
        model={useModel(props)}
        onPageChange={(page) => client.openScreen({ screenId: "workbench", params: { page } })}
      />
    );
  }
  function Screen(props: PluginScreenProps) {
    return <BoundScreen key={props.host.id} {...props} />;
  }
  function Sidebar(props: PluginSidebarItemProps) {
    useLocale();
    const destinations = [
      ["home", "工作台", "House"],
      ["ai", "AI 工作空间", "Sparkles"],
      ["hosts", "我的 Hosts", "Server"],
      ["memory", "个人记忆", "Brain"],
      ["skills", "技能中心", "Blocks"],
    ] as const;
    return (
      <>
        {destinations.map(([page, label, icon]) => (
          <SidebarRow
            key={page}
            {...props}
            id={page}
            icon={icon}
            label={tr(label)}
            active={
              props.currentScreen?.screenId === "workbench" &&
              (props.currentScreen.params.page ?? "home") === page
            }
            onPress={() => props.openScreen({ screenId: "workbench", params: { page } })}
          />
        ))}
      </>
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
