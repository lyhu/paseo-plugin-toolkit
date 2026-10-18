# 领域词汇表 (Glossary)

本文档定义 `paseo-plugin-toolkit` 代码库、规格文档与日常协作中通用的领域核心术语。开发与文档编写时请使用标准术语，避免使用弃用词。

---

## 核心概念

### 工作台 (Workbench)

- **定义**：Toolkit 提供的替代/增强原生侧栏的项目与工作区管理系统。支持建立最多三层的自定义文件夹、跨 Host 项目显示组合并，以及将工作区从物理项目关系中以展示层方式重新组织。
- **英文对照**：`Workbench`
- **弃用同义词**：`万象工作台`、`Wanxiang Workbench`、`Custom Project Tree`（作为功能名弃用，代码内部模块名仍沿用 `project-tree`）
- **核心属性**：
  - **视图名称 (View Name)**：侧栏标题、Workspaces 下拉菜单与移动端独立页面的展示文案，默认为「我的工作台」，可在插件设置中自定义。
  - **配置 Host (Configuration Host)**：部署并启用工作台单点管理的主机。工作台全局树结构、节点归属与排序均持久化于此 Host，其他设备与 Host 均作为客户端消费其配置。
  - **工作区 Host (Workspace Host)**：实际运行 Paseo 守护进程、承载项目源码、终端与 Agent 会话的具体目标主机。
  - **显示组 (Display Group)**：跨多个 Host 或项目名称组合而成的虚拟项目容器，工作区直属于该组下展示，不改变磁盘物理路径。

### 快捷提问 (Quick Questions)

- **定义**：按工作区独立管理的话术词库系统，用于高频提示词、代码片段或调试指令的快速插入与发送。
- **英文对照**：`Quick Questions`
- **核心组件**：
  - **快捷提问浮层 (Popover)**：输入框上方的交互弹层，支持快速搜索、编辑预览与直接发送。
  - **提问维护页 (Management Panel)**：工作区提问的管理界面，支持手动新增、编辑、排序、防误删保护及智能总结。
  - **历史智能总结 (History Summary)**：从当前工作区的历史会话中采样用户提问，经 AI 模型聚类去重后提取的高频问题候选列表。
  - **总结提示词 (Summary Prompt)**：控制 AI 提取与聚类偏好的提示词模板，支持工作区级个性化覆盖。

### 提示词增强 (Prompt Enhancement)

- **定义**：在用户发送对话前，提取当前项目元数据（package.json、Cargo.toml、Git 状态、README 等有限摘录），交由 AI 模型将简短模糊的草稿扩展为包含背景、约束与验收标准的结构化 Prompt 的能力。
- **英文对照**：`Prompt Enhancement`
- **降级机制**：移动端或不支持 DOM 回填的宿主环境提供 `/enhance` 斜杠命令与系统剪贴板降级机制。

### 对话展示增强 (Chat View Enhancements)

- **吸顶提问 (Sticky Questions)**：滚动浏览长对话时，将当前视口对应的用户原始提问常驻停靠在界面顶部的交互组件。
- **紧凑活动 (Compact Activity)**：将模型深度思考（Thinking/Reasoning）与频繁的工具执行记录聚合为整洁、可展开的折叠卡片组件，支持鲜明 (Vivid)、柔和 (Soft) 与高对比 (High Contrast) 配色。
- **Mermaid 交互图表 (Mermaid Chart)**：在助手回答的代码块中实时解析并以内联 SVG 呈现的矢量关系图，支持流程图、时序图、缩放、平移与全屏预览。
- **只读消息保护 (Read-only Message Guard)**：在网页端对话流中隐藏针对已发出用户消息的撤回/回滚入口，防止误触破坏会话分支历史。

### 共用 AI 模型 (Shared AI Models)

- **定义**：由插件统一维护的 OpenAI 协议兼容模型配置中心，供“历史智能总结”与“提示词增强”等内部 AI 能力共享使用。
- **层级继承**：支持主机默认模型（Host Default），并允许单个工作区（Workspace Override）按需覆盖配置。
- **隔离安全**：API 凭据仅存储于主机守护进程本地磁盘（`0600` 权限），绝不向客户端回传明文密钥。

### 修订版 JSON 存储 (Revisioned JSON Storage)

- **定义**：基于单调递增修订号（`revision`）并带有 `.tmp` 原子重命名机制的轻量级 JSON 持久化存储抽象（`RevisionedJsonStorage`），提供乐观并发控制与防写入撕裂保护。
- **英文对照**：`Revisioned JSON`
