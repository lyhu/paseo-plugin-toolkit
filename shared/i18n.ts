import { decodeLocalizedMessage, renderMessage, type SupportedLocale } from "./chat-view/i18n";

const english: Record<string, string> = {
  编辑器高亮: "Editor highlighting",
  "当前高亮补丁无法匹配备份，请先恢复原始安装包。":
    "This highlight patch has no matching backup. Restore the original app first.",
  "补充 .env、INI、TOML、Shell、SQL、Dockerfile 和 .gitignore 的语法高亮。":
    "Add syntax highlighting for .env, INI, TOML, Shell, SQL, Dockerfile and .gitignore.",
  "作用于当前 Host 的 /Applications/Paseo.app；远程 Host 无法修改你电脑上的应用。":
    "Applies to /Applications/Paseo.app on this Host. A remote Host cannot modify the app on your computer.",
  "此功能会修改应用签名覆盖的前端资源，使原签名校验失败；不重新签名，也不重启 daemon。":
    "This modifies signed frontend resources, invalidating the original app signature. It does not re-sign the app or restart the daemon.",
  自动修补: "Automatic patching",
  "加载 Toolkit 时自动检测并应用": "Check and apply when Toolkit loads",
  "升级 Paseo 后重新加载 Toolkit，可重新应用；不兼容的版本会停止修改。":
    "Reload Toolkit after upgrading Paseo to reapply. Incompatible builds are left unchanged.",
  "正在检测高亮补丁…": "Checking highlight patch…",
  "当前 Host 不是 macOS，无法修改本机 Paseo 应用。":
    "This Host is not running macOS and cannot patch a local Paseo app.",
  "当前 Host 未找到 /Applications/Paseo.app。": "This Host has no /Applications/Paseo.app.",
  "检测到 Paseo，可应用编辑器高亮。": "Paseo detected. Editor highlighting can be applied.",
  "高亮补丁已应用。请重新加载 Paseo 界面后打开文件。":
    "Highlight patch applied. Reload the Paseo interface before opening files.",
  "已恢复原始前端文件。请重新加载 Paseo 界面。":
    "Original frontend restored. Reload the Paseo interface.",
  "高亮补丁操作失败，详情如下。": "Highlight patch failed. See details below.",
  "Paseo 版本：{0}": "Paseo version: {0}",
  "检测时间：{0}": "Checked at: {0}",
  "备份：{0}": "Backup: {0}",
  重新检测: "Check again",
  "正在应用高亮…": "Applying highlighting…",
  立即应用高亮: "Apply highlighting now",
  "正在恢复备份…": "Restoring backup…",
  恢复高亮备份: "Restore highlight backup",
  "恢复后如需保留原始文件，请先关闭自动修补；仅恢复与当前文件完全匹配的备份。":
    "Turn off automatic patching before restoring if you want to keep the original files. Only a backup matching the current file can be restored.",
  "应用补丁后需要重新加载整个 Paseo 界面，仅关闭再打开文件标签不会生效。请先保存未保存的文件。":
    "Reload the entire Paseo interface after applying. Reopening a file tab is not enough. Save unsaved files first.",
  "检测到其他版本或不完整的高亮补丁，请先恢复备份。":
    "A different or incomplete highlight patch was found. Restore its backup first.",
  "此 Paseo 前端结构不兼容，未修改任何文件。":
    "This Paseo frontend structure is incompatible. No files were modified.",
  "无法确认 Paseo 的高亮注册表，未修改任何文件。":
    "Could not identify Paseo's highlight registry. No files were modified.",
  "Paseo 文件已变化，已取消修改，请重新检测。":
    "The Paseo file changed. Patching was cancelled; check again.",
  "此 Paseo 版本尚未验证，未修改任何文件。":
    "This Paseo version has not been verified. No files were modified.",
  "无法确认 Paseo 的前端入口，未修改任何文件。":
    "Could not identify Paseo's frontend entry. No files were modified.",
  "Paseo 前端入口不是安装包内的普通文件，未修改任何文件。":
    "Paseo's frontend entry is not a regular file inside the app. No files were modified.",
  "高亮备份校验失败，未修改任何文件。":
    "Highlight backup verification failed. No files were modified.",
  "当前安装包没有可恢复的高亮补丁。": "The current app has no restorable highlight patch.",
  "安装包与高亮备份不匹配，已取消恢复。":
    "The highlight backup does not match this app. Restore was cancelled.",
  "高亮备份校验失败，已取消恢复。": "Highlight backup verification failed. Restore was cancelled.",
  会话列表: "Sessions",
  刷新: "Refresh",
  全部: "All",
  进行中: "Active",
  双击打开会话: "Double-click to open this session",
  "会话列表读取失败，请刷新重试。": "Could not load sessions. Refresh to retry.",
  "当前客户端不支持会话导航，请更新 Paseo。": "Update Paseo to open sessions from this list.",
  "会话列表分页未前进，请重试。": "Session pagination made no progress. Retry.",
  "正在读取会话列表…": "Loading sessions…",
  暂无匹配会话: "No matching sessions",
  "{0} 轮": "{0} turns",
  "打开会话：{0}": "Open session: {0}",
  "智能命名：{0}": "Generate title: {0}",
  "会话操作：{0}": "Session actions: {0}",
  "更多：{0}": "More: {0}",
  关闭更多菜单: "Close session menu",
  生成标题: "Generate title",
  "正在生成标题...": "Generating title...",
  复制标题: "Copy title",
  标题已复制: "Title copied",
  永久删除: "Delete permanently",
  永久删除会话: "Delete session permanently",
  确认永久删除: "Confirm permanent deletion",
  "同时删除 Provider 原始历史，无法撤销。项目文件保留。":
    "Also deletes the provider's original history. Cannot be undone. Project files are kept.",
  会话标题: "Session title",
  "正在处理…": "Processing…",
  "操作失败，请重试。": "Action failed. Retry.",
  "将永久删除此会话、Toolkit 总结和 Provider 原始历史，无法撤销。项目文件保留。":
    "Permanently delete this session, Toolkit summaries and the provider's original history. This cannot be undone. Project files are kept.",
  "命名请求失败，请重试。": "Could not start naming. Retry.",
  智能命名: "Smart titles",
  总结对话: "Summarizing",
  "命名失败，请重试。": "Naming failed. Retry.",
  总结归档: "Summarize & archive",
  归档新建: "Archive & new",
  "会话历史读取失败，请在智能命名中重试。":
    "Could not read conversation history. Retry in Smart titles.",
  "未能提交 /clear，请确认当前输入框后重试。":
    "Could not submit /clear. Check the current composer and retry.",
  "当前输入框已隐藏或会话已切换，请回到原会话后重试。":
    "The composer is hidden or the session changed. Return to the original session and retry.",
  "当前输入框包含附件，请移除后重试归档新建。":
    "Remove attachments from this composer before retrying Archive & new.",
  "无法写入 /clear，请确认当前输入框可编辑后重试。":
    "Could not insert /clear. Check that this composer is editable and retry.",
  "当前输入内容已变化，已取消归档新建，请重试。":
    "The draft changed. Archive & new was cancelled; please retry.",
  "无法定位当前输入框，请使用 /session-title 命名后手动输入 /clear。":
    "Cannot locate this composer. Use /session-title, then enter /clear manually.",
  已排队: "Queued",
  写回标题: "Saving title",
  轮次触发: "Turn completed",
  手动命名: "Manual naming",
  历史结果: "Previous result",
  暂无记录: "No records yet",
  "会话命名与归档记录，后台处理不会打断对话。":
    "Session naming and archive history. Background processing does not interrupt your conversation.",
  "会话列表（{0}）": "Sessions ({0})",
  搜索会话: "Search sessions",
  会话中: "Active",
  "{0} 次记录": "{0} runs",
  "暂无匹配会话；命名后会出现在这里。": "No matching sessions. Sessions appear after naming.",
  "选择会话后查看当次命名结果与历史记录。":
    "Select a session to inspect naming results and history.",
  重新命名: "Rename",
  命名记录: "Naming history",
  当次标题已设置: "Title saved in this run",
  当次标题未写回: "Title not saved in this run",
  会话摘要: "Session summary",
  收起详情: "Hide details",
  详细信息: "Details",
  "归档会话已变化，后台任务已停止，请重新命名。":
    "The archived conversation changed. The background task stopped; generate a new title.",
  "命名任务因插件重载中断，可重新命名。":
    "Naming was interrupted by a plugin reload. Generate a new title.",
  "会话归档未完成，请检查连接后重试。":
    "Archiving did not complete. Check the connection and retry.",
  "归档结果需要核对，请确认会话状态后重试。":
    "The archive outcome needs verification. Check the session state before retrying.",
  "「归档新建」立即执行 /clear，智能命名在后台继续；右侧「会话列表」可查找会话，行尾图标可触发智能命名。":
    "Archive & new runs /clear immediately; smart naming continues in the background. Find sessions on the right and use the trailing icon to generate a title.",
  自动总结调试: "Summary diagnostics",
  自动总结: "Auto summary",
  后台全量总结并自动设置会话标题:
    "Summarize in the background and automatically set the session title",
  "会话 ID：{0}": "Session ID: {0}",
  "已处理自动轮数：{0}": "Automatic turns processed: {0}",
  "最近触发：轮次结束": "Last trigger: turn completed",
  "最近触发：手动命令": "Last trigger: command",
  "正在设置会话标题…": "Setting session title…",
  "生成标题：{0}": "Generated title: {0}",
  重新总结并自动设置标题: "Summarize and set title again",
  "使用 /session-title 后台全量总结并自动设置标题；顶部「自动总结」可查看调试信息。":
    "Use /session-title to summarize and set the title in the background. Open Auto summary in the header for diagnostics.",
  "此会话已暂停自动命名，以保护人工标题或无法确认的轮次边界。":
    "Automatic naming is paused to protect a manual title or uncertain turn boundaries.",
  "此推荐标题已应用，无需重复操作。": "This suggested title has already been applied.",
  会话智能命名: "Smart session titles",
  会话总结与标题: "Session summary and title",
  "用法：/session-title（无需参数）": "Usage: /session-title (no arguments)",
  "正在读取会话总结…": "Loading session summary…",
  "会话文本将发送至 Toolkit 配置的模型服务；不包含工具原始输出和思考过程。":
    "Conversation text is sent to the configured Toolkit model. Raw tool output and reasoning are excluded.",
  "正在读取完整历史…": "Reading complete history…",
  "正在总结分段 {0}/{1}": "Summarizing segment {0}/{1}",
  "已取消会话总结。": "Session summary canceled.",
  "标题已应用。": "Title applied.",
  "覆盖 {0} 条用户与助手消息 · 截至位置 {1}":
    "Covers {0} user and assistant messages · through position {1}",
  "原有标题：{0}": "Previous title: {0}",
  应用推荐标题: "Apply suggested title",
  "如需收尾，先审阅此总结，再执行 /clear。当前 Paseo 不支持插件在 /clear 前拦截。":
    "To wrap up, review this summary, then run /clear. This Paseo version has no plugin interception before /clear.",
  "正在读取设置…": "Loading settings…",
  重置设置: "Reset settings",
  自动命名: "Automatic naming",
  前几轮自动维护业务标题: "Maintain business titles during the first few turns",
  "仅对能够确认轮次的新会话生效；人工改名后停止覆盖。":
    "Applies to new sessions with known turn boundaries. Stops after a manual rename.",
  "自动判断轮数（1–20）": "Automatic analysis turns (1–20)",
  "标题最多字符数（1–100）": "Maximum title characters (1–100)",
  "复用 Toolkit 模型：工作区覆盖优先，否则使用此 Host 默认模型。":
    "Uses Toolkit models: workspace override first, otherwise this Host’s default.",
  "请输入范围内的正整数。": "Enter a positive integer within the range.",
  "会话历史不完整，请刷新后重试；未执行改名。":
    "Conversation history is incomplete. Refresh and retry; no title was changed.",
  "会话历史分页未前进，请刷新后重试。": "History pagination made no progress. Refresh and retry.",
  "模型返回的总结格式无效，请重试。": "The model returned an invalid summary format. Retry.",
  "会话没有可总结的文本。": "This conversation has no text to summarize.",
  "推荐标题超过长度限制或格式无效，原标题已保留。":
    "The suggested title exceeds the limit or is invalid. The previous title was preserved.",
  "会话标题写回失败，请检查此 Host 的 Paseo CLI 与 daemon 连接。":
    "Could not save the title. Check the Paseo CLI and daemon connection on this Host.",
  "模型请求失败，请检查 Toolkit 模型配置后重试。":
    "Model request failed. Check the Toolkit model configuration and retry.",
  "会话不可用，请刷新后重试。": "Conversation unavailable. Refresh and retry.",
  "请等待当前会话执行完成后再总结。":
    "Wait for the current conversation turn to finish before summarizing.",
  "会话标题已变化，请重新生成预览。": "The conversation title changed. Generate a fresh preview.",
  "会话内容已变化，请重新生成预览。": "The conversation content changed. Generate a fresh preview.",
  "请先配置 Toolkit 共用 AI 模型。": "Configure a shared Toolkit AI model first.",
  "会话总结服务已停止。": "The session summary service has stopped.",
  "会话总结保存失败，请重试。": "Could not save the session summary. Retry.",
  "总结正在处理，请稍后重试。": "A summary is being processed. Retry shortly.",
  "会话总结已变化，请刷新后重试。": "The session summary changed. Refresh and retry.",
  "会话命名设置不可用，请刷新后重试。":
    "Session title settings are unavailable. Refresh and retry.",
  全域总览: "Global Overview",
  知行空间: "Knowledge & Action",
  打开知行空间: "Open Knowledge & Action",
  知行上下文: "Knowledge context",
  技能与记忆: "Skills and memory",
  固定: "Pinned",
  "在原生对话中继续思考与行动；技能和记忆在右侧管理。":
    "Continue in native conversations; manage skills and memory in the right panel.",
  "固定工作区，工作台内不提供删除或移除操作。":
    "Pinned workspace. Workbench does not offer delete or remove actions.",
  "请在知行空间工作区中打开此面板。": "Open this panel in the Knowledge & Action workspace.",
  "更新技能或记忆后，新建对话可完整应用最新上下文；已有对话可能保留先前内容。":
    "Start a new conversation to apply the latest skills and memory. Existing conversations may retain earlier context.",
  "请更新 Paseo 后打开知行空间。": "Update Paseo to open Knowledge & Action.",
  "知行空间尚未准备好，请重试。": "Knowledge & Action is not ready. Try again.",
  "正在打开原生工作区…": "Opening native workspace…",
  "原生文件打开暂不可用，请从文件树打开。":
    "Native file opening is unavailable. Open it from the file tree.",
  未命名会话: "Untitled session",
  显示会话列表: "Show session list",
  隐藏会话列表: "Hide session list",
  "更多会话({0})": "More sessions ({0})",
  "收起会话({0})": "Collapse sessions ({0})",
  "重命名 workspace": "Rename workspace",
  工作区操作: "Workspace actions",
  工作区名称: "Workspace name",
  收藏项目: "Favorite project",
  取消收藏: "Remove from favorites",
  所选项目将保存到: "Selected projects are saved to ",
  "Host 分组按资源归属自动更新；本次选择将保存到":
    "Host groups update automatically by resource ownership; this selection is saved to ",
  "配置 Host": "Configuration Host",
  "所有客户端请选择同一配置 Host；仅在该 Host 启用工作台。":
    "Choose the same configuration Host on all clients; enable Workbench only on that Host.",
  "配置 Host 当前不可编辑，请等待恢复连接。":
    "Configuration Host is unavailable for editing. Wait for reconnection.",
  "工作台已停用。": "Workbench is disabled.",
  "工作台已停用或配置 Host 已断开。":
    "Workbench is disabled or its configuration Host disconnected.",
  "工作区已创建，请刷新后检查归属。": "Workspace created. Refresh to check its project.",
  "工作区已创建，但实际项目归属发生变化；请通过项目节点的菜单确认合并。":
    "Workspace created, but its project changed. Confirm the merge from its project menu.",
  结束管理: "Finish organizing",
  管理目录: "Manage folders",
  组织项目: "Organize projects",
  新建分类文件夹: "New folder",
  重命名: "Rename",
  "移动到…": "Move to…",
  隐藏项目节点: "Hide project",
  显示项目节点: "Show project",
  "隐藏空 workspace 项目节点": "Hide empty projects",
  正常显示: "Show project and workspaces",
  "仅显示 Workspace": "Show workspaces only",
  "隐藏整个 Project": "Hide project and workspaces",
  取消全部隐藏: "Unhide all projects",
  已隐藏: "Hidden",
  根节点更多操作: "More tree actions",
  显示隐藏节点: "Show hidden nodes",
  删除文件夹: "Delete folder",
  "合并到…": "Merge into…",
  取消合并: "Split group",
  "新建 workspace": "New workspace",
  名称: "Name",
  目标文件夹: "Destination folder",
  顶层: "Top level",
  创建文件夹: "Create folder",
  保存名称: "Save name",
  确认移动: "Confirm move",
  "内容会提升到上一层，不会删除项目或 workspace。":
    "Contents move to the parent folder. Projects and workspaces are preserved.",
  确认删除文件夹: "Confirm folder deletion",
  "整个项目及其全部 workspace 将合并显示。":
    "The entire project and all its workspaces will be grouped together.",
  确认合并: "Confirm merge",
  拆出: "Separate",
  "目标 Host 上的绝对目录路径": "Absolute directory path on the target Host",
  "Workspace 名称（可选）": "Workspace name (optional)",
  "所选目录已有项目归属，确认后将整体合并到当前显示组。":
    "This directory belongs to another project. Confirming merges its entire group into this display group.",
  确认合并并创建: "Confirm merge and create",
  "创建 workspace": "Create workspace",
  原生项目组操作: "Native project group actions",
  整理此显示组: "Organize this display group",
  切换原生视图: "Switch to native view",
  项目操作: "Project actions",
  更多: "More",
  更多项目: "More projects",
  分组与场景: "Groups and scenarios",
  "原生项目操作暂不可用，请切换原生视图后重试。":
    "Native project actions are unavailable. Switch to Native view and try again.",
  复制分支名称: "Copy branch name",
  复制路径: "Copy path",
  导航视图: "Navigation view",
  工作台视图: "Workbench view",
  分组操作: "Group actions",
  只显示工作空间: "Show workspaces only",
  分组在搜索工作台维护: "Manage groups in the search workbench",
  "此分组暂无项目，请在搜索工作台添加。":
    "This group has no projects. Add projects in the search workbench.",
  复制完整路径: "Copy full path",
  完整路径: "Full path",
  已复制: "Copied",
  复制失败: "Copy failed",
  原生项目目录: "Native project directories",
  "按 Host 展示原生项目及其工作空间。": "Native projects and their workspaces, grouped by Host.",

  工作台: "Workbench",
  "{0}设置": "{0} settings",
  "新增树节点...": "Add tree node...",
  管理: "Manage",
  原生视图: "Native view",
  自定义视图: "Custom view",
  离线: "Offline",
  "正在读取项目…": "Loading projects…",
  暂无项目: "No projects",
  "当前客户端不支持工作区导航，请更新 Paseo。": "Update Paseo to navigate to workspaces.",
  "Toolkit 模型": "Toolkit models",
  "Toolkit 模型设置": "Toolkit model settings",
  "Toolkit 版本 v{0}": "Toolkit version v{0}",
  快捷提问: "Quick questions",
  维护快捷提问: "Manage quick questions",
  设置快捷提问: "Quick question settings",
  "快捷提问 ·": "Quick questions ·",
  当前工作空间的话术库: "Questions for this workspace",
  已保存: "Saved",
  保存修改: "Save changes",
  "正在保存…": "Saving…",
  "＋ 手动添加": "＋ Add manually",
  从工作区对话总结: "Summarize workspace history",
  模型设置: "Model settings",
  收起模型设置: "Hide model settings",
  "快捷提问已保存，各设备将同步更新。": "Quick questions saved and synced across devices.",
  "总结提示词已保存。": "Summary prompt saved.",
  "已加入 {0} 条，跳过 {1} 条重复话术。请保存。":
    "Added {0}; skipped {1} duplicates. Save your changes.",
  重试保存: "Retry save",
  "其他设备已更新。当前草稿仍保留，请复制需要的内容后载入最新版本。":
    "Another device updated these settings. Copy any draft changes before loading the latest version.",
  放弃草稿并载入最新版本: "Discard draft and load latest",
  "尚未配置 Toolkit 模型，暂时无法从历史生成问题。":
    "Configure a Toolkit model to summarize history.",
  配置模型: "Configure model",
  添加快捷提问: "Add quick question",
  取消: "Cancel",
  "例如：检查当前服务器集群的健康状态": "Example: Check the health of the server cluster",
  添加到问题库: "Add to questions",
  "主机已停用快捷提问，可在 Toolkit 功能设置中启用。":
    "Quick questions are disabled for this host. Enable them in Toolkit feature settings.",
  "话术不能为空，且每条不超过 8000 字符。": "Each question must contain 1–8,000 characters.",
  还没有快捷提问: "No quick questions yet",
  "点击上方“手动添加”，或者从工作区对话中总结候选问题。":
    "Add a question manually or summarize workspace history.",
  "来自历史总结 · 约 {0} 次": "From history · about {0} times",
  手动添加: "Added manually",
  快捷提问话术: "Quick question text",
  上移: "Move up",
  下移: "Move down",
  置顶: "Move to top",
  置底: "Move to bottom",
  "模型：{0}": "Model: {0}",
  总结模型: "Summary model",
  快捷入口已启用: "Workspace shortcut enabled",
  快捷入口已停用: "Workspace shortcut disabled",
  "已从草稿移除，请保存修改。": "Removed from draft. Save your changes.",
  总结提示词: "Summary prompt",
  收起提示词: "Hide prompt",
  总结提示词内容: "Summary prompt content",
  "总结提示词不能为空，且不超过 8000 字符。": "The summary prompt must contain 1–8,000 characters.",
  "保存后用于下一次总结；JSON 格式和来源校验由插件固定。":
    "Saved changes apply to the next summary. JSON format and source validation are fixed by the plugin.",
  保存提示词: "Save prompt",
  还原默认: "Restore defaults",
  编辑: "Edit",
  完成编辑: "Done editing",
  删除: "Delete",
  取消删除: "Cancel deletion",
  确认删除: "Confirm deletion",
  "{0}第 {1} 条": "{0} question {1}",
  "删除第 {0} 条": "Delete question {0}",
  "取消删除第 {0} 条": "Cancel deleting question {0}",
  "确认删除第 {0} 条": "Confirm deleting question {0}",
  "确认删除第 {0} 条（{1} 秒后可用）": "Confirm deleting question {0} (available in {1}s)",
  "{0} 秒后可确认删除": "Confirm deletion in {0}s",
  搜索问题: "Search questions",
  正在读取问题: "Loading questions",
  "正在读取快捷提问…": "Loading quick questions…",
  重试读取: "Retry loading",
  重试: "Retry",
  已停用: "Disabled",
  "直接发送：{0}": "Send now: {0}",
  直接发送: "Send now",
  编辑后发送: "Edit before sending",
  点击问题直接发送: "Click a question to send it now",
  点击铅笔可先编辑: "Click the pencil to edit it first",
  "无法发送，已复制到剪贴板。": "Could not send. Copied to the clipboard.",
  "无法发送。": "Could not send.",
  "填入输入框：{0}": "Insert into composer: {0}",
  填入输入框: "Insert into composer",
  "选择问题后会填入输入框，发送前仍可编辑。":
    "Choosing a question fills the composer; edit it before sending.",
  "无法写入输入框，已复制到剪贴板。": "Could not write to the composer. Copied to the clipboard.",
  "无法写入输入框。": "Could not write to the composer.",
  无匹配结果: "No matches",
  暂无问题: "No questions yet",
  编辑问题: "Edit question",
  发送编辑后的问题: "Send edited question",
  复制问题: "Copy question",
  "已复制到剪贴板。": "Copied to the clipboard.",
  "无法复制到剪贴板。": "Could not copy to the clipboard.",
  "从当前工作空间（含归档）最近的用户提问中提炼最多 20 条候选。":
    "Generate up to 20 candidates from recent user questions in this workspace, including archived conversations.",
  最近: "Latest",
  历史条数: "History limit",
  条用户提问: "user questions",
  "保存中…": "Saving…",
  保存设置: "Save settings",
  "历史条数必须为正整数。": "The history limit must be a positive integer.",
  "尚未配置总结模型。": "No summary model configured.",
  开始总结: "Start summary",
  重试总结: "Retry summary",
  重新开始: "Start again",
  重新总结: "Summarize again",
  "重试总结（含失败对话）": "Retry summary, including failed conversations",
  "正在启动…": "Starting…",
  "正在取消…": "Canceling…",
  取消总结: "Cancel summary",
  读取历史: "Reading history",
  分批总结: "Summarizing batches",
  合并候选: "Merging candidates",
  候选问题已就绪: "Candidates ready",
  总结失败: "Summary failed",
  总结已取消: "Summary canceled",
  查看详情: "Show details",
  查看进度: "Show progress",
  查看候选: "Show candidates",
  收起: "Hide",
  "任务状态读取失败：": "Could not load task status: ",
  重试读取进度: "Retry loading progress",
  "点击“重试总结”将重新读取历史并生成候选，已保存的问题不受影响。":
    "Retry reads history again and generates new candidates. Saved questions are kept.",
  "用户提问和必要的相邻助手文本会发送到已配置的模型服务；频次为分批归并后的估算值。":
    "User questions and nearby assistant context are sent to the configured model service. Frequencies are estimates after batch merging.",
  当前阶段: "Current stage",
  "· 读取成功": "· Read",
  "个对话 · 用户提问": "conversations · User questions",
  "条 · 失败": "questions · Failed",
  个: "conversations",
  "未读取：": "Could not read: ",
  收起执行详情: "Hide execution details",
  展开执行详情: "Show execution details",
  "最近 100 条记录 · 新记录在前": "Latest 100 events · newest first",
  "候选已加入问题库，请点击顶部“保存修改”。": "Candidates added. Click Save changes at the top.",
  "暂无候选提问，可重新总结或手动添加。":
    "No candidates. Summarize again or add questions manually.",
  "选择前 N 条": "Select top N",
  加入所选: "Add selected",
  条: "questions",
  选择: "Select",
  取消选择: "Deselect",
  "{0}第 {1} 条 · 约 {2} 次": "{0} question {1} · about {2} times",
  "候选问题 {0}": "Candidate question {0}",
  候选问题: "Candidate question",
  "添加第 {0} 条到快捷提问": "Add question {0} to quick questions",
  "{0}原始对话（{1}）": "{0} source conversations ({1})",
  查看: "Show",
  "从候选中移除第 {0} 条": "Remove candidate {0}",
  "打开原始对话 {0}": "Open source conversation {0}",
  主机默认: "Host default",
  工作区独立配置: "Workspace override",
  "主机默认（所有工作区）": "Host default (all workspaces)",
  当前工作区单独配置: "Workspace override",
  "历史总结和增强共用。当前使用：": "Shared by summary and enhancement. Using: ",
  模型连接: "Model connection",
  收起设置: "Hide settings",
  "API 地址，例如 https://api.example.com/v1": "API URL, e.g. https://api.example.com/v1",
  "API Key 已保存，留空保留": "API key saved; leave blank to keep",
  "API Key（可选）": "API key (optional)",
  模型名称: "Model name",
  获取模型列表: "Fetch models",
  "正在获取…": "Fetching…",
  选择模型: "Choose a model",
  测试连接: "Test connection",
  "正在测试…": "Testing…",
  "个模型 · 也可手动填写": " models · or enter a name manually",
  收起列表: "Hide list",
  搜索模型: "Search models",
  "选择模型 {0}": "Choose model {0}",
  "无匹配模型，可手动填写。": "No matching models. Enter a model name manually.",
  "连接正常 ·": "Connected ·",
  "ms · JSON 测试通过": "ms · JSON test passed",
  重试保存模型: "Retry saving model",
  保存模型配置: "Save model configuration",
  "将清除凭据 · 撤销": "Key will be cleared · Undo",
  清除已保存凭据: "Clear saved key",
  "正在读取模型配置…": "Loading model configuration…",
  重试读取模型配置: "Retry loading model configuration",
  "模型配置已更新，当前草稿保留。": "Model configuration changed. Your draft is kept.",
  载入最新模型配置: "Load latest model configuration",
  "模型配置已保存。": "Model configuration saved.",
  "已恢复使用主机默认模型。": "Restored the host default model.",
  "正在恢复…": "Restoring…",
  恢复使用主机默认模型: "Use host default model",
  "请选择工作区。": "Select a workspace.",
  "候选任务已更新或尚未完成，请刷新后重试。":
    "The candidate task changed or is not finished. Refresh and retry.",
  "共读取 {0} 条用户提问，选用最近 {1} 条参与总结":
    "Read {0} user questions; using the latest {1} for this summary",
  "其他设备已更新此工作空间。请重新加载后再保存；当前编辑内容仍保留。":
    "Another device updated this workspace. Reload before saving; your draft is kept.",
  "历史分页没有前进，请重试。": "History pagination did not advance. Retry loading.",
  "历史读取不完整，请重试。": "History is incomplete. Retry loading.",
  "合并第 {0} 轮第 {1}/{2} 组格式校验失败：{3} 正在自动重试 1/1":
    "Merge round {0}, group {1}/{2} failed validation: {3} Retrying 1/1",
  "存在重复话术，请合并后保存。": "Duplicate questions found. Merge them before saving.",
  "工作区模型配置需要指定工作区。": "Select a workspace for a model override.",
  "工作空间不存在或已不可用。": "The workspace no longer exists or is unavailable.",
  已取消总结: "Summary canceled",
  "已读取 {0}：{1} 条用户提问": "Read {0}: {1} user questions",
  "当前对话已不可用，请重新打开。": "This conversation is unavailable. Open it again.",
  "快捷提问已停用，请先在功能设置或当前工作区启用。":
    "Quick questions are disabled. Enable them in feature settings or this workspace.",
  "快捷提问数据无法读取，请检查主机上的 toolkit 数据文件。":
    "Could not read quick questions. Check the Toolkit data file on this host.",
  "总结失败，请重试。": "Summary failed. Please retry.",
  "总结完成：生成 {0} 条候选，读取失败 {1} 个对话":
    "Summary complete: {0} candidates; {1} conversations could not be read",
  "总结已取消，已保存的快捷提问不受影响": "Summary canceled. Saved quick questions are kept",
  "总结服务请求失败（HTTP {0}），请检查连接配置或稍后重试。":
    "Summary request failed (HTTP {0}). Check the connection or retry later.",
  "找到 {0} 个对话，开始读取历史": "Found {0} conversations; reading history",
  提供商不可用或历史无法恢复: "The provider is unavailable or history could not be restored",
  "服务未返回 JSON，请检查 API 地址。": "The service did not return JSON. Check the API URL.",
  "服务返回的模型列表格式不正确，可手动填写模型名称。":
    "The model list format is invalid. Enter a model name manually.",
  "模型候选引用了输入中不存在的来源，请重试总结。":
    "A candidate referenced an unknown source. Retry the summary.",
  "模型响应缺少有效的 candidates、text 或 sourceIds 字段，请重试总结。":
    "The response is missing valid candidates, text or sourceIds fields. Retry the summary.",
  "模型已连接，但未返回要求的 JSON 测试结果。请检查模型是否支持 JSON 输出。":
    "The model connected but did not return the required JSON test result. Check JSON output support.",
  "模型服务请求失败（HTTP {0}），请检查地址、API Key 和模型。":
    "Model request failed (HTTP {0}). Check the URL, API key and model.",
  "模型服务连接超时（20 秒），请重试。":
    "The model connection timed out after 20 seconds. Please retry.",
  "模型未返回文本，请检查模型是否支持 Chat Completions。":
    "The model returned no text. Check Chat Completions support.",
  "模型未返回有效文本，请检查模型配置。":
    "The model returned no valid text. Check the model configuration.",
  "模型输出超出长度限制，请重试总结。":
    "Model output exceeded the length limit. Retry the summary.",
  "模型返回的内容不是有效 JSON，请重试总结。":
    "The model returned invalid JSON. Retry the summary.",
  "模型配置已在其他页面更新，请重新加载后保存；当前草稿仍保留。":
    "Model configuration changed on another page. Reload before saving; your draft is kept.",
  "正在使用 {0} 总结第 {1}/{2} 批（{3} 条提问）":
    "Using {0} to summarize batch {1}/{2} ({3} questions)",
  "正在合并第 {0} 轮 · {1}/{2} 组（{3} 条候选）":
    "Merging round {0} · group {1}/{2} ({3} candidates)",
  正在启动总结: "Starting summary",
  "正在查找当前工作空间的对话（包含归档），选取最近 {0} 条用户提问":
    "Finding workspace conversations, including archived ones, for the latest {0} user questions",
  "正在读取 {0}/{1}：{2}": "Reading {0}/{1}: {2}",
  "此工作空间正在总结，请等待或取消当前任务。":
    "A summary is already running for this workspace. Wait or cancel it.",
  "没有可总结的用户提问。请检查历史读取结果后重试。":
    "No user questions to summarize. Check history loading and retry.",
  "第 {0}/{1} 批总结完成": "Batch {0}/{1} complete",
  "第 {0}/{1} 批格式校验失败：{2} 正在自动重试 1/1":
    "Batch {0}/{1} failed validation: {2} Retrying 1/1",
  "请使用不含凭据的 HTTP(S) API 地址。": "Use an HTTP(S) API URL without embedded credentials.",
  "请先保存总结模型的 API 地址和模型名称。": "Save the summary model API URL and model name first.",
  "请等待对话空闲后发送。": "Wait until the conversation is idle before sending.",
  "读取失败：{0} · {1}": "Could not read {0} · {1}",
  "问题标识重复，请重新加载。": "Duplicate question IDs. Please reload.",
  "{0}（已自动重试 1 次）": "{0} (retried once automatically)",
  "Toolkit 功能设置无法读取。": "Could not load Toolkit feature settings.",
  "当前阶段 {0}/{1} · 读取成功 {2} 个对话 · 用户提问 {3} 条 · 失败 {4} 个":
    "Stage {0}/{1} · Read {2} conversations · {3} user questions · {4} failed",
  "Toolkit 设置": "Toolkit Settings",
  "概览与主控": "Overview & Controls",
  "对话交互": "Chat & Interaction",
  "AI 与模型": "AI & Models",
  "智能辅助": "Smart Features",
  "系统与环境": "System & Environment",
  "功能设置导航": "Settings Navigation",
  "插件概览、子模块健康度与语言偏好": "Overview, module health and language preferences",
  "紧凑活动、Mermaid、吸顶提问、只读保护": "Compact activity, Mermaid, sticky questions, readonly protection",
  "项目多主机管理、分组视图与别名": "Cross-host projects, group tree and custom alias",
  "Host 级默认共享模型与工作区覆盖": "Host-level shared model and workspace overrides",
  "会话智能命名与提示词增强": "Smart session naming and prompt enhance",
  "编辑器高亮补丁与快捷提问库": "Editor highlight patch and quick questions library",
  "界面语言与多语言": "Language & Localization",
  "Toolkit 语言偏好": "Toolkit Language Preference",
  "选择 Toolkit 界面显示语言，也可跟随 Paseo 客户端默认设置。":
    "Choose display language for Toolkit or follow Paseo client default.",
  "跟随客户端语言": "Follow Client Language",
  "简体中文": "Simplified Chinese",
  "功能模块状态一览": "Module Status Overview",
  "已启用": "Enabled",
  "版本 v{0} · 适用 Paseo 0.13.x": "Version v{0} · For Paseo 0.13.x",
  "当前连接主机：{0}。所有子模块配置均在此统一管理，保障全局体验一致。":
    "Connected host: {0}. All submodules are configured here for a unified experience.",
  "紧凑推理与活动记录": "Compact Reasoning & Activity",
  "紧凑活动总开关": "Compact Activity Master Switch",
  "将推理过程和工具调用归并为可展开的紧凑记录，减少滚动篇幅。":
    "Consolidate reasoning and tool calls into compact expandable records.",
  "活动展示模式": "Activity Display Mode",
  "默认将推理与工具折叠或展开显示。": "Default display state for reasoning and tool calls.",
  "折叠": "Folded",
  "展开": "Detailed",
  "配色方案": "Palette Scheme",
  "活动记录边框与状态指示的主题色系。": "Theme colors for activity borders and status badges.",
  "鲜艳": "Vivid",
  "柔和": "Soft",
  "高对比度": "High Contrast",
  "推荐设置": "Recommended Settings",
  "使用紧凑活动时，建议在 Paseo 设置中将工具调用详情设为“详细 (Detailed)”。Overview 模式会在插件收到数据前归并内容，导致细节无法恢复。":
    "When using compact activity, setting tool details in Paseo to 'Detailed' is recommended.",
  "对话渲染与交互增强": "Chat Rendering & Interaction Enhancements",
  "Mermaid 交互图表": "Mermaid Interactive Diagrams",
  "在助手回答中自动检测并渲染流程图、时序图等，支持缩放和平移。":
    "Detect and render flowcharts, sequence diagrams in responses with zoom and pan.",
  "吸顶提问 (Sticky Questions)": "Sticky Questions",
  "在长会话向上滚动时，将当前回答对应的用户提问固定在视口顶部。":
    "Pin the corresponding user question to viewport top when scrolling up.",
  "只读消息保护": "Readonly Message Protection",
  "在网页界面隐藏已发送消息的撤回/编辑操作，防止误触破坏会话历史。":
    "Hide edit/recall actions for sent messages in web interface to avoid misclicks.",
  "跨 Host 工作台总控": "Cross-Host Workbench Controls",
  "启用工作台视图": "Enable Workbench View",
  "提供跨 Host 工作台视图、多主机资源总览、技能与记忆知行空间。":
    "Provide cross-host workbench view, multi-host resource overview, and knowledge space.",
  "工作台视图外观与命名": "Workbench Appearance & Naming",
  "左侧导航视图名称": "Sidebar Tree View Name",
  "左侧导航树显示的视图标题名称（留空恢复默认）。": "Display title for the sidebar tree view (empty for default).",
  "使用说明": "Usage Notes",
  "• 建议仅在长期在线的稳定配置 Host 开启工作台，由其统筹保存分组排序与展示偏好。\n• 左侧导航支持通过「工作台视图｜原生视图」按键直接切换，点击工作区保留原生 Agent 与终端标签。\n• 视图选择跟随当前设备独立保存，分组内容在配置 Host 统一同步。":
    "• Enable workbench on a stable online configuration Host to store grouping and preferences.\n• Switch between Workbench and Native view with sidebar buttons; workspaces retain agent/terminal tabs.\n• View mode is saved per device; groups are synced on the config Host.",
  "AI 共享模型服务": "AI Shared Model Service",
  "Host 默认模型与工作区覆盖": "Host Default Model & Workspace Overrides",
  "会话智能命名和提示词增强共用此模型配置。支持 OpenAI、Claude 以及兼容端点。可为主机设置默认配置，并允许特定工作区单独覆盖。":
    "Shared by session title and prompt enhance. Supports OpenAI, Claude, and compatible endpoints.",
  "自动命名业务会话": "Automatically Name Business Sessions",
  "仅对能够确认轮次的新会话生效；人工重命名后自动停止覆盖。":
    "Applies to new sessions with recognized turns; manual renaming stops further updates.",
  "在前几轮会话中逐步总结提炼标题。": "Progressively summarize titles during initial conversation turns.",
  "标题最大字符数（1–100）": "Max Title Length (1–100)",
  "自动生成标题的最大字符限制。": "Maximum character limit for automatically generated titles.",
  "智能命名复用 Toolkit 模型服务，若需更换请前往配置":
    "Smart naming shares Toolkit model service. Go to AI & Models tab to configure.",
  "AI 模型配置": "AI Model Settings",
  "提示词增强 (Prompt Enhance)": "Prompt Enhance",
  "启用输入框提示词增强": "Enable Prompt Enhance",
  "在输入框提供增强按钮，结合当前项目上下文扩展简短草稿。":
    "Provide an enhance button in composer to expand short drafts with project context.",
  "快捷提问库 (Quick Questions)": "Quick Questions Library",
  "启用快捷提问浮层与话术库": "Enable Quick Questions Floating Layer",
  "在输入框提供工作区话术浮层、手动维护常用提问、历史总结推荐。":
    "Floating workspace prompt library in composer with manual edit and history recommendations.",
  "macOS 编辑器语法高亮增强": "macOS Editor Syntax Highlighting",
  "加载时自动检测并修补": "Check and apply automatically on load",
  "补充 .env、TOML、Shell、SQL、Dockerfile 等文件的语法着色。升级 Paseo 后重载 Toolkit 即可自动重新修补。":
    "Add syntax coloring for .env, TOML, Shell, SQL, Dockerfile. Reload Toolkit to re-patch after upgrade.",
  "环境检测状态": "Environment Detection Status",
  "检测中…": "Checking…",
  "正在修补…": "Applying patch…",
  "立即应用高亮补丁": "Apply Highlight Patch",
  "恢复原始安装包": "Restore Original App",
  "提示：此补丁直接作用于当前 Host 的 /Applications/Paseo.app；远程 Host 无法修改你本地电脑上的应用。应用后请重新加载 Paseo 界面生效。":
    "Note: Directly patches /Applications/Paseo.app on this Host. Reload Paseo interface to take effect.",
  "Toolkit 版本 v{0} · 全局统一配置控制台": "Toolkit Version v{0} · Unified Settings Console",
};
export type TranslationValues = Record<string, string | number>;
function render(template: string, values: TranslationValues) {
  return template.replace(/\{(\d+)\}/g, (match, key: string) => String(values[key] ?? match));
}
const reverse = new Map(
  Object.entries(english).map(([source, translation]) => [translation, source]),
);
/**
 * Renders client literals and typed server messages. Untyped text passes through unchanged:
 * the reverse matcher that guessed at prose was removed when server messages became data.
 */
export function translate(
  locale: SupportedLocale,
  source: string,
  values?: TranslationValues,
): string {
  const message = decodeLocalizedMessage(source);
  if (message) return renderMessage(locale, message);
  const canonical = english[source] !== undefined ? source : reverse.get(source);
  if (canonical !== undefined)
    return render(locale === "en-US" ? english[canonical] : canonical, values ?? {});
  return values ? render(source, values) : source;
}
