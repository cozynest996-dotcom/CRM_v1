# 客户列表（Customer Lists）与自定义列设计文档

本文档描述 Customer Lists 功能的设计 —— 一个类似电子表格的可配置视图，用于展示 `customers` 表，支持自定义列、列映射、保存视图与导出。

## 目标

- 提供类似表格/电子表格的客户视图，便于快速查看与批量操作。
- 允许用户创建并保存自定义视图（列表），可选择列并调整列顺序。
- 支持将数据库字段映射为列，并支持简单的派生列（例如“预算区间”）。
- 支持权限与多用户的已保存视图共享。
- 提供后端 API 接口，用于列出、保存、更新、删除视图，以及按视图配置拉取行数据并分页。

## 导航与用户体验（UX）

- 在主导航中新增一级入口：**客户列表**（位于 `Customers`、`Workflows` 等附近）。
- 默认视图显示 `customers` 表的若干默认列：`姓名`、`电话`、`状态`、`最近消息`、`最后联系时间`、`标签`。
- 页面布局：
  - 左侧面板：已保存视图列表（用户的私有视图与共享视图）。操作按钮：`+ 新建视图`、`导入`、`导出`。
  - 主区域：类似 sheet 的网格（支持列拖拽、列选择、列宽调整）、筛选器、搜索、分页、批量操作工具栏。
  - 列选择器支持选择数据库字段以及新增派生列（填写表达式或简单模板）。
  - 支持 `保存` / `另存为`，将当前列配置与筛选条件保存为视图。

## 数据模型

- 新表：`customer_lists`
  - id: int (主键)
  - name: string
  - user_id: int（拥有者）
  - shared: bool（是否共享）
  - config: JSON（包含 columns: [{key, label, width, order, type}], filters, sorts 等）
  - created_at, updated_at

- 行数据直接使用现有的 `customers` 表，不复制客户数据。

## 后端 API（草案）

- GET /api/customer-lists
  - 查询参数：?page=1&limit=20
  - 返回：当前用户的已保存视图（含可见的共享视图）

- POST /api/customer-lists
  - Body: {name, shared, config}
  - 创建视图

- GET /api/customer-lists/{id}
  - 返回视图元数据与配置

- PUT /api/customer-lists/{id}
  - 更新视图名称 / 配置 / 共享状态（仅拥有者或有权限者）

- DELETE /api/customer-lists/{id}
  - 删除视图（仅拥有者）

- GET /api/customer-lists/{id}/rows
  - 查询参数：?page=1&limit=50&search=&filters={...}&sort={...}
  - 返回：根据视图配置选择列并分页返回 `customers` 行

- POST /api/customer-lists/{id}/export
  - 基于当前配置触发 CSV/XLSX 导出，返回文件链接或流式下载

## 后端实现要点

- 在 `app/services/` 下新增 `CustomerListService`，负责视图的 CRUD 与将 `config` 翻译为 SQL 查询（选择指定列、应用筛选与排序）。
- 使用 SQLAlchemy 构造动态查询，按需只 select 指定列，例如：`select(Customer.col1, Customer.col2...)`。
- 对于派生列（如 `Budget Range`），优先在 SQL 层使用表达式；若无法实现则在 Python 层在 fetch 后计算。
- 分页采用 limit/offset，并返回总数供 UI 显示分页控件。
- 权限检查：确保只有拥有者可以编辑/删除；共享视图根据业务规则对其他用户可见（若多租户需按组织隔离）。

## 前端（UI）要点

- 推荐使用成熟的表格组件（例如 AG Grid、TanStack Table）以支持虚拟化、大数据量时的性能与列拖拽。
- 列选择器：展示可选的数据库字段，并支持新增派生列（弹窗填写列名与表达式/模板）。
- 视图保存对话：输入视图名称、是否共享、描述等。
- 导出：调用后端导出接口并提供下载。

## 示例配置（config JSON）

```json
{
  "columns": [
    {"key": "name", "label": "姓名", "width": 220, "order": 1},
    {"key": "phone", "label": "电话", "width": 140, "order": 2},
    {"key": "budget_range", "label": "预算区间", "width": 120, "order": 3, "type": "derived", "expression": "${budget_min}-${budget_max}"}
  ],
  "filters": {"status": "new"},
  "sort": [{"key": "last_contacted", "dir": "desc"}]
}
```

## 数据库迁移

- 新增 Alembic 迁移，创建 `customer_lists` 表，`config` 字段为 JSON 类型。

## 后续实施步骤（建议）

1. 创建 DB migration 与 `CustomerList` ORM 模型。
2. 实现 `CustomerListService` 的 CRUD，以及将 `config` 转为查询的逻辑。
3. 新增 API 路由 `app/routers/customer_lists.py` 并实现权限校验。
4. 前端：在导航加入 `客户列表`，实现列表页面、列配置 UI 与网格渲染。
5. 增加导出接口与相应的单元/集成测试。

---

如果你需要，我可以立刻为你生成：
- Alembic 迁移与模型代码样板，或
- 后端 API 路由与 service 的骨架实现（含简单单元测试），或
- 前端组件的设计草图与示例代码。

请选择下一步要我代劳的項目。
 