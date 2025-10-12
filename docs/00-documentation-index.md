# 📚 文档索引 - WhatsApp CRM 系统

本文档提供项目文档的完整索引和关系说明，确保文档间的一致性。

---

## 📋 文档结构总览

### 🎯 核心技术文档

| 文档 | 状态 | 描述 | 最后更新 |
|------|------|------|----------|
| [01-roadmap.md](./01-roadmap.md) | ✅ 最新 | 项目路线图和功能规划 | 2025-09-23 |
| [02-architecture.md](./02-architecture.md) | ✅ 最新 | 系统架构和技术栈 | 2025-09-23 |
| [03-db-schema.md](./03-db-schema.md) | ✅ 最新 | 数据库设计和表结构 | 2025-09-23 |
| [04-api-contracts.md](./04-api-contracts.md) | ✅ 最新 | API 接口文档 | 2025-09-23 |
| [daily_journal.md](./daily_journal.md) | ✅ 模板 | 每日发给 Cursor AI 的日报模板 | 2025-10-04 |
| [todo.md](./todo.md) | ✅ 任务清单 | 短期优先任务跟踪 | 2025-10-04 |

### 🎨 UI/UX 设计文档

| 文档 | 状态 | 描述 | 说明 |
|------|------|------|------|
| [05-ui-wireframes.md](./05-ui-wireframes.md) | ⚠️ 原始版本 | 详细UI线框设计 | 原有设计，部分过于复杂 |
| [06-customers-ui-design.md](./06-customers-ui-design.md) | ✅ 最新 | 客户管理页面设计 | 实用的现代设计方案 |
| [07-sales-pipeline-design.md](./07-sales-pipeline-design.md) | ✅ 最新 | 销售流水线设计 | 可拖拽Pipeline方案 |

### 🔧 工作流和集成文档

| 文档 | 状态 | 描述 | 说明 |
|------|------|------|------|
| [06-workflow-nodes.md](./06-workflow-nodes.md) | ⚠️ 未来功能 | 工作流节点定义 | 高级功能，暂未实现 |
| [08-integrations-setup.md](./08-integrations-setup.md) | ✅ 最新 | 集成配置指南 | WhatsApp、OpenAI、Google Sheets |

### 🛠️ 开发工具文档

| 文档 | 状态 | 描述 | 说明 |
|------|------|------|------|
| [git-cheatsheet.md](./git-cheatsheet.md) | ✅ 实用 | Git 操作参考 | 开发工具文档 |
| [github团队协作工作流.md](./github团队协作工作流.md) | ✅ 实用 | 团队协作指南 | 开发流程文档 |
| [开发日志模式说明.md](./开发日志模式说明.md) | ✅ 实用 | 开发日志规范 | 项目管理文档 |

---

## 🎯 当前系统状态 (v1.0)

### ✅ 已实现功能
- 完整的 WhatsApp 消息收发
- 基础客户管理（自动识别、存储）
- 实时聊天界面
- 消息状态追踪
- 现代化前端界面
- **🔌 集成配置系统**
  - WhatsApp 扫码登录和状态管理
  - OpenAI API Key 配置和加密存储
  - Google Sheets OAuth 2.0 授权流程
  - 统一的设置管理界面

### 🚧 正在开发 (v1.1)
- 完整的客户管理页面
- 客户筛选和搜索
- 批量操作功能

### 📋 计划中功能 (v2.0+)
- 销售Pipeline（可拖拽）
- 自动化工作流
- 高级分析报表

---

## ⚠️ 文档一致性说明

### 已解决的冲突
1. **✅ UI设计重复** - 删除了重复的 `05-ui-design.md`，保留专门的设计文档
2. **✅ 功能状态** - 更新了 roadmap 以反映真实的开发状态
3. **✅ 技术栈** - 明确了当前使用的CSS方案

### 需要注意的差异
1. **⚠️ UI复杂度** - `05-ui-wireframes.md` 的设计比当前实现复杂，作为未来参考
2. **⚠️ 工作流功能** - `06-workflow-nodes.md` 描述的是未来功能，当前未实现
3. **⚠️ 数据库扩展** - 某些设计文档假设了更复杂的数据结构

---

## 📖 文档使用指南

### 🚀 快速开始
1. 阅读 [README.md](../README.md) - 项目概览
2. 查看 [02-architecture.md](./02-architecture.md) - 了解系统架构
3. 参考 [04-api-contracts.md](./04-api-contracts.md) - API接口文档

### 🎨 UI/UX 开发
1. 当前实现参考 - 已有的聊天界面
2. 客户管理开发 - [06-customers-ui-design.md](./06-customers-ui-design.md)
3. 未来功能设计 - [05-ui-wireframes.md](./05-ui-wireframes.md)

### 🔧 后端开发
1. 数据库设计 - [03-db-schema.md](./03-db-schema.md)
2. API接口 - [04-api-contracts.md](./04-api-contracts.md)
3. 系统架构 - [02-architecture.md](./02-architecture.md)

### 📋 项目管理
1. 功能规划 - [01-roadmap.md](./01-roadmap.md)
2. 开发流程 - [github团队协作工作流.md](./github团队协作工作流.md)
3. 版本管理 - [git-cheatsheet.md](./git-cheatsheet.md)

---

## 🎯 推荐的开发优先级

基于当前文档和系统状态：

### 🥇 第一优先级 (立即)
1. **客户管理页面** - 按 `06-customers-ui-design.md` 实现
2. **基础筛选功能** - 状态、时间、关键词搜索
3. **客户详情面板** - 信息展示和编辑

### 🥈 第二优先级 (1个月)
4. **销售Pipeline** - 按 `07-sales-pipeline-design.md` 实现
5. **批量操作** - 多选客户进行批量更新
6. **基础Dashboard** - 数据统计概览

### 🥉 第三优先级 (未来)
7. **高级工作流** - 参考 `06-workflow-nodes.md`
8. **深度分析** - 转化漏斗、效果分析
9. **多渠道支持** - 邮件、短信集成

---

## 📝 文档维护规范

1. **更新文档时** - 同步更新本索引文件
2. **添加新功能** - 先更新设计文档，再开发
3. **解决冲突** - 在本文档记录决策和原因
4. **版本管理** - 重大更新时更新版本号和日期

---

这个文档索引确保了项目文档的一致性和可维护性，为团队开发提供清晰的指导。
