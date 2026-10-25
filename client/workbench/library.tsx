import { useState } from "react";
import { View } from "react-native";
import { Action, Badge, Card, Copy, Empty, Field, Row, useWorkbenchTheme } from "./components";
import type { WorkbenchMemory, WorkbenchModel, WorkbenchSkill } from "./types";
import { tr } from "../i18n";
import { Icon } from "@getpaseo/plugin/client/ui";
type Props = {
  model: WorkbenchModel;
  run(task: () => Promise<unknown>): void;
  openMemory(memory: WorkbenchMemory): void;
  compact?: boolean;
  columns?: number;
  embedded?: boolean;
};
export function MemoryLibrary({
  model,
  run,
  openMemory,
  compact = false,
  embedded = false,
}: Props) {
  const [editing, setEditing] = useState<Partial<WorkbenchMemory> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const memories = model.memories.filter(
    (m) => filter === "all" || (filter === "candidates" ? !m.confirmed : m.scope === filter),
  );
  return (
    <View style={{ gap: 18 }}>
      <Row between>
        <View style={{ gap: 6, flex: 1 }}>
          {!embedded && (
            <Copy muted size={12} strong>
              A MEMORY THAT GROWS WITH YOU
            </Copy>
          )}
          <Copy size={embedded ? 17 : compact ? 27 : 32} strong>
            {tr(embedded ? "记忆" : "把经历，留成下一次的起点。")}
          </Copy>
          {!embedded && <Copy muted>{tr("每条记忆都有来源；你决定什么值得留下。")}</Copy>}
        </View>
        <Action
          primary
          disabled={!model.editable}
          onPress={() =>
            setEditing({ title: "", body: "", scope: "personal", confirmed: true, enabled: true })
          }
        >
          {tr("添加记忆")}
        </Action>
      </Row>
      <Copy muted size={12}>
        {tr("候选记忆确认后，才会加入对应范围的新消息上下文。")}
      </Copy>
      <Row>
        {[
          ["all", "全部"],
          ["candidates", "待确认"],
          ["personal", "个人"],
          ...model.projects.map((p) => [p.id, p.name]),
        ].map(([id, name]) => (
          <Action quiet key={id} selected={filter === id} onPress={() => setFilter(id)}>
            {tr(name)}
          </Action>
        ))}
      </Row>
      {editing && (
        <Card accent>
          <Field
            label={tr("标题")}
            value={editing.title}
            onChangeText={(title) => setEditing({ ...editing, title })}
          />
          <Field
            label={tr("内容")}
            multiline
            style={{ minHeight: 140 }}
            value={editing.body}
            onChangeText={(body) => setEditing({ ...editing, body })}
          />
          <Copy muted>{tr("范围")}</Copy>
          <Row>
            {[["personal", "个人"], ...model.projects.map((p) => [p.id, p.name])].map(
              ([id, name]) => (
                <Action
                  key={id}
                  selected={editing.scope === id}
                  onPress={() => setEditing({ ...editing, scope: id })}
                >
                  {tr(name)}
                </Action>
              ),
            )}
          </Row>
          <Row>
            <Action
              primary
              disabled={!editing.title?.trim() || !editing.body?.trim() || !model.editable}
              onPress={() =>
                run(async () => {
                  await model.saveMemory({
                    ...editing,
                    title: editing.title!.trim(),
                    body: editing.body!.trim(),
                    scope: editing.scope ?? "personal",
                    confirmed: editing.confirmed ?? true,
                    enabled: editing.enabled ?? true,
                  });
                  setEditing(null);
                })
              }
            >
              {tr("保存")}
            </Action>
            <Action onPress={() => setEditing(null)}>{tr("取消")}</Action>
          </Row>
        </Card>
      )}
      {!memories.length && (
        <Empty>{tr("这个范围还没有记忆。可以从 AI 的回复保存候选，也可以手动添加。")}</Empty>
      )}
      {memories.map((memory) => (
        <Card key={memory.id}>
          <Row between>
            <Copy strong size={17}>
              {memory.title}
            </Copy>
            <Copy muted size={12}>
              {memory.confirmed ? tr("已确认") : tr("待确认")} ·{" "}
              {memory.enabled ? tr("启用") : tr("停用")}
            </Copy>
          </Row>
          <Copy>{memory.body}</Copy>
          <Copy muted size={12}>
            {model.projects.find((p) => p.id === memory.scope)?.name ??
              tr(memory.scope === "personal" ? "个人" : memory.scope)}
          </Copy>
          <Copy muted size={12}>
            {tr("来源")}：{memory.source ?? tr("手动记录")}
          </Copy>
          <Row>
            <Action quiet disabled={!model.editable} onPress={() => setEditing(memory)}>
              {tr("编辑")}
            </Action>
            {!memory.confirmed && (
              <Action
                primary
                disabled={!model.editable}
                onPress={() => run(() => model.saveMemory({ ...memory, confirmed: true }))}
              >
                {tr("确认记忆")}
              </Action>
            )}
            <Action
              quiet
              disabled={!model.editable}
              onPress={() => run(() => model.saveMemory({ ...memory, enabled: !memory.enabled }))}
            >
              {memory.enabled ? tr("停用") : tr("启用")}
            </Action>
            {memory.session && (
              <Action quiet onPress={() => openMemory(memory)}>
                {tr("查看来源")}
              </Action>
            )}
            <Action quiet disabled={!model.editable} onPress={() => setDeleting(memory.id)}>
              {tr("删除")}
            </Action>
          </Row>
          {deleting === memory.id && (
            <Row>
              <Copy danger>{tr("删除这条记忆？")}</Copy>
              <Action
                disabled={!model.editable}
                onPress={() =>
                  run(async () => {
                    await model.removeMemory(memory.id);
                    setDeleting(null);
                  })
                }
              >
                {tr("确认删除")}
              </Action>
              <Action onPress={() => setDeleting(null)}>{tr("保留")}</Action>
            </Row>
          )}
        </Card>
      ))}
    </View>
  );
}
export function SkillsLibrary({
  model,
  run,
  compact = false,
  columns = 3,
  embedded = false,
  openSkill,
}: Omit<Props, "openMemory"> & { openSkill?(skill: WorkbenchSkill): void }) {
  const theme = useWorkbenchTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View style={{ gap: 18 }}>
      <Row between>
        <View style={{ gap: 6, flex: 1 }}>
          {!embedded && (
            <Copy muted size={12} strong>
              SKILLS / EXTEND YOUR ASSISTANT
            </Copy>
          )}
          <Copy size={embedded ? 17 : compact ? 27 : 32} strong>
            {tr(embedded ? "技能" : "从系统能力，到你的工作习惯。")}
          </Copy>
          {!embedded && <Copy muted>{tr("预装常用技能，也为将来的扩展留出位置。")}</Copy>}
        </View>
        <Action
          primary
          disabled={!model.editable || !model.ai.initialized}
          onPress={() => setAdding(true)}
        >
          {tr("添加技能")}
        </Action>
      </Row>
      <Copy muted size={12}>
        {tr("技能变更从新会话生效；运行中的会话可能已经加载旧内容。")}
      </Copy>
      {adding && (
        <Card accent>
          <Field label={tr("名称")} value={name} onChangeText={setName} />
          <Field
            label={tr("文件夹名称（英文、数字或短横线）")}
            value={slug}
            onChangeText={setSlug}
          />
          <Field
            label="SKILL.md"
            value={content}
            onChangeText={setContent}
            multiline
            style={{ minHeight: 200 }}
          />
          <Row>
            <Action
              primary
              disabled={
                !name.trim() ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
                !content.trim() ||
                !model.editable
              }
              onPress={() =>
                run(async () => {
                  await model.saveSkill({ name: name.trim(), slug, content });
                  setAdding(false);
                  setName("");
                  setSlug("");
                  setContent("");
                })
              }
            >
              {tr("保存技能")}
            </Action>
            <Action onPress={() => setAdding(false)}>{tr("取消")}</Action>
          </Row>
        </Card>
      )}
      {!model.skills.length && <Empty>{tr("初始化 AI 工作区后，在这里管理技能。")}</Empty>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
        {model.skills.map((skill) => (
          <View
            key={skill.id}
            style={{
              flexGrow: 1,
              minWidth: 0,
              flexBasis: compact ? "100%" : `${(100 - (columns - 1) * 1.4) / columns}%`,
              maxWidth: compact ? undefined : `${(100 - (columns - 1) * 1.4) / columns}%`,
            }}
          >
            <Card>
              <Row between>
                <View
                  style={{ padding: 10, borderRadius: 10, backgroundColor: theme.colors.surface2 }}
                >
                  <Icon name="Blocks" size={22} color={theme.colors.accent} />
                </View>
                <Badge>{skill.builtin ? tr("系统预装") : tr("自定义")}</Badge>
              </Row>
              <Copy strong size={19}>
                {skill.name}
              </Copy>
              <Copy muted>{skill.description}</Copy>
              <Copy muted size={12}>
                {skill.path}
              </Copy>
              <Copy muted size={12}>
                {skill.loaded ? tr("已确认当前会话加载") : tr("当前会话加载状态未知")}
              </Copy>
              <Row>
                <Action
                  quiet
                  selected={skill.enabled}
                  disabled={!model.editable}
                  onPress={() => run(() => model.toggleSkill(skill.id, !skill.enabled))}
                >
                  {skill.enabled ? tr("停用") : tr("启用")}
                </Action>
                {(openSkill || skill.content) && (
                  <Action
                    quiet
                    label={`${skill.name} · ${tr("查看内容")}`}
                    onPress={() =>
                      openSkill
                        ? openSkill(skill)
                        : setExpanded(expanded === skill.id ? null : skill.id)
                    }
                  >
                    {tr("查看内容")}
                  </Action>
                )}
              </Row>
              {!openSkill && expanded === skill.id && <Copy>{skill.content}</Copy>}
            </Card>
          </View>
        ))}
      </View>
    </View>
  );
}
