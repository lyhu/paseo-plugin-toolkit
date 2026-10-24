import { useState } from "react";
import { View } from "react-native";
import { Action, Card, Copy, Empty, Field, Row, Section } from "./components";
import type { WorkbenchMemory, WorkbenchModel } from "./types";
import { tr } from "../i18n";
type Props = {
  model: WorkbenchModel;
  run(task: () => Promise<unknown>): void;
  openMemory(memory: WorkbenchMemory): void;
};
export function MemoryLibrary({ model, run, openMemory }: Props) {
  const [editing, setEditing] = useState<Partial<WorkbenchMemory> | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const memories = model.memories.filter(
    (m) => filter === "all" || (filter === "candidates" ? !m.confirmed : m.scope === filter),
  );
  return (
    <View style={{ gap: 18 }}>
      <Section title="记忆" detail={tr("候选记忆确认后，才会加入对应范围的新消息上下文。")}>
        <Action
          primary
          disabled={!model.editable}
          onPress={() =>
            setEditing({ title: "", body: "", scope: "personal", confirmed: true, enabled: true })
          }
        >
          {tr("添加记忆")}
        </Action>
      </Section>
      <Row>
        {[
          ["all", "全部"],
          ["candidates", "待确认"],
          ["personal", "个人"],
          ...model.projects.map((p) => [p.id, p.name]),
        ].map(([id, name]) => (
          <Action key={id} selected={filter === id} onPress={() => setFilter(id)}>
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
          <Row>
            <Action disabled={!model.editable} onPress={() => setEditing(memory)}>
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
              disabled={!model.editable}
              onPress={() => run(() => model.saveMemory({ ...memory, enabled: !memory.enabled }))}
            >
              {memory.enabled ? tr("停用") : tr("启用")}
            </Action>
            {memory.session && <Action onPress={() => openMemory(memory)}>{tr("查看来源")}</Action>}
            <Action disabled={!model.editable} onPress={() => setDeleting(memory.id)}>
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
export function SkillsLibrary({ model, run }: Omit<Props, "openMemory">) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View style={{ gap: 18 }}>
      <Section title="技能" detail={tr("启用的技能会作为 AI 上下文。内置技能由工作台维护。")}>
        <Action
          primary
          disabled={!model.editable || !model.ai.initialized}
          onPress={() => setAdding(true)}
        >
          {tr("添加技能")}
        </Action>
      </Section>
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
      {model.skills.map((skill) => (
        <Card key={skill.id}>
          <Row between>
            <Copy strong size={17}>
              {skill.name}
            </Copy>
            <Copy muted size={12}>
              {skill.builtin ? tr("内置") : tr("自定义")} ·{" "}
              {skill.enabled ? tr("启用") : tr("停用")}
            </Copy>
          </Row>
          <Copy muted>{skill.description}</Copy>
          <Copy muted size={12}>
            {skill.path}
          </Copy>
          <Row>
            <Action
              disabled={!model.editable}
              onPress={() => run(() => model.toggleSkill(skill.id, !skill.enabled))}
            >
              {skill.enabled ? tr("停用") : tr("启用")}
            </Action>
            {skill.content && (
              <Action onPress={() => setExpanded(expanded === skill.id ? null : skill.id)}>
                {tr("查看内容")}
              </Action>
            )}
          </Row>
          {expanded === skill.id && <Copy>{skill.content}</Copy>}
        </Card>
      ))}
    </View>
  );
}
