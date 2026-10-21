import { join } from "node:path";
import { createRevisionedJsonStore } from "../storage/revisioned-json";
import { paseoHome } from "../models/storage";
import {
  applyTreeCommand,
  emptyTree,
  treeSchema,
  validateTree,
  type TreeCommand,
} from "../../shared/project-tree/model";

export function createProjectTreeStore(home = paseoHome()) {
  const store = createRevisionedJsonStore({
    filename: join(home, "toolkit", "project-tree.json"),
    schema: treeSchema,
    create: emptyTree,
    concurrencyError: "目录结构已在其他设备更新，请刷新后重试。",
  });
  return {
    read: () => validateTree(store.read()),
    change: (revision: number, command: TreeCommand) =>
      store.update(revision, (tree) => applyTreeCommand(tree, command)),
  };
}
