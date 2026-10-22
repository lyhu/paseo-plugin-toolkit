# 领域文档

各工程类 skill 在探索本仓库代码时，如何消费本仓库的领域文档。

## 探索之前，先读这些

- 仓库根目录的 **`GLOSSARY.md`**，或
- 根目录的 **`GLOSSARY-MAP.md`**（若存在）：它指向每个上下文各自的 `GLOSSARY.md`，只读与当前主题相关的那几份。
- **`docs/adr/`**：读取涉及当前工作区域的 ADR。多上下文仓库还需检查 `src/<context>/docs/adr/` 中的上下文级决策。

这些文件不存在时，**静默继续**。不要主动提示其缺失，也不要在一开始就建议创建。`/domain-modeling` skill（通过 `/grill-with-docs` 与 `/improve-codebase-architecture` 触达）会在术语或决策真正确定时按需创建。

## 文件结构

本仓库为 **单上下文（single-context）**：

```
/
├── GLOSSARY.md
├── docs/adr/
├── index.client.tsx      客户端入口与生命周期注册
├── index.server.ts       服务端入口与生命周期注册
├── client/               快捷问题、模型配置、会话展示等 UI
├── server/               历史读取、摘要任务、持久化与端点探测
└── shared/               RPC 契约、校验 schema、i18n 词典
```

`client/`、`server/`、`shared/` 是同一上下文内的代码分层，不是独立领域上下文：它们共享一套术语，不各自维护 glossary 或 ADR。

## 使用 glossary 的词汇

当输出中出现领域概念（issue 标题、重构提案、假设、测试名）时，使用 `GLOSSARY.md` 中定义的术语。不要漂移到 glossary 明确弃用的同义词。

如果需要的概念尚未收录，这本身是一个信号：要么你在发明项目不使用的语言（应重新考虑），要么确实存在缺口（记录下来，交给 `/domain-modeling`）。

## 标记 ADR 冲突

当输出与既有 ADR 矛盾时，显式指出，而不是悄悄覆盖：

> _与 ADR-0007（event-sourced orders）冲突，但值得重新讨论，因为……_
