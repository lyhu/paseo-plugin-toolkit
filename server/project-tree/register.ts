import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  readProjectTree,
  changeProjectTree,
  projectTreeSettings,
} from "../../shared/project-tree/contracts";
import { createProjectTreeStore } from "./storage";
export function registerProjectTree(server: PluginServerContext) {
  server.registerSettings(projectTreeSettings);
  const store = createProjectTreeStore();
  server.handle(readProjectTree, () => store.read());
  server.handle(changeProjectTree, ({ revision, command }) => store.change(revision, command));
}
