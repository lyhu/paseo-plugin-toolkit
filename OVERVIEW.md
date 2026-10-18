# Paseo Toolkit

## English

Toolkit provides workspace quick questions and embedded chat tools: sticky questions, compact activity, Mermaid diagrams, read-only sent messages, and prompt enhancement. Each feature has its own switch. Quick questions can be written manually or generated from recent workspace history, including archived conversations. The default is the latest 50 user questions, configurable per workspace. Review, edit, and save selected candidates before using them from the composer popover.

History summaries and enhancement share a host default model, with optional workspace overrides. Configure an OpenAI-compatible Chat Completions endpoint; summaries require JSON output support. History summaries send user questions and nearby assistant text to that endpoint. Enhancement sends the draft and limited project context. Credentials remain on the host. Summary progress includes failures and retry actions; unsaved candidates are cleared on reload.

Requires Paseo 0.10.3 through 0.11.x. The interface supports Chinese and English. Sticky questions and read-only message guards require web or desktop; native enhancement uses a slash command and clipboard fallback. Avoid running the old chat-view plugin or overlapping timeline transformers alongside the embedded tools. Tunnel migration is not included yet.

## 简体中文

Toolkit 提供工作区快捷提问，并嵌入吸顶提问、紧凑活动、Mermaid、已发送消息只读与提示词增强，各功能可独立启停。话术可手动维护，也可从包含归档的工作区历史中总结；默认取最近 50 条用户提问，可按工作区调整。候选由用户审阅、编辑并保存，再从输入框浮层使用。

历史总结和增强共用主机默认模型，支持工作区覆盖。需要配置兼容 OpenAI Chat Completions 的端点，总结要求支持 JSON 输出。总结发送用户提问与相邻助手文本，增强发送草稿及有限项目上下文，凭据保留在主机。总结显示进度、失败原因并支持重试，未保存候选会在重载时清除。

需要 Paseo 0.10.3 至 0.11.x，界面支持中英文。吸顶和只读保护限网页及桌面端；原生增强使用斜杠命令与剪贴板降级。嵌入工具应避免与旧 chat-view 或同类时间线转换器同时启用。隧道尚未迁移。
