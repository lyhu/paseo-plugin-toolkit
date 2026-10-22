import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { emptyProjectNodes, type CatalogSnapshot } from "./catalog";
import { memberKey, type TreeCommand, type TreeNodeAction } from "../../shared/project-tree/model";
import {
  adjacentMove,
  edgeMove,
  folderDestinations,
  nodeActions,
  nodePath,
} from "../../shared/project-tree/actions";
import { tr } from "../i18n";

export function NodeActionsDialog({
  nodeId,
  initialAction,
  snapshot,
  theme,
  run,
  createWorkspace,
  onClose,
}: {
  nodeId?: string;
  initialAction: TreeNodeAction;
  snapshot: CatalogSnapshot;
  theme: PluginTheme;
  run(command: TreeCommand): Promise<void>;
  createWorkspace(
    groupId: string,
    serverId: string,
    path: string,
    title: string,
    mergeId?: string,
  ): Promise<void>;
  onClose(): void;
}) {
  const node = snapshot.tree.nodes.find((entry) => entry.id === nodeId);
  const [action, setAction] = useState(initialAction);
  const [name, setName] = useState(initialAction === "rename" ? (node?.name ?? "") : "");
  const [destination, setDestination] = useState<string | null>(
    initialAction === "folder" && node?.kind === "folder" ? node.id : (node?.parentId ?? null),
  );
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [serverId, setServerId] = useState(
    node?.kind === "project" ? node.members[0]!.serverId : "",
  );
  const [path, setPath] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const disabled = !snapshot.editable || pending || (!!nodeId && !node);
  const colors = theme.colors;
  const button = (label: string, press: () => void, unavailable = disabled) => (
    <Pressable
      key={label}
      disabled={unavailable}
      onPress={press}
      style={{ padding: 10, borderRadius: 6, opacity: unavailable ? 0.5 : 1 }}
    >
      <Text style={{ color: colors.foreground, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  const input = (value: string, change: (value: string) => void, label: string) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.foregroundMuted}
      value={value}
      onChangeText={change}
      editable={!disabled}
      style={{
        color: colors.foreground,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        padding: 10,
      }}
    />
  );
  const inFlight = useRef(false);
  const perform = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await work();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  };
  const execute = (command: TreeCommand) => perform(() => run(command));
  const dismiss = () => {
    if (!inFlight.current) onClose();
  };
  const choose = (next: TreeNodeAction) => {
    if ((next === "up" || next === "down") && node) {
      const command = adjacentMove(snapshot.tree, node, next);
      if (command) void execute(command);
      return;
    }
    if ((next === "top" || next === "bottom") && node) {
      const command = edgeMove(snapshot.tree, node, next);
      if (command) void execute(command);
      return;
    }
    if (next === "hide" && node) {
      void execute({ type: "hide", id: node.id, hidden: !node.hidden });
      return;
    }
    if (next === "hideEmpty") {
      const ids = emptyProjectNodes(snapshot).map((entry) => entry.id);
      if (ids.length) void execute({ type: "hideEmpty", ids });
      return;
    }
    if (next === "rename") setName(node?.name ?? "");
    if (next === "folder") {
      setName("");
      setDestination(node?.kind === "folder" ? node.id : null);
    }
    if (next === "new") setName("");
    setAction(next);
  };
  const freshId = () => `folder:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const selectedPath = path.trim().replace(/\/+$/, "");
  const project = snapshot.catalogs[serverId]?.projects
    .filter(
      (entry) =>
        selectedPath === entry.root.replace(/\/+$/, "") ||
        selectedPath.startsWith(`${entry.root.replace(/\/+$/, "")}/`),
    )
    .sort((a, b) => b.root.length - a.root.length)[0];
  const existingGroup = project
    ? snapshot.tree.nodes.find(
        (entry) =>
          entry.kind === "project" &&
          entry.members.some((member) => memberKey(member) === memberKey(project)),
      )
    : undefined;
  const needsMerge = !!existingGroup && existingGroup.id !== node?.id;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0006",
        }}
      >
        <Pressable
          accessibilityLabel={tr("取消")}
          disabled={pending}
          onPress={dismiss}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: "90%",
            maxWidth: 420,
            maxHeight: "80%",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.surface1,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600" }}>
            {node?.name ?? tr("新建分类文件夹")}
          </Text>
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {error ? <Text style={{ color: colors.foreground }}>{error}</Text> : null}
            {action === "menu" &&
              node &&
              nodeActions(snapshot.tree, node, emptyProjectNodes(snapshot).length).map((item) =>
                button(tr(item.label), () => choose(item.action), disabled || !!item.disabled),
              )}
            {(action === "rename" || action === "folder") && (
              <>
                {input(name, setName, tr("名称"))}
                {action === "folder" && (
                  <>
                    {button(tr("顶层"), () => setDestination(null))}
                    {snapshot.tree.nodes
                      .filter((entry) => entry.kind === "folder")
                      .map((folder) =>
                        button(
                          `${destination === folder.id ? "✓ " : ""}${nodePath(snapshot.tree, folder)}`,
                          () => setDestination(folder.id),
                        ),
                      )}
                  </>
                )}
                {button(
                  tr(action === "rename" ? "保存名称" : "创建文件夹"),
                  () => {
                    if (name.trim())
                      void execute(
                        action === "rename" && node
                          ? { type: "rename", id: node.id, name: name.trim() }
                          : {
                              type: "folder",
                              id: freshId(),
                              name: name.trim(),
                              parentId: destination,
                            },
                      );
                  },
                  disabled || !name.trim(),
                )}
              </>
            )}
            {action === "move" && node && (
              <>
                {button(tr("顶层"), () => {
                  void execute({ type: "move", id: node.id, parentId: null });
                })}
                {folderDestinations(snapshot.tree, node).map((folder) =>
                  button(nodePath(snapshot.tree, folder), () => {
                    void execute({ type: "move", id: node.id, parentId: folder.id });
                  }),
                )}
              </>
            )}
            {action === "merge" && node && (
              <>
                {snapshot.tree.nodes
                  .filter((entry) => entry.kind === "project" && entry.id !== node.id)
                  .map((target) =>
                    button(
                      `${mergeId === target.id ? "✓ " : ""}${nodePath(snapshot.tree, target)}${target.kind === "project" ? ` · ${target.members.map((member) => snapshot.hosts.find((host) => host.serverId === member.serverId)?.label ?? member.serverId).join(" / ")}` : ""}`,
                      () => setMergeId(target.id),
                    ),
                  )}
                <Text style={{ color: colors.foregroundMuted }}>
                  {tr("整个项目及其全部 workspace 将合并显示。")}
                </Text>
                {mergeId &&
                  button(tr("确认合并"), () => {
                    void execute({ type: "merge", sourceId: node.id, targetId: mergeId });
                  })}
              </>
            )}
            {action === "split" &&
              node?.kind === "project" &&
              node.members.map((member) => {
                const project = snapshot.catalogs[member.serverId]?.projects.find(
                  (entry) => entry.projectId === member.projectId,
                );
                const name = project?.name ?? node.name;
                const host =
                  snapshot.hosts.find((entry) => entry.serverId === member.serverId)?.label ??
                  member.serverId;
                return button(`${tr("拆出")} ${name} · ${host}`, () => {
                  void execute({
                    type: "split",
                    id: node.id,
                    member,
                    newId: `split:${freshId()}`,
                    name,
                  });
                });
              })}
            {action === "delete" && node && (
              <>
                <Text style={{ color: colors.foregroundMuted }}>
                  {tr("内容会提升到上一层，不会删除项目或 workspace。")}
                </Text>
                {button(tr("确认删除文件夹"), () => {
                  void execute({ type: "removeFolder", id: node.id });
                })}
              </>
            )}
            {action === "new" && node?.kind === "project" && (
              <>
                {snapshot.hosts.map((host) =>
                  button(
                    `${serverId === host.serverId ? "✓ " : ""}${host.label}`,
                    () => setServerId(host.serverId),
                    disabled || host.status !== "online",
                  ),
                )}
                {input(path, setPath, tr("目标 Host 上的绝对目录路径"))}
                {input(name, setName, tr("Workspace 名称（可选）"))}
                {needsMerge && (
                  <Text style={{ color: colors.foregroundMuted }}>
                    {tr("所选目录已有项目归属，确认后将整体合并到当前显示组。")}
                  </Text>
                )}
                {button(
                  tr(needsMerge ? "确认合并并创建" : "创建 workspace"),
                  () => {
                    void perform(() =>
                      createWorkspace(
                        node.id,
                        serverId,
                        path.trim(),
                        name.trim(),
                        needsMerge ? existingGroup!.id : undefined,
                      ),
                    );
                  },
                  disabled ||
                    !path.trim() ||
                    snapshot.hosts.find((host) => host.serverId === serverId)?.status !== "online",
                )}
              </>
            )}
          </ScrollView>
          {button(tr("取消"), dismiss, pending)}
        </View>
      </View>
    </Modal>
  );
}
