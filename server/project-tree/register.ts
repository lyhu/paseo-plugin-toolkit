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
import { createProjectTreeStore, type WorkbenchStore } from "./storage";
export function registerProjectTree(server: PluginServerContext, workbench?: WorkbenchStore) {
  server.registerSettings(projectTreeSettings);
  const store = createProjectTreeStore(undefined, workbench);
  server.handle(readProjectTree, () => store.read());
  server.handle(changeProjectTree, ({ revision, command }) => store.change(revision, command));
  server.handle(readProjectTreeHistory, () => store.history());
  server.handle(saveProjectTreeSnapshot, ({ revision, name }) =>
    store.saveSnapshot(revision, name),
  );
  server.handle(restoreProjectTreeSnapshot, ({ revision, snapshotId, workbenchRevision }) =>
    store.restoreSnapshot(revision, snapshotId, workbenchRevision),
  );
  server.handle(undoProjectTree, ({ revision, workbenchRevision }) =>
    store.undo(revision, workbenchRevision),
  );
}
