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
import { KnowledgeSpaceEntry, KnowledgeContextPanel } from "./knowledge-space";
export function registerWorkbench(client: PluginClientContext, useModel: WorkbenchModelHook) {
  function BoundScreen(props: PluginScreenProps) {
    const model = useModel(props);
    if (props.params.page === "ai") return <KnowledgeSpaceEntry {...props} client={client} />;
    return (
      <WorkbenchScreen
        {...props}
        model={model}
        onPageChange={(page) => client.openScreen({ screenId: "workbench", params: { page } })}
      />
    );
  }
  function Screen(props: PluginScreenProps) {
    return <BoundScreen key={props.host.id} {...props} />;
  }
  function Sidebar(props: PluginSidebarItemProps) {
    useLocale();
    return (
      <SidebarRow
        {...props}
        id="home"
        icon="House"
        label={tr("工作台")}
        active={props.currentScreen?.screenId === "workbench"}
        onPress={() => props.openScreen({ screenId: "workbench", params: { page: "home" } })}
      />
    );
  }
  const cleanups = [
    client.addWorkspacePanel({
      id: "knowledge-context",
      title: tr("知行上下文"),
      icon: "Brain",
      locations: ["explorer"],
      Component: (props) => (
        <KnowledgeContextPanel {...props} model={useModel({ ...props, params: {} })} />
      ),
    }),
    client.addScreen({ id: "workbench", title: "Workbench", Component: Screen }),
    client.addSidebarHeaderItem({ id: "workbench", title: "Workbench", Component: Sidebar }),
    ...workbenchThemes.map((theme) => client.addTheme(theme)),
  ];
  return async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
  };
}
