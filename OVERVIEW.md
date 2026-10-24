# Paseo Toolkit

## English

Toolkit adds a cross-Host workbench, personal AI sessions, workspace quick questions, and conversation display tools to Paseo. Workbench has project and Host views, favorites, scenario assignments, focus tasks, personal memory, skills, and indexed history search. Opening a workspace retains Paseo’s native Agent and Terminal tabs. The optional sidebar tree supports nested folders without a product depth limit and cross-Host display groups. Display snapshots restore organization, tabs, favorites, and scenario assignments while preserving focus tasks, memory, and actual resources.

Use one stable configuration Host for shared organization. Initialize personal AI explicitly and select a discovered Provider/model to create a real session. Only confirmed, enabled memory in the matching scope enters context. Skills are real files; disable removes them from discovery and future context. Existing sessions may retain loaded content, so start a new session after skill changes. Reloading the plugin also requires a new personal AI session to reconnect its tools. Provider permissions still apply.

Creation requests become editable plans before the user confirms execution. Remote operations target the selected Host and require an existing directory there. Partial and unknown outcomes are shown without automatically repeating creation. History search covers explicitly indexed sessions, shows coverage, and reads user and assistant text rather than tool output. The configuration Host stores memory and indexed text; personal AI sends selected context to the chosen Provider. Four Workbench palettes are available through Paseo’s Settings → Appearance.

Quick questions can be written manually or suggested from workspace history, including archived sessions. Review and save candidates before using them. History summaries and prompt enhancement use a configured OpenAI-compatible endpoint, with a host default and optional workspace overrides. Summaries send user questions and nearby assistant text; enhancement sends the draft and limited project context. Credentials remain on the host. Sticky questions, compact activity, Mermaid, and sent-message protection have separate switches.

Requires Paseo 0.13.x on client and daemon. The interface supports Chinese and English. Browser behavior and React Native components are tested; simulator and physical-device acceptance remains pending. Sticky questions and sent-message protection require web or desktop. Native prompt enhancement uses a slash command and clipboard fallback. Disable overlapping timeline tools in other plugins to avoid duplicate rendering.

## 简体中文

Toolkit 为 Paseo 提供跨 Host 工作台、个人 AI 会话、工作区快捷提问和对话展示工具。工作台包含项目与主机视图、常用项目、场景归属、关注任务、个人记忆、技能和历史索引搜索。打开工作区保留原生 Agent 与 Terminal 标签。可选侧栏树支持没有产品层数上限的文件夹和跨 Host 显示组。展示快照恢复树、标签、常用项目与场景归属，并保留关注任务、记忆和真实资源。

使用一台稳定的配置 Host 保存共享组织。显式初始化个人 AI，并选择实际发现的 Provider/模型创建真实会话。只有已确认、已启用且作用域匹配的记忆进入上下文。技能保存为真实文件，禁用后移出发现目录和后续上下文；已有会话可能保留已加载内容，修改技能后需新建会话。插件重载后也需新建个人 AI 会话重新连接工具。Provider 权限确认仍然生效。

创建请求先形成可编辑计划，由用户确认执行。远端操作发往所选 Host，目标目录须预先存在。部分完成和未知结果单独显示，不自动重复创建。历史搜索只覆盖显式索引的会话并显示覆盖范围，读取用户和助手文本，不包含工具输出。配置 Host 保存记忆与索引文本，个人 AI 将选定上下文发送给所选 Provider。四套工作台配色通过 Paseo 的“设置 → 外观”选择。

快捷提问可手动维护，也可从含归档的工作区历史中生成候选，经审阅保存后使用。历史总结与提示词增强共用 OpenAI 兼容端点，支持主机默认和工作区覆盖；总结发送用户提问及相邻助手文本，增强发送草稿和有限项目上下文。凭据保留在主机。吸顶提问、紧凑活动、Mermaid 和已发送消息保护分别提供开关。

客户端和守护进程需要 Paseo 0.13.x，界面支持中英文。已进行浏览器验证与 React Native 组件测试，尚待模拟器和真机验收。吸顶与已发送消息保护限网页或桌面；原生提示词增强使用斜杠命令和剪贴板降级。请关闭其他插件中的重叠时间线工具，避免重复渲染。
