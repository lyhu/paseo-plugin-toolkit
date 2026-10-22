# Paseo Toolkit 文档中心

欢迎查阅 `paseo-plugin-toolkit`（安装标识符 `toolkit`）的开发与规格文档体系。

## 文档索引

| 文档分类           | 文件路径                                                                                                     | 说明                                                                                 |
| :----------------- | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **产品主 PRD**     | [docs/product/prd.md](file:///Users/lyhu/project/paseo-plugin-toolkit/docs/product/prd.md)                   | 业务功能全貌、交互规则、多端适配矩阵与数据持久化规范（所有业务功能变更直接在此同步） |
| **领域词汇表**     | [GLOSSARY.md](file:///Users/lyhu/project/paseo-plugin-toolkit/GLOSSARY.md)                                   | 项目统一领域术语、标准英文命名、属性说明与弃用同义词对照                             |
| **项目主页 (中)**  | [README_zh.md](file:///Users/lyhu/project/paseo-plugin-toolkit/README_zh.md)                                 | 简体中文完整安装、使用指南、各模块配置与架构树                                       |
| **项目主页 (英)**  | [README.md](file:///Users/lyhu/project/paseo-plugin-toolkit/README.md)                                       | 英文安装说明、功能简介与开发指引                                                     |
| **概览说明**       | [OVERVIEW.md](file:///Users/lyhu/project/paseo-plugin-toolkit/OVERVIEW.md)                                   | 插件商店展示摘要（中英双语）                                                         |
| **Agent 领域规范** | [docs/agents/domain.md](file:///Users/lyhu/project/paseo-plugin-toolkit/docs/agents/domain.md)               | Agent 探索与修改代码时的领域文档消费指南                                             |
| **Issue 跟踪规范** | [docs/agents/issue-tracker.md](file:///Users/lyhu/project/paseo-plugin-toolkit/docs/agents/issue-tracker.md) | Issue 创建、关联与状态流转规则                                                       |
| **分流标签规范**   | [docs/agents/triage-labels.md](file:///Users/lyhu/project/paseo-plugin-toolkit/docs/agents/triage-labels.md) | 标签体系与分类规则                                                                   |

---

## 维护原则

1. **主 PRD 单一真理源**：所有新功能引入、交互规则调整均直接合并至 [docs/product/prd.md](file:///Users/lyhu/project/paseo-plugin-toolkit/docs/product/prd.md)，严禁碎片化散落创建临时 PRD。
2. **过程记录隔离**：技术设计、重构清单与研发执行计划存放在 `.plans/` 等本地被忽略目录中，不作为业务 PRD 提交。
3. **领域语言一致性**：编写代码、测试名、文档与提交信息时，严格使用 [GLOSSARY.md](file:///Users/lyhu/project/paseo-plugin-toolkit/GLOSSARY.md) 规定的标准术语。
