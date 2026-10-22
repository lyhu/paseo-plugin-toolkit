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
    "settings.version": "Toolkit 版本 v{version}",
    "settings.storedSettings": "已存设置",
    "settings.sectionFeatures": "功能开关",
    "settings.sectionProjectTree": "万象工作台",
    "settings.showSessionsLabel": "默认显示会话",
    "settings.showSessionsHint": "默认隐藏工作空间下的会话；项目菜单中的单独设置优先于此默认值。",
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
    "settings.projectTreeLabel": "万象工作台",
    "settings.projectTreeHint":
      "用跨 Host 合并的自定义目录树替换侧栏的原生项目列表；仅在此配置 Host 上生效，所有客户端请选择同一 Host。",
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
    "enhance.failure.invalidResponse": "模型返回了无法解析的响应",
    "enhance.probe.ok": "连接成功",
    "enhance.probe.incomplete": "请填写完整的 API 地址、API 密钥与模型名",
    "enhance.probe.timeout": "连接超时：{detail}",
    "enhance.probe.unauthorized": "密钥被拒绝：{detail}",
    "enhance.probe.notFound": "地址不存在：{detail}",
    "enhance.probe.modelUnavailable": "模型不可用：{detail}",

    // 快捷提问与模型（服务端消息，跨 RPC 以 key + params 传递）
    "quickQuestions.error.duplicateQuestions": "存在重复话术，请合并后保存。",
    "quickQuestions.error.duplicateIds": "问题标识重复，请重新加载。",
    "quickQuestions.error.read": "快捷提问数据无法读取，请检查主机上的 toolkit 数据文件。",
    "quickQuestions.error.stale":
      "其他设备已更新此工作空间。请重新加载后再保存；当前编辑内容仍保留。",
    "quickQuestions.error.featureDisabled": "快捷提问已停用，请先在功能设置或当前工作区启用。",
    "quickQuestions.error.conversationUnavailable": "当前对话已不可用，请重新打开。",
    "quickQuestions.error.waitIdle": "请等待对话空闲后发送。",
    "quickQuestions.error.workspaceUnavailable": "工作空间不存在或已不可用。",
    "quickQuestions.error.summaryRunning": "此工作空间正在总结，请等待或取消当前任务。",
    "quickQuestions.error.noQuestions": "没有可总结的用户提问。请检查历史读取结果后重试。",
    "quickQuestions.error.candidateStale": "候选任务已更新或尚未完成，请刷新后重试。",
    "quickQuestions.error.modelNotConfigured": "请先保存总结模型的 API 地址和模型名称。",
    "quickQuestions.error.canceled": "已取消总结",
    "quickQuestions.error.summaryFailed": "总结失败：{detail}",
    "quickQuestions.error.historyReadFailed": "读取历史失败：{detail}",
    "quickQuestions.error.historyIncomplete": "历史读取不完整，请重试。",
    "quickQuestions.error.historyNoProgress": "历史分页没有前进，请重试。",
    "quickQuestions.error.formatMissingFields":
      "模型响应缺少有效的 candidates、text 或 sourceIds 字段，请重试总结。",
    "quickQuestions.error.formatUnknownSource": "模型候选引用了输入中不存在的来源，请重试总结。",
    "quickQuestions.error.formatTruncated": "模型输出超出长度限制，请重试总结。",
    "quickQuestions.error.formatEmpty": "模型未返回文本，请检查模型是否支持 Chat Completions。",
    "quickQuestions.error.formatInvalidJson": "模型返回的内容不是有效 JSON，请重试总结。",
    "quickQuestions.error.retriedOnce": "（已自动重试 1 次）",
    "quickQuestions.error.http": "总结服务请求失败（HTTP {status}），请检查连接配置或稍后重试。",
    "quickQuestions.error.timeout": "总结服务请求超时（90 秒），请重试总结。",
    "quickQuestions.activity.starting": "正在启动总结",
    "quickQuestions.activity.finding":
      "正在查找当前工作空间的对话（包含归档），选取最近 {limit} 条用户提问",
    "quickQuestions.activity.found": "找到 {count} 个对话，开始读取历史",
    "quickQuestions.activity.reading": "正在读取 {current}/{total}：{title}",
    "quickQuestions.activity.read": "已读取 {title}：{count} 条用户提问",
    "quickQuestions.activity.readFailed": "读取失败：{title}",
    "quickQuestions.activity.selected": "共读取 {total} 条用户提问，选用最近 {selected} 条参与总结",
    "quickQuestions.activity.summarizing":
      "正在使用 {model} 总结第 {current}/{total} 批（{count} 条提问）",
    "quickQuestions.activity.batchDone": "第 {current}/{total} 批总结完成",
    "quickQuestions.activity.batchRetry": "第 {current}/{total} 批格式校验失败，正在自动重试 1/1",
    "quickQuestions.activity.merging":
      "正在合并第 {round} 轮 · {current}/{total} 组（{count} 条候选）",
    "quickQuestions.activity.mergeRetry":
      "合并第 {round} 轮第 {current}/{total} 组格式校验失败，正在自动重试 1/1",
    "quickQuestions.activity.done": "总结完成：生成 {count} 条候选，读取失败 {failed} 个对话",
    "quickQuestions.activity.canceled": "总结已取消，已保存的快捷提问不受影响",
    "models.error.stale": "模型配置已在其他页面更新，请重新加载后保存；当前草稿仍保留。",
    "models.error.workspaceRequired": "工作区模型配置需要指定工作区。",
    "models.error.http": "模型服务请求失败（HTTP {status}），请检查地址、API Key 和模型。",
    "models.error.timeout": "模型服务连接超时（{seconds} 秒），请重试。",
    "models.error.invalidCatalog": "服务返回的模型列表格式不正确，可手动填写模型名称。",
    "models.error.invalidResponse": "服务未返回 JSON，请检查 API 地址。",
    "models.error.emptyResponse": "模型未返回有效文本，请检查模型配置。",
    "models.error.truncatedOutput": "模型输出被长度上限截断，请重试。",
    "models.error.probeJson":
      "模型已连接，但未返回要求的 JSON 测试结果。请检查模型是否支持 JSON 输出。",
    "models.error.baseUrl": "请使用不含凭据的 HTTP(S) API 地址。",
    "settings.error.unavailable": "Toolkit 功能设置无法读取。",

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
    "settings.version": "Toolkit version v{version}",
    "settings.storedSettings": "Stored settings",
    "settings.sectionFeatures": "Feature Toggles",
    "settings.sectionProjectTree": "Wanxiang Workbench",
    "settings.showSessionsLabel": "Show sessions by default",
    "settings.showSessionsHint":
      "Workspace sessions are hidden by default. Individual project menu settings override this default.",
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
    "settings.projectTreeLabel": "Wanxiang Workbench",
    "settings.projectTreeHint":
      "Replaces the sidebar's native project list with a merged, cross-host tree. Applies only to this configuration Host; use the same Host on every client.",
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
    "enhance.failure.invalidResponse": "The model returned an unreadable response",
    "enhance.probe.ok": "Connected",
    "enhance.probe.incomplete": "Fill in the API address, key and model first",
    "enhance.probe.timeout": "Connection timed out: {detail}",
    "enhance.probe.unauthorized": "Key rejected: {detail}",
    "enhance.probe.notFound": "Address not found: {detail}",
    "enhance.probe.modelUnavailable": "Model unavailable: {detail}",

    // Quick questions and models (server messages cross RPC as key + params)
    "quickQuestions.error.duplicateQuestions":
      "Duplicate questions found. Merge them before saving.",
    "quickQuestions.error.duplicateIds": "Duplicate question IDs. Please reload.",
    "quickQuestions.error.read":
      "Could not read quick questions. Check the Toolkit data file on this host.",
    "quickQuestions.error.stale":
      "Another device updated this workspace. Reload before saving; your draft is kept.",
    "quickQuestions.error.featureDisabled":
      "Quick questions are disabled. Enable them in feature settings or this workspace.",
    "quickQuestions.error.conversationUnavailable":
      "This conversation is unavailable. Open it again.",
    "quickQuestions.error.waitIdle": "Wait until the conversation is idle before sending.",
    "quickQuestions.error.workspaceUnavailable":
      "The workspace no longer exists or is unavailable.",
    "quickQuestions.error.summaryRunning":
      "A summary is already running for this workspace. Wait or cancel it.",
    "quickQuestions.error.noQuestions":
      "No user questions to summarize. Check history loading and retry.",
    "quickQuestions.error.candidateStale":
      "The candidate task changed or is not finished. Refresh and retry.",
    "quickQuestions.error.modelNotConfigured":
      "Save the summary model API URL and model name first.",
    "quickQuestions.error.canceled": "Summary canceled",
    "quickQuestions.error.summaryFailed": "Summary failed: {detail}",
    "quickQuestions.error.historyReadFailed": "Could not read history: {detail}",
    "quickQuestions.error.historyIncomplete": "History read was incomplete. Retry.",
    "quickQuestions.error.historyNoProgress": "History pagination did not advance. Retry.",
    "quickQuestions.error.formatMissingFields":
      "The response is missing valid candidates, text or sourceIds fields. Retry the summary.",
    "quickQuestions.error.formatUnknownSource":
      "A candidate referenced an unknown source. Retry the summary.",
    "quickQuestions.error.formatTruncated":
      "Model output exceeded the length limit. Retry the summary.",
    "quickQuestions.error.formatEmpty":
      "The model returned no text. Check Chat Completions support.",
    "quickQuestions.error.formatInvalidJson": "The model returned invalid JSON. Retry the summary.",
    "quickQuestions.error.retriedOnce": " (retried once automatically)",
    "quickQuestions.error.http":
      "Summary request failed (HTTP {status}). Check the connection or retry later.",
    "quickQuestions.error.timeout": "The summary request timed out after 90 seconds. Retry it.",
    "quickQuestions.activity.starting": "Starting summary",
    "quickQuestions.activity.finding":
      "Finding workspace conversations, including archived ones, for the latest {limit} user questions",
    "quickQuestions.activity.found": "Found {count} conversations; reading history",
    "quickQuestions.activity.reading": "Reading {current}/{total}: {title}",
    "quickQuestions.activity.read": "Read {title}: {count} user questions",
    "quickQuestions.activity.readFailed": "Could not read {title}",
    "quickQuestions.activity.selected":
      "Read {total} user questions; using the latest {selected} for this summary",
    "quickQuestions.activity.summarizing":
      "Using {model} to summarize batch {current}/{total} ({count} questions)",
    "quickQuestions.activity.batchDone": "Batch {current}/{total} complete",
    "quickQuestions.activity.batchRetry": "Batch {current}/{total} failed validation. Retrying 1/1",
    "quickQuestions.activity.merging":
      "Merging round {round} · group {current}/{total} ({count} candidates)",
    "quickQuestions.activity.mergeRetry":
      "Merge round {round}, group {current}/{total} failed validation. Retrying 1/1",
    "quickQuestions.activity.done":
      "Summary complete: {count} candidates; {failed} conversations could not be read",
    "quickQuestions.activity.canceled": "Summary canceled. Saved quick questions are kept",
    "models.error.stale":
      "Model configuration changed on another page. Reload before saving; your draft is kept.",
    "models.error.workspaceRequired": "Select a workspace for a model override.",
    "models.error.http": "Model request failed (HTTP {status}). Check the URL, API key and model.",
    "models.error.timeout": "The model connection timed out after {seconds} seconds. Please retry.",
    "models.error.invalidCatalog": "The model list format is invalid. Enter a model name manually.",
    "models.error.invalidResponse": "The service did not return JSON. Check the API URL.",
    "models.error.emptyResponse":
      "The model returned no valid text. Check the model configuration.",
    "models.error.truncatedOutput": "Model output was truncated by the length limit. Retry.",
    "models.error.probeJson":
      "The model connected but did not return the required JSON test result. Check JSON output support.",
    "models.error.baseUrl": "Use an HTTP(S) API URL without embedded credentials.",
    "settings.error.unavailable": "Could not load Toolkit feature settings.",

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

/** A message that crosses the RPC seam as data and is rendered where the locale is known. */
export interface LocalizedMessage {
  key: TranslationKey;
  params?: TranslationParams;
  /** Appended without a separator, so the suffix owns its punctuation. */
  suffix?: TranslationKey;
}

const translationKeys = Object.keys(messages["zh-CN"]) as [TranslationKey, ...TranslationKey[]];
export const localizedMessageSchema = z.object({
  key: z.enum(translationKeys),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  suffix: z.enum(translationKeys).optional(),
});

export function localized(
  key: TranslationKey,
  params?: TranslationParams,
  suffix?: TranslationKey,
): LocalizedMessage {
  return { key, params, suffix };
}

const LOCALIZED_ERROR_PREFIX = "toolkit:error:";

export class LocalizedError extends Error {
  readonly key: TranslationKey;
  readonly params?: TranslationParams;
  readonly suffix?: TranslationKey;

  constructor(key: TranslationKey, params?: TranslationParams, suffix?: TranslationKey) {
    super(`${LOCALIZED_ERROR_PREFIX}${JSON.stringify({ key, params, suffix })}`);
    this.name = "LocalizedError";
    this.key = key;
    this.params = params;
    this.suffix = suffix;
  }
}

/** Finds the end of the JSON object that starts at `start`, ignoring braces inside strings. */
function jsonObjectEnd(value: string, start: number): number {
  if (value[start] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * Decode a message produced by `LocalizedError`, which the host carries as a string. The host may
 * wrap the message with request context, so search for the marker instead of requiring a prefix.
 */
export function decodeLocalizedMessage(value: string): LocalizedMessage | undefined {
  const marker = value.indexOf(LOCALIZED_ERROR_PREFIX);
  if (marker < 0) return undefined;
  const start = marker + LOCALIZED_ERROR_PREFIX.length;
  const end = jsonObjectEnd(value, start);
  if (end < 0) return undefined;
  try {
    const parsed = localizedMessageSchema.safeParse(JSON.parse(value.slice(start, end)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

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

export function renderMessage(locale: SupportedLocale, message: LocalizedMessage): string {
  const text = t(locale, message.key, message.params);
  return message.suffix ? `${text}${t(locale, message.suffix)}` : text;
}
