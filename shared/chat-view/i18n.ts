/**
 * 插件国际化多语言词条与本地化助手模块
 * 支持中文 (zh-CN) 与英文 (en-US)，并提供环境自动推导
 */

import { z } from "zod";

export const localeSchema = z.enum(["zh-CN", "en-US"]);
export type SupportedLocale = z.output<typeof localeSchema>;
export type LocalePreference = "auto" | SupportedLocale;

export const messages = {
  "zh-CN": {
    "settings.quickQuestionsLabel": "快捷提问",
    "settings.quickQuestionsHint": "控制本主机所有工作区的快捷提问入口，已保存的话术保留。",
    "settings.sharedModels": "Toolkit 模型设置",
    "settings.sharedModelsHint": "历史总结和增强共用主机默认模型；工作区可单独覆盖。",
    // 设置页 (Settings)
    "settings.title": "功能设置",
    "settings.storedSettings": "已存设置",
    "settings.sectionFeatures": "功能开关",
    "settings.mermaidLabel": "Mermaid 图表",
    "settings.mermaidHint": "绘制助手回答中的流程图和时序图；关闭后恢复 Paseo 原生显示。",
    "settings.compactActivityLabel": "紧凑活动展示",
    "settings.compactActivityHint": "增强思考和工具调用的摘要与详情；关闭后恢复原生时间线。",
    "settings.stickyLabel": "吸顶提问",
    "settings.stickyHint": "仅支持桌面和浏览器；关闭后所有对话都不显示吸顶。",
    "settings.readonlyLabel": "锁定已发送消息",
    "settings.readonlyHint":
      "发送后隐藏「回退到此消息」，消息内容即不可再改写。仅支持桌面和浏览器，原生 App 无效；关闭后恢复原生回退入口。",
    "settings.sectionCompact": "紧凑活动显示",
    "settings.displayModeLabel": "展示模式 (Display mode)",
    "settings.displayModeFolded": "折叠为单行 (Folded)",
    "settings.displayModeDetailed": "逐项卡片 (Detailed)",
    "settings.displayModeFoldedDesc":
      "把一轮内的思考、命令与文件改动聚合成一行摘要，点击展开详情。",
    "settings.displayModeDetailedDesc": "每条工具调用与思考各占一行，逐项展示。",
    "settings.paletteLabel": "配色方案 (Palette)",
    "settings.paletteVivid": "鲜明 (Vivid)",
    "settings.paletteSoft": "柔和 (Soft)",
    "settings.paletteHighContrast": "高对比 (High contrast)",
    "settings.paletteVividDesc": "克制的分类色，活动行保持中性。",
    "settings.paletteSoftDesc": "图标以中性色为主，颜色只留给状态。",
    "settings.paletteHighContrastDesc": "更强的分隔线与状态色，便于快速扫读。",
    "settings.behaviorLabel": "交互说明 (Behavior)",
    "settings.behaviorDesc":
      "Folded 模式在单行摘要中紧凑聚合一轮内的全部思考、命令与文件修改，点击展开详情；Detailed 模式逐项显示单独卡片。",
    "settings.sectionLanguage": "多语言设置 (Language)",
    "settings.languageLabel": "界面语言",
    "settings.languageHint":
      "切换插件界面语言（简体中文 / English）。自动模式在浏览器端跟随系统语言，原生端回落到简体中文。",
    "settings.langAuto": "跟随系统 (Auto)",
    "settings.langZh": "简体中文 (Chinese)",
    "settings.langEn": "English (US)",
    "settings.sectionEnhance": "提示词增强",
    "settings.enhanceEnableLabel": "启用提示词增强",
    "settings.enhanceEnableHint":
      "开关打开后才出现入口：输入框上方的「增强」按钮，以及 /enhance 命令。关闭时所有入口一并隐藏，因此需要先在下方填写模型端点再打开。",
    "settings.apiEndpointLabel": "API 地址",
    "settings.apiEndpointHint":
      "兼容 OpenAI Chat Completions 的任意端点。可填基础地址（如 https://api.deepseek.com）、带 /v1 的地址或完整端点。",
    "settings.apiKeyLabel": "API 密钥",
    "settings.apiKeyHint": "保存在宿主设置中（文件权限 0600），仅用于向模型端点发起请求。",
    "settings.modelLabel": "模型",
    "settings.modelHint": "填写端点实际支持的模型 id，例如 gpt-4o-mini、deepseek-chat。",
    "settings.testConnection": "测试连接",
    "settings.testConnectionHint": "用当前填写的配置发一次最小请求，验证地址、密钥与模型是否可用。",
    "settings.testing": "检测中…",
    "settings.testBtn": "测试",
    "settings.testResult": "检测结果",
    "settings.enhanceNoteLabel": "说明",
    "settings.enhanceNoteDesc":
      "增强会读取项目的清单文件、脚本命令与说明文档作为上下文，只发送文本，不发送源码文件内容。插件不经过 Paseo 宿主账号，因此不会在你的对话列表里产生记录。",
    "settings.loading": "正在加载设置…",
    "settings.reload": "重新加载",
    "settings.reset": "重置",

    // 吸顶提问 (Sticky Questions)
    "sticky.pill": "吸顶提问",
    "sticky.copy": "复制当前提问",
    "sticky.copied": "已复制",
    "sticky.copyFailed": "复制失败，请重试",
    "sticky.ariaExpand": "展开当前提问全文",
    "sticky.ariaCollapse": "收起当前提问全文",
    "sticky.ariaCopied": "已复制当前提问",

    // 提示词增强 (Prompt Enhancement)
    "enhance.pillTitle": "增强提示词",
    "enhance.pillLabel": "增强",
    "enhance.commandDesc": "增强提示词：把诉求改写为可直接执行的完整提示词",
    "enhance.commandArgHint": "<原始提示词>",
    "enhance.commandUsage": "用法：/enhance <原始提示词>",
    "enhance.noComposerWeb": "未找到输入框，请刷新页面后重试；或改用 /enhance 命令",
    "enhance.noComposerNative": "当前平台无法读取输入框，请改用 /enhance <原始提示词> 命令",
    "enhance.emptyPrompt": "请先在输入框写下要增强的提示词",
    "enhance.unchanged": "原文已足够清晰，未做改写",
    "enhance.clipboardFallback": "当前平台无法回填输入框，增强结果已复制到剪贴板",
    "enhance.truncatedNote": "{summary}（已截断至 {limit} 字）",
    // 未改写的原因：服务端按请求语言渲染，直接作为提示条文案
    "enhance.skip.tooShort": "原文过短，没有可补全的内容",
    "enhance.skip.alreadyStructured": "原文动作明确、维度齐备，保持原样",
    "enhance.skip.missingDimensions": "原文已具备明确动作，仅缺{items}，保持原样",
    "enhance.skip.tooLong": "原文已超过 {limit} 字，保持原样",
    "enhance.dimension.goal": "目标与成功判据",
    "enhance.dimension.scope": "范围与边界",
    "enhance.dimension.constraints": "约束",
    "enhance.dimension.acceptance": "验收标准",
    "enhance.reason.workspaceUnavailable": "工作区已不可用，请重新打开后增强。",
    "enhance.reason.disabled": "提示词增强已在设置中关闭",
    "enhance.reason.notConfigured": "未配置模型端点，请在 Toolkit 模型设置中配置主机默认模型",
    "enhance.reason.noBody": "模型未返回增强正文",
    "enhance.reason.equivalent": "增强结果与原文等价",
    "enhance.reason.providerFailed": "模型调用失败：{detail}",
    "enhance.failure.http": "模型返回 {status}：{detail}",
    "enhance.failure.timeout": "模型调用超时（{ms}ms）",
    "enhance.failure.truncatedOutput": "模型输出被长度上限截断，请调小输入后重试",
    "enhance.failure.emptyResponse": "模型返回空内容",
    "enhance.probe.ok": "连接成功",
    "enhance.probe.incomplete": "请填写完整的 API 地址、API 密钥与模型名",
    "enhance.probe.timeout": "连接超时：{detail}",
    "enhance.probe.unauthorized": "密钥被拒绝：{detail}",
    "enhance.probe.notFound": "地址不存在：{detail}",
    "enhance.probe.modelUnavailable": "模型不可用：{detail}",

    // 图表 (Mermaid)
    "mermaid.skipped": "有 {count} 行未绘制：部分子图或样式语法暂不支持。",
    "mermaid.unsupported": "支持 flowchart 和 sequenceDiagram，当前内容显示源码。",
    "mermaid.diagram": "图表",
    "mermaid.zoomIn": "放大",
    "mermaid.zoomOut": "缩小",
    "mermaid.fit": "适应宽度",
    "mermaid.popOut": "全屏浏览",
    "mermaid.showCode": "源码",
    "mermaid.showDiagram": "图表",
  },
  "en-US": {
    "settings.quickQuestionsLabel": "Quick questions",
    "settings.quickQuestionsHint":
      "Show quick question buttons across this host. Saved questions are kept.",
    "settings.sharedModels": "Toolkit models",
    "settings.sharedModelsHint":
      "Summary and enhancement share the host model; workspaces can override it.",
    // Settings
    "settings.title": "Settings",
    "settings.storedSettings": "Stored settings",
    "settings.sectionFeatures": "Feature Toggles",
    "settings.mermaidLabel": "Mermaid Diagrams",
    "settings.mermaidHint":
      "Renders flowcharts and sequence diagrams in assistant messages; disable to restore native display.",
    "settings.compactActivityLabel": "Compact Activity",
    "settings.compactActivityHint":
      "Enhances summaries and details for reasoning and tool calls; disable to restore native timeline.",
    "settings.stickyLabel": "Sticky Questions",
    "settings.stickyHint":
      "Desktop and web only; disable to remove sticky question bar from all conversations.",
    "settings.readonlyLabel": "Lock Sent Messages",
    "settings.readonlyHint":
      "Hides 'Revert to this message' once sent, making message content immutable. Web & desktop only; disable to restore native revert.",
    "settings.sectionCompact": "Compact Activity Display",
    "settings.displayModeLabel": "Display mode",
    "settings.displayModeFolded": "Folded (Claude style: > Thought · Ran X commands)",
    "settings.displayModeDetailed": "Separate cards (IDE style)",
    "settings.displayModeFoldedDesc":
      "Group and fold all intermediate steps into a single compact line with click-to-expand details.",
    "settings.displayModeDetailedDesc":
      "Display each tool call and reasoning block as a separate row.",
    "settings.paletteLabel": "Palette",
    "settings.paletteVivid": "Vivid",
    "settings.paletteSoft": "Soft",
    "settings.paletteHighContrast": "High contrast",
    "settings.paletteVividDesc": "Restrained category accents with neutral activity rows.",
    "settings.paletteSoftDesc": "Mostly neutral icons with color reserved for status.",
    "settings.paletteHighContrastDesc": "Stronger dividers and status colors for easier scanning.",
    "settings.behaviorLabel": "Behavior",
    "settings.behaviorDesc":
      "Folded mode groups all thoughts, shell commands, and file edits within a turn into a single clickable summary line (> Thought · Ran X commands · Edited Y files). Detailed mode shows individual cards per tool call.",
    "settings.sectionLanguage": "Language",
    "settings.languageLabel": "UI Language",
    "settings.languageHint":
      "Display language for the plugin UI (Simplified Chinese / English). Auto follows the browser language and falls back to Simplified Chinese on native.",
    "settings.langAuto": "System Default (Auto)",
    "settings.langZh": "简体中文 (Chinese)",
    "settings.langEn": "English (US)",
    "settings.sectionEnhance": "Prompt Enhancement",
    "settings.enhanceEnableLabel": "Enable Prompt Enhancement",
    "settings.enhanceEnableHint":
      "Shows composer action pill and /enhance command once enabled. Configure model endpoint below before enabling.",
    "settings.apiEndpointLabel": "API Endpoint",
    "settings.apiEndpointHint":
      "Any OpenAI Chat Completions compatible endpoint. Supports base URL (e.g. https://api.deepseek.com) or full path.",
    "settings.apiKeyLabel": "API Key",
    "settings.apiKeyHint":
      "Stored in host settings (file permission 0600), used solely for model requests.",
    "settings.modelLabel": "Model",
    "settings.modelHint":
      "Model identifier supported by the endpoint, e.g. gpt-4o-mini, deepseek-chat.",
    "settings.testConnection": "Test Connection",
    "settings.testConnectionHint":
      "Sends a minimal request with current configuration to verify endpoint, key, and model availability.",
    "settings.testing": "Testing…",
    "settings.testBtn": "Test",
    "settings.testResult": "Test Result",
    "settings.enhanceNoteLabel": "About",
    "settings.enhanceNoteDesc":
      "Enhancement reads manifests, scripts, and docs as project context. Only text is sent, never full source files. Bypasses host account and creates no chat logs.",
    "settings.loading": "Loading settings…",
    "settings.reload": "Reload",
    "settings.reset": "Reset",

    // Sticky Questions
    "sticky.pill": "Sticky Questions",
    "sticky.copy": "Copy current question",
    "sticky.copied": "Copied",
    "sticky.copyFailed": "Copy failed, please retry",
    "sticky.ariaExpand": "Expand full question",
    "sticky.ariaCollapse": "Collapse full question",
    "sticky.ariaCopied": "Copied current question",

    // Prompt Enhancement
    "enhance.pillTitle": "Enhance Prompt",
    "enhance.pillLabel": "Enhance",
    "enhance.commandDesc": "Enhance prompt: expands vague request into actionable prompt",
    "enhance.commandArgHint": "<original prompt>",
    "enhance.commandUsage": "Usage: /enhance <original prompt>",
    "enhance.noComposerWeb": "Composer not found, please refresh page or use /enhance command",
    "enhance.noComposerNative":
      "Current platform cannot access composer, please use /enhance <original prompt>",
    "enhance.emptyPrompt": "Please enter a prompt in the composer first",
    "enhance.unchanged": "Prompt is already clear, kept unchanged",
    "enhance.clipboardFallback":
      "Cannot fill composer on current platform, result copied to clipboard",
    "enhance.truncatedNote": "{summary} (truncated to {limit} characters)",
    "enhance.skip.tooShort": "The prompt is too short to expand",
    "enhance.skip.alreadyStructured": "The prompt is already specific — kept as written",
    "enhance.skip.missingDimensions":
      "The prompt already names the action; {items} still missing — kept as written",
    "enhance.skip.tooLong":
      "The prompt is already longer than {limit} characters — kept as written",
    "enhance.dimension.goal": "goal",
    "enhance.dimension.scope": "scope",
    "enhance.dimension.constraints": "constraints",
    "enhance.dimension.acceptance": "acceptance",
    "enhance.reason.workspaceUnavailable":
      "The workspace is unavailable. Open it again before enhancing.",
    "enhance.reason.disabled": "Prompt enhancement is turned off in settings",
    "enhance.reason.notConfigured":
      "No model endpoint configured — configure the host model under Toolkit models",
    "enhance.reason.noBody": "The model returned no enhanced prompt body",
    "enhance.reason.equivalent": "The enhanced prompt is identical to the original",
    "enhance.reason.providerFailed": "Model call failed: {detail}",
    "enhance.failure.http": "The model returned {status}: {detail}",
    "enhance.failure.timeout": "The model call timed out after {ms} ms",
    "enhance.failure.truncatedOutput":
      "The model output hit the length ceiling; shorten the input and retry",
    "enhance.failure.emptyResponse": "The model returned an empty response",
    "enhance.probe.ok": "Connected",
    "enhance.probe.incomplete": "Fill in the API address, key and model first",
    "enhance.probe.timeout": "Connection timed out: {detail}",
    "enhance.probe.unauthorized": "Key rejected: {detail}",
    "enhance.probe.notFound": "Address not found: {detail}",
    "enhance.probe.modelUnavailable": "Model unavailable: {detail}",

    // Mermaid
    "mermaid.skipped":
      "{count} lines were not drawn: some subgraph or styling syntax is unsupported.",
    "mermaid.unsupported":
      "This plugin draws flowchart and sequenceDiagram. Showing the source instead.",
    "mermaid.diagram": "Diagram",
    "mermaid.zoomIn": "Zoom in",
    "mermaid.zoomOut": "Zoom out",
    "mermaid.fit": "Fit to view",
    "mermaid.popOut": "Pop out",
    "mermaid.showCode": "Show code",
    "mermaid.showDiagram": "Show diagram",
  },
} as const;

export type TranslationKey = keyof (typeof messages)["zh-CN"];
export type TranslationParams = Record<string, string | number>;

/**
 * 根据用户偏好与运行环境推导实际应呈现的语言
 */
export function resolveLocale(preference?: LocalePreference): SupportedLocale {
  if (preference === "zh-CN" || preference === "en-US") {
    return preference;
  }
  if (preference === "auto") {
    if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
      const lang = navigator.language.toLowerCase();
      if (lang.startsWith("zh")) return "zh-CN";
      if (lang.startsWith("en")) return "en-US";
    }
    return "zh-CN";
  }
  return "zh-CN";
}

/**
 * 翻译词条获取函数；词条里的 `{name}` 由 values 填充
 */
export function t(
  locale: SupportedLocale,
  key: TranslationKey,
  values?: TranslationParams,
): string {
  const dictionary = messages[locale] ?? messages["zh-CN"];
  const text: string = dictionary[key] ?? messages["zh-CN"][key] ?? key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
