import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import {
  Action,
  Badge,
  Copy,
  Empty,
  Field,
  Row,
  WorkbenchModal,
  useWorkbenchTheme,
} from "./components";
import type { WorkbenchHost, WorkbenchProject } from "./types";
import { tr } from "../i18n";

type SelectionProps = {
  projects: WorkbenchProject[];
  hosts: WorkbenchHost[];
  selected: string[];
  disabled?: boolean;
  onChange(ids: string[]): void;
};

export function ProjectSelection({
  projects,
  hosts,
  selected,
  disabled,
  onChange,
}: SelectionProps) {
  const { colors } = useWorkbenchTheme();
  const [query, setQuery] = useState("");
  const [host, setHost] = useState("all");
  const available = projects.filter((project) => !project.system);
  const needle = query.trim().toLocaleLowerCase();
  const visible = available.filter(
    (project) =>
      (host === "all" || project.instances.some((instance) => instance.serverId === host)) &&
      [
        project.name,
        ...project.instances.flatMap((instance) => [
          instance.path,
          hosts.find((h) => h.id === instance.serverId)?.name ?? instance.serverId,
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
  );
  return (
    <View style={{ gap: 12 }}>
      <Field
        label={tr("搜索已有项目")}
        placeholder={tr("搜索项目名称、路径或 Host")}
        value={query}
        onChangeText={setQuery}
        editable={!disabled}
      />
      <ScrollView horizontal>
        <Row>
          <Action
            quiet
            selected={host === "all"}
            disabled={disabled}
            onPress={() => setHost("all")}
          >
            {tr("全部 Host")}
          </Action>
          {hosts.map((item) => (
            <Action
              key={item.id}
              quiet
              label={`${tr("筛选项目")} ${item.name}`}
              selected={host === item.id}
              disabled={disabled}
              onPress={() => setHost(item.id)}
            >
              {item.name}
            </Action>
          ))}
        </Row>
      </ScrollView>
      <Row between>
        <Copy muted size={12}>
          {visible.length} {tr("个可选项目")}
        </Copy>
        <Copy muted size={12}>
          {tr("已选择")} {selected.length}
        </Copy>
      </Row>
      <ScrollView
        style={{ maxHeight: 320 }}
        contentContainerStyle={{ gap: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {visible.map((project) => {
          const checked = selected.includes(project.id);
          return (
            <Pressable
              key={project.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`${tr("选择项目")} ${project.name}`}
              accessibilityState={{ checked, disabled: !!disabled }}
              disabled={disabled}
              onPress={() =>
                onChange(
                  checked ? selected.filter((id) => id !== project.id) : [...selected, project.id],
                )
              }
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: checked ? colors.accent : colors.border,
                backgroundColor: checked || pressed ? colors.surface2 : colors.surface1,
                borderRadius: 9,
                padding: 13,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: disabled ? 0.5 : 1,
              })}
            >
              <Icon
                name={checked ? "SquareCheck" : "Square"}
                size={19}
                color={checked ? colors.accent : colors.foregroundMuted}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                <Copy strong size={15}>
                  {project.name}
                </Copy>
                {project.instances.map((instance) => (
                  <View
                    key={JSON.stringify([instance.serverId, instance.projectId])}
                    style={{ gap: 3 }}
                  >
                    <Copy muted size={12} lines={1}>
                      {instance.path}
                    </Copy>
                    <Row>
                      <Badge icon="Server">
                        {hosts.find((h) => h.id === instance.serverId)?.name ?? instance.serverId}
                      </Badge>
                      {hosts.find((h) => h.id === instance.serverId)?.status === "offline" && (
                        <Badge>{tr("离线缓存")}</Badge>
                      )}
                    </Row>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
        {!visible.length && (
          <Empty>
            {available.length
              ? tr("没有匹配的项目，试试其他关键词或 Host。")
              : tr("尚未发现已有项目，请先连接 Host 或创建项目。")}
          </Empty>
        )}
      </ScrollView>
    </View>
  );
}

export function ProjectPickerDialog({
  title,
  detail,
  projects,
  hosts,
  initialSelected,
  editable,
  onSave,
  onClose,
  confirmLabel,
}: {
  title: string;
  detail: string;
  projects: WorkbenchProject[];
  hosts: WorkbenchHost[];
  initialSelected: string[];
  editable: boolean;
  confirmLabel: string;
  onSave(ids: string[]): Promise<void>;
  onClose(): void;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dismiss = () => {
    if (!inFlight.current) onClose();
  };
  async function save() {
    if (inFlight.current || !editable) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onSave(selected);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <WorkbenchModal title={title} onClose={dismiss} maxWidth={780}>
      <Copy muted>{detail}</Copy>
      <ProjectSelection
        projects={projects}
        hosts={hosts}
        selected={selected}
        disabled={pending || !editable}
        onChange={setSelected}
      />
      {error && <Copy danger>{error}</Copy>}
      <Row between>
        <Copy muted size={12}>
          {tr("同一项目可以加入多个分组。")}
        </Copy>
        <Row>
          <Action disabled={pending} onPress={dismiss}>
            {tr("取消")}
          </Action>
          <Action primary disabled={pending || !editable} onPress={() => void save()}>
            {pending ? tr("正在保存…") : confirmLabel}
          </Action>
        </Row>
      </Row>
    </WorkbenchModal>
  );
}
