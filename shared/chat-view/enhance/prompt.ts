import type { EnvironmentProfile } from "./contract";
import type { EnhancePolicy } from "./policy";

/**
 * Byte-stable on purpose: every volatile detail (raw input, environment, policy) lives in the
 * user message, so provider-side prefix caching keeps hitting across projects and runs.
 * Edit the text and bump RULE_VERSION together — tests assert on rule ids, not on prose.
 */
export const ENHANCE_RULE_VERSION = 3;

export const ENHANCE_SYSTEM_PROMPT = `你是一个提示词增强器。你不是编程助手，不回答用户的任务本身，只产出指令。

# 唯一职责
把 <raw> 改写为一份可以直接交给编码 AI 执行、无需追问即可开工的提示词。

# 输入契约
<raw> 用户原始诉求
<missing> 原始诉求尚未覆盖的维度
<context> 项目环境画像（可能为空，或 kind 为 unknown）
<policy> 由环境推导出的补充维度、验收限制与硬约束
缺失即未知，禁止假设；禁止编造文件路径、命令、依赖、版本。

# 判定先行
依据 <missing> 判断：
- 缺 goal（未说明要做什么动作），或缺 2 项以上维度：执行增强。
- 四个维度基本齐备：原样返回 raw，禁止同义改写造句。

# 四个必填维度
每项一行，冒号后直接给内容，不加解释、不举例：
1 goal：目标与成功判据。
2 scope：范围与边界，明确不做什么。
3 constraints：约束，含技术栈、版本、性能、兼容、不可破坏项。
4 acceptance：验收与验证方式。
另按 <policy> 的 focus 补充环境相关维度；acceptance 只能引用 policy 限定的命令。

# 环境适配规则
- 必须使用 context 中出现的真实技术栈名与真实命令，不得替换为"你使用的框架"或"常用命令"。
- 验收只能引用 policy.acceptance 列出的命令；不存在验证命令时不得编造命令名。
- context 中的 constraints 视为硬约束，必须原样保留。
- 优先用 context 的 hotspots 路径锚定范围。
- context 的 kind 为 unknown 时不做环境偏置，并把"技术栈未知"列入 open_questions。
- references 是项目自己的文档，与 context 一致；冲突时以 context 为准。

# 硬约束
不改变用户原意；不引入用户未要求的目标；不输出解决方案代码，只输出提示词正文；
未知处写 {{待确认}} 并列入 open_questions；语言跟随用户原文语言；
正文不超过 200 字。宁可少写一句，也要把四个维度都写全——写满 200 字但缺维度，等于没写。

# 输出格式
只输出以下结构，不加任何解释：
<enhanced_prompt>增强后的提示词正文</enhanced_prompt>
<delta_summary>一句话说明补了什么，50 字以内</delta_summary>
<open_questions>每行一条待确认项，没有就写"无"</open_questions>

# 静默自检
输出前自查，不把自查过程写进产物：
是否存在凭空事实？是否混入用户没要求的目标？能否独立执行无需追问？是否与 context 冲突？
任一不过则重写后再输出。`;

export interface EnhanceMessage {
  role: "system" | "user";
  content: string;
}

export interface EnhancePromptInput {
  raw: string;
  missing: string[];
  profile: EnvironmentProfile;
  policy: EnhancePolicy;
}

export function buildEnhanceMessages(input: EnhancePromptInput): EnhanceMessage[] {
  return [
    { role: "system", content: ENHANCE_SYSTEM_PROMPT },
    { role: "user", content: renderUserBlock(input) },
  ];
}

export function renderUserBlock(input: EnhancePromptInput): string {
  return [
    "<raw>",
    input.raw,
    "</raw>",
    "",
    "<missing>",
    input.missing.length ? input.missing.join("、") : "无",
    "</missing>",
    "",
    "<context>",
    renderProfile(input.profile),
    "</context>",
    "",
    "<policy>",
    `focus: ${input.policy.focus.length ? input.policy.focus.join("；") : "无"}`,
    `acceptance: ${input.policy.acceptance}`,
    `constraints: ${input.policy.constraints.length ? input.policy.constraints.join("；") : "无"}`,
    "</policy>",
  ].join("\n");
}

/** Only fields the probe actually filled; an absent fact is reported as absent, not as a guess. */
function renderProfile(profile: EnvironmentProfile): string {
  const lines: string[] = [`kind: ${profile.projectKind}`, `root: ${profile.root}`];
  pushList(lines, "languages", profile.languages);
  pushList(lines, "packageManagers", profile.packageManagers);
  pushList(lines, "frameworks", profile.frameworks);
  const commands: string[] = [];
  for (const [name, command] of Object.entries(profile.commands))
    if (command) commands.push(`${name}=${command}`);
  if (commands.length) lines.push(`commands: ${commands.join("; ")}`);
  pushList(lines, "conventions", profile.conventions);
  pushList(lines, "constraints", profile.constraints);
  if (profile.hotspots.length)
    lines.push(
      `hotspots: ${profile.hotspots.map((hotspot) => `${hotspot.path} (${hotspot.reason})`).join("; ")}`,
    );
  if (profile.references.length) {
    lines.push("references:");
    for (const reference of profile.references)
      lines.push(`- ${reference.path}\n${indent(reference.excerpt, "  ")}`);
  }
  return lines.join("\n");
}

function pushList(lines: string[], label: string, values: readonly string[]) {
  if (values.length) lines.push(`${label}: ${values.join(", ")}`);
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
