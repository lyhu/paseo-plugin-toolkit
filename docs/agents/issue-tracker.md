# Issue tracker：GitHub

本仓库的 issue 与规格文档统一存放在 GitHub Issues。所有操作使用 `gh` CLI。

仓库：`lyhu/paseo-plugin-toolkit`（由 `git remote -v` 推断，在克隆目录内执行 `gh` 时会自动识别）。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合适当的 `--label` 与 `--state` 过滤。
- **设为父 issue 的子 issue**：`gh issue create --parent <parent> ...`，或事后执行 `gh issue edit <parent> --add-sub-issue <child>`（需 `gh` 2.94+）。若当前 `gh` 版本较旧，可用 `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（数据库 id，见下文 **Blocking**）。不支持 sub-issue 时，在子 issue 正文顶部写 `Part of #<parent>`。
- **评论**：`gh issue comment <number> --body "..."`。
- **加 / 减标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`。
- **关闭**：`gh issue close <number> --comment "..."`。

## PR 是否作为 triage 请求来源

**否。** _（若本仓库把外部 PR 视作功能请求，改为 `是`；`/triage` 会读取该标记。）_

设为 `是` 时，PR 与 issue 走同一套标签与状态流转，命令改用 `gh pr` 等价操作：

- **读取 PR**：`gh pr view <number> --comments`；查看 diff 用 `gh pr diff <number>`。
- **列出待 triage 的外部 PR**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用编号空间，裸写 `#42` 可能是两者之一：先用 `gh pr view 42` 判断，失败再回退到 `gh issue view 42`。

## 当某个 skill 说“发布到 issue tracker”

创建一个 GitHub issue。

## 当某个 skill 说“获取相关工单”

按上文 **读取 issue** 的方式读取。

## Wayfinding 操作

供 `/wayfinder` 使用。**地图（map）** 是一个 issue，**子 issue** 是它的工单。

- **地图**：单个带 `wayfinder:map` 标签的 issue，正文保存 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **子工单**：作为 GitHub sub-issue 关联到地图（见 **设为父 issue 的子 issue**）。若未启用 sub-issue，则把子工单加入地图正文的任务列表，并在子工单正文顶部写 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。被认领后，指派给负责推进的开发者。
- **阻塞关系**：优先使用 GitHub 原生 issue dependencies（UI 可见的标准表示）。添加边：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞方 issue 的数字 **数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，不是 `#number` 或 `node_id`）。GitHub 通过 `issue_dependencies_summary.blocked_by` 返回仍未关闭的阻塞数。若 dependencies 不可用，退化为在子工单正文顶部写 `Blocked by: #<n>, #<n>`。所有阻塞方关闭后，该工单才算解除阻塞。
- **前沿查询（frontier）**：列出地图下所有处于 open 状态的子工单，剔除存在未关闭阻塞（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中有 open issue）或已有 assignee 的条目；按地图中的顺序取第一个。
- **认领**：`gh issue edit <n> --add-assignee @me`，作为本会话的第一次写操作。
- **解决**：`gh issue comment <n> --body "<答案>"`，然后 `gh issue close <n>`，最后在地图的 Decisions-so-far 中追加一条上下文指针（gist 与链接）。
