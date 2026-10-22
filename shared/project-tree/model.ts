import { z } from "zod";

export const memberSchema = z.object({ serverId: z.string().min(1), projectId: z.string().min(1) });
const common = {
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().nullable(),
  hidden: z.boolean().optional(),
};
export const nodeSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("folder") }),
  z.object({
    ...common,
    kind: z.literal("project"),
    members: z.array(memberSchema).min(1),
    autoKey: z.string().optional(),
  }),
]);
export const treeSchema = z.object({
  revision: z.number().int().nonnegative(),
  nodes: z.array(nodeSchema),
  workspacePlacements: z
    .array(
      z.object({ serverId: z.string().min(1), workspaceId: z.string().min(1), nodeId: common.id }),
    )
    .optional(),
});
export type Tree = z.infer<typeof treeSchema>;
export type TreeNode = z.infer<typeof nodeSchema>;
export type ProjectMember = z.infer<typeof memberSchema>;
export const discoveredProjectSchema = memberSchema.extend({
  name: common.name,
  key: z.string().optional(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("discover"), projects: z.array(discoveredProjectSchema) }),
  z.object({
    type: z.literal("folder"),
    id: common.id,
    name: common.name,
    parentId: common.parentId,
  }),
  z.object({ type: z.literal("rename"), id: common.id, name: common.name }),
  z.object({ type: z.literal("hide"), id: common.id, hidden: z.boolean() }),
  z.object({ type: z.literal("hideEmpty"), ids: z.array(common.id).min(1) }),
  z.object({
    type: z.literal("move"),
    id: common.id,
    parentId: common.parentId,
    beforeId: common.id.optional(),
  }),
  z.object({ type: z.literal("removeFolder"), id: common.id }),
  z.object({ type: z.literal("merge"), sourceId: common.id, targetId: common.id }),
  z.object({
    type: z.literal("split"),
    id: common.id,
    member: memberSchema,
    newId: common.id,
    name: common.name,
  }),
  z.object({ type: z.literal("placeNewProject"), targetId: common.id, member: memberSchema }),
  z.object({
    type: z.literal("moveWorkspace"),
    serverId: z.string().min(1),
    workspaceId: z.string().min(1),
    targetId: common.id,
  }),
]);
export type TreeCommand = z.infer<typeof commandSchema>;
export type TreeNodeAction =
  | "new"
  | "folder"
  | "menu"
  | "rename"
  | "move"
  | "hide"
  | "hideEmpty"
  | "up"
  | "down"
  | "top"
  | "bottom"
  | "merge"
  | "split"
  | "delete";
export const emptyTree = (): Tree => ({ revision: 0, nodes: [] });
export const memberKey = (member: ProjectMember) =>
  JSON.stringify([member.serverId, member.projectId]);

/** Validates the complete resulting tree, including depth of descendants after a move. */
export function validateTree(tree: Tree): Tree {
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  if (nodes.size !== tree.nodes.length) throw new Error("目录节点重复");
  const members = new Set<string>();
  const workspaces = new Set<string>();
  for (const placement of tree.workspacePlacements ?? []) {
    const key = JSON.stringify([placement.serverId, placement.workspaceId]);
    if (workspaces.has(key)) throw new Error("工作区显示位置重复");
    if (nodes.get(placement.nodeId)?.kind !== "project") throw new Error("目标项目显示组不存在");
    workspaces.add(key);
  }
  for (const node of tree.nodes) {
    const seen = new Set([node.id]);
    let depth = node.kind === "folder" ? 1 : 0;
    let parentId = node.parentId;
    while (parentId) {
      if (seen.has(parentId)) throw new Error("不能移动到自身或子文件夹中");
      seen.add(parentId);
      const parent = nodes.get(parentId);
      if (parent?.kind !== "folder") throw new Error("目标文件夹不存在");
      depth += 1;
      parentId = parent.parentId;
    }
    if (depth > 3) throw new Error("分类文件夹最多三层");
    if (node.kind === "project")
      for (const member of node.members) {
        const key = memberKey(member);
        if (members.has(key)) throw new Error("项目已经属于其他显示组");
        members.add(key);
      }
  }
  return tree;
}

/** Pure organization operations. Host-local project records and workspace membership never change. */
export function applyTreeCommand(previous: Tree, input: TreeCommand): Tree {
  const command = commandSchema.parse(input);
  const tree = treeSchema.parse(previous);
  const find = (id: string) => {
    const node = tree.nodes.find((entry) => entry.id === id);
    if (!node) throw new Error("目录节点不存在");
    return node;
  };
  switch (command.type) {
    case "discover": {
      for (const project of command.projects) {
        const key = memberKey(project);
        if (
          tree.nodes.some(
            (node) =>
              node.kind === "project" && node.members.some((member) => memberKey(member) === key),
          )
        )
          continue;
        const uniqueOnHost =
          command.projects.filter(
            (entry) => entry.serverId === project.serverId && entry.key === project.key,
          ).length === 1;
        const existing =
          project.key && uniqueOnHost
            ? tree.nodes.find(
                (node) =>
                  node.kind === "project" &&
                  node.autoKey === project.key &&
                  !node.members.some((member) => member.serverId === project.serverId),
              )
            : undefined;
        const member = { serverId: project.serverId, projectId: project.projectId };
        if (existing?.kind === "project") existing.members.push(member);
        else
          tree.nodes.push({
            id: `project:${key}`,
            kind: "project",
            name: project.name,
            parentId: null,
            members: [member],
            ...(uniqueOnHost && project.key ? { autoKey: project.key } : {}),
          });
      }
      break;
    }
    case "folder":
      tree.nodes.unshift({
        id: command.id,
        name: command.name,
        parentId: command.parentId,
        kind: "folder",
      });
      break;
    case "rename":
      find(command.id).name = command.name;
      break;
    case "hide": {
      const node = find(command.id);
      if (node.kind !== "project") throw new Error("只能隐藏项目节点");
      if (command.hidden) node.hidden = true;
      else delete node.hidden;
      break;
    }
    case "hideEmpty": {
      for (const id of command.ids) {
        const node = find(id);
        if (node.kind !== "project") throw new Error("只能隐藏项目节点");
        node.hidden = true;
      }
      break;
    }
    case "move": {
      const node = find(command.id);
      node.parentId = command.parentId;
      tree.nodes = tree.nodes.filter((entry) => entry.id !== node.id);
      const before = command.beforeId
        ? tree.nodes.findIndex(
            (entry) => entry.id === command.beforeId && entry.parentId === command.parentId,
          )
        : -1;
      if (command.beforeId && before < 0) throw new Error("目标排序位置不存在");
      tree.nodes.splice(before < 0 ? tree.nodes.length : before, 0, node);
      break;
    }
    case "removeFolder": {
      const folder = find(command.id);
      if (folder.kind !== "folder") throw new Error("只能删除分类文件夹");
      for (const node of tree.nodes)
        if (node.parentId === folder.id) node.parentId = folder.parentId;
      tree.nodes = tree.nodes.filter((node) => node.id !== folder.id);
      break;
    }
    case "merge": {
      const source = find(command.sourceId),
        target = find(command.targetId);
      if (source === target || source.kind !== "project" || target.kind !== "project")
        throw new Error("请选择不同的项目显示组");
      target.members.push(...source.members);
      for (const placement of tree.workspacePlacements ?? [])
        if (placement.nodeId === source.id) placement.nodeId = target.id;
      delete target.autoKey;
      tree.nodes = tree.nodes.filter((node) => node.id !== source.id);
      break;
    }
    case "split": {
      const node = find(command.id);
      if (
        node.kind !== "project" ||
        node.members.length < 2 ||
        !node.members.some((member) => memberKey(member) === memberKey(command.member))
      )
        throw new Error("请选择合并组中的项目");
      node.members = node.members.filter(
        (member) => memberKey(member) !== memberKey(command.member),
      );
      delete node.autoKey;
      tree.nodes.push({
        id: command.newId,
        name: command.name,
        parentId: node.parentId,
        kind: "project",
        members: [command.member],
      });
      break;
    }
    case "placeNewProject": {
      const target = find(command.targetId);
      if (target.kind !== "project") throw new Error("请选择项目显示组");
      for (const node of tree.nodes)
        if (node.kind === "project")
          node.members = node.members.filter(
            (member) => memberKey(member) !== memberKey(command.member),
          );
      target.members.push(command.member);
      delete target.autoKey;
      tree.nodes = tree.nodes.filter((node) => node.kind !== "project" || node.members.length);
      for (const placement of tree.workspacePlacements ?? [])
        if (!tree.nodes.some((node) => node.id === placement.nodeId)) placement.nodeId = target.id;
      break;
    }
    case "moveWorkspace": {
      if (find(command.targetId).kind !== "project") throw new Error("请选择项目显示组");
      tree.workspacePlacements = (tree.workspacePlacements ?? []).filter(
        (entry) => entry.serverId !== command.serverId || entry.workspaceId !== command.workspaceId,
      );
      tree.workspacePlacements.push({
        serverId: command.serverId,
        workspaceId: command.workspaceId,
        nodeId: command.targetId,
      });
      break;
    }
  }
  return validateTree(tree);
}
