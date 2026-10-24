import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  readProjectTree,
  changeProjectTree,
  projectTreeSettings,
  readProjectTreeHistory,
  saveProjectTreeSnapshot,
  restoreProjectTreeSnapshot,
  undoProjectTree,
} from "../../shared/project-tree/contracts";
import { createProjectTreeStore } from "./storage";
export function registerProjectTree(server: PluginServerContext) {
  server.registerSettings(projectTreeSettings);
  const store = createProjectTreeStore();
  server.handle(readProjectTree, () => store.read());
  server.handle(changeProjectTree, ({ revision, command }) => store.change(revision, command));
  server.handle(readProjectTreeHistory, () => store.history());
  server.handle(saveProjectTreeSnapshot, ({ revision, name }) =>
    store.saveSnapshot(revision, name),
  );
  server.handle(restoreProjectTreeSnapshot, ({ revision, snapshotId }) =>
    store.restoreSnapshot(revision, snapshotId),
  );
  server.handle(undoProjectTree, ({ revision }) => store.undo(revision));
}
